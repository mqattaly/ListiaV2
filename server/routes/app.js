// ─── مسیرهای اصلی اپ: داشبورد، تأمین‌کننده‌ها، محصولات، جستجو، برآورد ─────────
import { Router } from "express";
import multer from "multer";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import {
  all,
  get,
  run,
  getUserById,
  ftsEnabled,
} from "../lib/db.js";
import {
  UNIT_TYPES,
  parseAmount,
  storeAmount,
  estimateAmountForStorage,
  detectPriceUnit,
  safeHttpUrl,
  shamsiLabel,
  todayISO,
  clampText,
} from "../lib/utils.js";
import {
  userSuppliers,
  userProducts,
  accessibleOwnerIds,
  activeCountsBySupplier,
  dashboardCounters,
  recentProductNames,
  recentActiveProducts,
  ownerCache,
  getUserLimits,
  ownedSupplier,
  ownedProduct,
  productPayload,
  estimateRowTotal,
  estimateSnapshot,
  remainingQty,
  applyNextQty,
  restoreNextQty,
  archiveProductToday,
  unarchiveProduct,
} from "../lib/queries.js";
import { importRows } from "../lib/importer.js";
import { priceSearch } from "../lib/priceSearch.js";

const router = Router();

const upload = multer({
  // فایل روی دیسک موقت می‌نشیند نه RAM (جلوگیری از اشغال صدها مگابایت با آپلود هم‌زمان)
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, _file, cb) =>
      cb(null, `listia-import-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function jsonError(res, message, status = 400, extra = null) {
  return res.status(status).json({ success: false, message, ...(extra ?? {}) });
}

function requireLicenseForProduct(res, limits) {
  if (!limits.can_add_product) {
    let msg = "سقف نسخه آزمایشی (۵ محصول) تکمیل شده است. برای ثبت محصول جدید باید لایسنس لیستیا را تهیه کنید.";
    if (limits.is_expired) {
      msg = "مدت زمان لایسنس شما به پایان رسیده است. جهت ثبت محصولات بیشتر، لایسنس خود را تمدید فرمایید.";
    }
    return jsonError(res, msg, 403, { license_locked: true });
  }
  return null;
}

// ─── داشبورد ─────────────────────────────────────────────────────────────────
router.get("/dashboard", (req, res) => {
  const userId = req.user.id;
  const suppliers = userSuppliers(userId);
  const counters = dashboardCounters(userId, suppliers);
  const recent = recentActiveProducts(userId, 15);
  const owners = ownerCache(recent);

  res.json({
    success: true,
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      owner_id: s.owner_id,
      owner_username: s.owner_username,
      owner_name: (s.owner_name ?? "").trim(),
      active_count: counters.suppliers[s.id] ?? 0,
    })),
    product_names: recentProductNames(userId),
    active_count: counters.active_count,
    archived_count: counters.archived_count,
    supplier_count: counters.supplier_count,
    recent: recent.map((p) => productPayload(p, null, req.user, owners)),
    limits: getUserLimits(req.user),
    today_label: shamsiLabel(todayISO()),
  });
});

router.get("/dashboard/stats", (req, res) => {
  const suppliers = userSuppliers(req.user.id);
  const counters = dashboardCounters(req.user.id, suppliers);
  res.json({
    success: true,
    active_count: counters.active_count,
    archived_count: counters.archived_count,
    supplier_count: counters.supplier_count,
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      active_count: counters.suppliers[s.id] ?? 0,
    })),
  });
});

// ─── تأمین‌کننده‌ها ──────────────────────────────────────────────────────────
router.get("/suppliers", (req, res) => {
  const suppliers = userSuppliers(req.user.id);
  const counts = activeCountsBySupplier(req.user.id);
  res.json({
    success: true,
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      owner_id: s.owner_id,
      owner_username: s.owner_username,
      owner_name: (s.owner_name ?? "").trim(),
      active_count: counts[s.id] ?? 0,
    })),
    limits: getUserLimits(req.user),
    units: UNIT_TYPES,
  });
});

router.post("/suppliers", (req, res) => {
  const limits = getUserLimits(req.user);
  if (!limits.can_add_supplier) {
    let msg = "سقف نسخه آزمایشی (۱ تأمین‌کننده) تکمیل شده است. برای ثبت تأمین‌کنندگان بیشتر باید لایسنس لیستیا را تهیه کنید.";
    if (limits.is_expired) {
      msg = "مدت زمان لایسنس شما به پایان رسیده است. جهت ثبت تأمین‌کنندگان بیشتر، لایسنس خود را تمدید فرمایید.";
    }
    return jsonError(res, msg, 403, { license_locked: true });
  }
  const name = String((req.body ?? {}).name ?? "").trim();
  if (!name) return jsonError(res, "نام تأمین‌کننده را وارد کنید.");
  const existing = get(
    "SELECT id FROM suppliers WHERE owner_id = ? AND lower(name) = lower(?)",
    req.user.id,
    name
  );
  if (existing) return jsonError(res, "این تأمین‌کننده قبلاً ثبت شده است.");
  const info = run("INSERT INTO suppliers (owner_id, name) VALUES (?, ?)", req.user.id, name);
  res.json({ success: true, message: "تأمین‌کننده ثبت شد", id: Number(info.lastInsertRowid), name });
});

router.get("/suppliers/:id", (req, res) => {
  const supplier = ownedSupplier(req.user.id, req.params.id);
  if (!supplier) return jsonError(res, "تأمین‌کننده پیدا نشد.", 404);

  const active = all(
    `SELECT p.*, s.name AS supplier_name FROM products p
       JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.supplier_id = ? AND (p.ordered = 0 OR p.ordered IS NULL)
      ORDER BY p.id DESC`,
    supplier.id
  );
  const archived = all(
    `SELECT p.*, s.name AS supplier_name FROM products p
       JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.supplier_id = ? AND p.ordered = 1
      ORDER BY p.ordered_date DESC, p.id DESC`,
    supplier.id
  );

  const owners = ownerCache([...active, ...archived]);
  const groups = {};
  for (const item of archived) {
    const isoKey = item.ordered_date ? String(item.ordered_date).slice(0, 10) : "unknown";
    const label = item.ordered_date ? shamsiLabel(item.ordered_date) : "بدون تاریخ";
    if (!groups[isoKey]) groups[isoKey] = { label, products: [] };
    groups[isoKey].products.push(productPayload(item, supplier.name, req.user, owners));
  }

  const suppliers = userSuppliers(req.user.id).map((s) => ({ id: s.id, name: s.name }));
  res.json({
    success: true,
    supplier: {
      id: supplier.id,
      name: supplier.name,
      owner_id: supplier.owner_id,
      owner_username: supplier.owner_username,
      owner_name: (supplier.owner_name ?? "").trim(),
    },
    suppliers,
    products: active.map((p) => productPayload(p, supplier.name, req.user, owners)),
    groups,
    today_iso: todayISO(),
    today_label: shamsiLabel(todayISO()),
    limits: getUserLimits(req.user),
  });
});

router.post("/suppliers/:id/edit", (req, res) => {
  const supplier = ownedSupplier(req.user.id, req.params.id);
  if (!supplier) return jsonError(res, "تأمین‌کننده پیدا نشد.", 404);
  const newName = String((req.body ?? {}).name ?? "").trim().slice(0, 200);
  if (!newName) return jsonError(res, "نام تأمین‌کننده را وارد کنید.");
  const clash = get(
    "SELECT id FROM suppliers WHERE owner_id = ? AND lower(name) = lower(?) AND id != ?",
    supplier.owner_id,
    newName,
    supplier.id
  );
  if (clash) return jsonError(res, "این نام قبلاً ثبت شده است.");
  run("UPDATE suppliers SET name = ? WHERE id = ?", newName, supplier.id);
  res.json({ success: true, message: "نام تأمین‌کننده به‌روزرسانی شد", id: supplier.id, name: newName });
});

router.post("/suppliers/:id/delete", (req, res) => {
  const supplier = ownedSupplier(req.user.id, req.params.id);
  if (!supplier) return jsonError(res, "تأمین‌کننده پیدا نشد.", 404);
  run("DELETE FROM suppliers WHERE id = ?", supplier.id);
  res.json({ success: true, message: "تأمین‌کننده و همه‌ی محصولاتش حذف شد." });
});

// ─── خریدها ──────────────────────────────────────────────────────────────────
router.get("/purchases", (req, res) => {
  const products = userProducts(req.user.id, { ordered: false });
  products.sort((a, b) => {
    const fa = a.supplier_name ?? "";
    const fb = b.supplier_name ?? "";
    return fa.localeCompare(fb, "fa") || a.id - b.id;
  });
  const suppliers = userSuppliers(req.user.id).map((s) => ({
    id: s.id,
    name: s.name,
    owner_id: s.owner_id,
  }));
  const owners = ownerCache(products);
  res.json({
    success: true,
    products: products.map((p) => productPayload(p, null, req.user, owners)),
    suppliers,
    limits: getUserLimits(req.user),
    product_names: recentProductNames(req.user.id),
  });
});

// ─── ثبت محصول جدید ─────────────────────────────────────────────────────────
function readProductForm(body) {
  return {
    supplier_id: body.supplier ?? body.supplier_id ?? "",
    product_name: clampText(body.product ?? body.product_name ?? "", 300),
    quantity: clampText(body.quantity ?? "", 50),
    unit: String(body.unit ?? ""),
    description: clampText(body.description ?? "", 500),
  };
}

router.post("/products", (req, res) => {
  const limits = getUserLimits(req.user);
  const lockError = requireLicenseForProduct(res, limits);
  if (lockError) return lockError;

  const fields = readProductForm(req.body ?? {});
  let supplier = null;
  if (!fields.supplier_id) return jsonError(res, "تأمین‌کننده را انتخاب کنید.");
  const ownerIds = accessibleOwnerIds(req.user.id);
  const sid = Number(fields.supplier_id);
  if (!Number.isInteger(sid)) return jsonError(res, "تأمین‌کننده معتبر نیست.");
  supplier = ownerIds.length
    ? get(
        `SELECT * FROM suppliers WHERE id = ? AND owner_id IN (${ownerIds.map(() => "?").join(",")})`,
        sid,
        ...ownerIds
      )
    : null;
  if (!supplier) return jsonError(res, "تأمین‌کننده معتبر نیست.");

  if (!fields.product_name) return jsonError(res, "نام محصول را وارد کنید.");
  if (!fields.quantity) return jsonError(res, "تعداد را وارد کنید.");
  if (!UNIT_TYPES.includes(fields.unit)) return jsonError(res, "نوع تعداد را انتخاب کنید.");

  // محصول به صاحب تأمین‌کننده تعلق می‌گیرد (داده‌ی اشتراکی)
  const productOwnerId = supplier.owner_id || req.user.id;
  if (productOwnerId !== req.user.id) {
    const owner = getUserById(productOwnerId);
    const ownerLimits = getUserLimits(owner);
    if (!ownerLimits.can_add_product) {
      return jsonError(res, "سقف محصولات صاحب این تأمین‌کننده پر شده است.", 403, {
        license_locked: true,
      });
    }
  }

  const info = run(
    `INSERT INTO products (owner_id, supplier_id, product_name, quantity, unit, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    productOwnerId,
    supplier.id,
    fields.product_name,
    fields.quantity,
    fields.unit,
    fields.description
  );
  const created = get(
    `SELECT p.*, s.name AS supplier_name FROM products p
       JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
    Number(info.lastInsertRowid)
  );
  res.json({
    success: true,
    message: "خرید ثبت شد",
    product: productPayload(created, null, req.user),
  });
});

router.post("/products/:id/edit", (req, res) => {
  const product = ownedProduct(req.user.id, req.params.id);
  if (!product) return jsonError(res, "محصول پیدا نشد.", 404);

  const body = req.body ?? {};
  const name = String(body.product ?? body.product_name ?? "").trim();
  const quantity = String(body.quantity ?? "").trim();
  const unit = String(body.unit ?? "");
  const description = String(body.description ?? "").trim();
  const supplierId = body.supplier_id ?? body.supplier ?? null;

  if (!name || !quantity || !UNIT_TYPES.includes(unit)) {
    return jsonError(res, "اطلاعات محصول کامل نیست.");
  }

  if (supplierId) {
    const ownerIds = accessibleOwnerIds(req.user.id);
    const target = ownerIds.length
      ? get(
          `SELECT * FROM suppliers WHERE id = ? AND owner_id IN (${ownerIds.map(() => "?").join(",")})`,
          Number(supplierId),
          ...ownerIds
        )
      : null;
    if (target) {
      run("UPDATE products SET supplier_id = ?, owner_id = ? WHERE id = ?", [
        target.id,
        target.owner_id || req.user.id,
        product.id,
      ]);
    }
  }

  run(
    "UPDATE products SET product_name = ?, quantity = ?, unit = ?, description = ? WHERE id = ?",
    name.slice(0, 300),
    quantity.slice(0, 50),
    unit,
    description.slice(0, 500),
    product.id
  );
  const fresh = get(
    `SELECT p.*, s.name AS supplier_name FROM products p
       JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
    product.id
  );
  res.json({ success: true, message: "محصول به‌روزرسانی شد", product: productPayload(fresh, null, req.user) });
});

router.post("/products/:id/delete", (req, res) => {
  const product = ownedProduct(req.user.id, req.params.id);
  if (!product) return jsonError(res, "محصول پیدا نشد.", 404);
  run("DELETE FROM products WHERE id = ?", product.id);
  res.json({ success: true, message: "محصول حذف شد." });
});

router.get("/products/:id/info", (req, res) => {
  const product = ownedProduct(req.user.id, req.params.id);
  if (!product) return jsonError(res, "محصول پیدا نشد.", 404);
  res.json({ success: true, product: productPayload(product, null, req.user) });
});

router.post("/products/:id/toggle-order", (req, res) => {
  const product = ownedProduct(req.user.id, req.params.id);
  if (!product) return jsonError(res, "محصول پیدا نشد.", 404);
  archiveProductToday(product.id);
  const fresh = get(
    `SELECT p.*, s.name AS supplier_name FROM products p
       JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
    product.id
  );
  res.json({ success: true, message: "به بایگانی امروز منتقل شد", product: productPayload(fresh, null, req.user) });
});

router.post("/products/:id/unarchive", (req, res) => {
  const product = ownedProduct(req.user.id, req.params.id);
  if (!product) return jsonError(res, "محصول پیدا نشد.", 404);
  unarchiveProduct(product.id);
  const fresh = get(
    `SELECT p.*, s.name AS supplier_name FROM products p
       JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
    product.id
  );
  res.json({ success: true, message: "به لیست فعال برگشت", product: productPayload(fresh, null, req.user) });
});

// حذف گروه بایگانی یک تأمین‌کننده در یک تاریخ
router.post("/suppliers/:id/archive/:date/delete", (req, res) => {
  const supplier = ownedSupplier(req.user.id, req.params.id);
  if (!supplier) return jsonError(res, "تأمین‌کننده پیدا نشد.", 404);
  const dateStr = String(req.params.date ?? "");
  if (dateStr === "unknown") {
    run(
      "DELETE FROM products WHERE supplier_id = ? AND ordered = 1 AND ordered_date IS NULL",
      supplier.id
    );
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return jsonError(res, "تاریخ نامعتبر است.");
    run("DELETE FROM products WHERE supplier_id = ? AND ordered = 1 AND ordered_date = ?", [
      supplier.id,
      dateStr,
    ]);
  }
  res.json({ success: true, message: "گروه بایگانی حذف شد." });
});

// ─── بررسی تکراری ───────────────────────────────────────────────────────────
router.get("/check-duplicate", (req, res) => {
  const productName = String(req.query.product ?? "").trim();
  const currentSupplierId = String(req.query.supplier ?? "");
  if (!productName) return res.json({ matches: [] });

  const ids = accessibleOwnerIds(req.user.id);
  if (!ids.length) return res.json({ matches: [] });
  const matches = all(
    `SELECT p.*, s.name AS supplier_name FROM products p
       JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.owner_id IN (${ids.map(() => "?").join(",")})
        AND (p.ordered = 0 OR p.ordered IS NULL)
        AND lower(p.product_name) = lower(?)`,
    ...ids,
    productName
  );
  res.json({
    matches: matches.map((m) => ({
      id: m.id,
      supplier_name: m.supplier_name,
      quantity: m.quantity,
      unit: m.unit,
      same_supplier: String(m.supplier_id) === currentSupplierId,
    })),
  });
});

// ─── جستجو ───────────────────────────────────────────────────────────────────
router.get("/search", (req, res) => {
  const query = String(req.query.q ?? "").trim();
  if (!query || query.length < 2) return res.json({ results: [], suppliers: [] });

  const ids = accessibleOwnerIds(req.user.id);
  if (!ids.length) return res.json({ results: [], suppliers: [] });
  const ph = ids.map(() => "?").join(",");
  const pattern = `%${query}%`;

  // جستجوی محصولات: FTS5 (ایندکس کامل‌متن) در صورت دسترس، وگرنه LIKE
  let matches = [];
  let usedFts = false;
  const matchTokens = query.match(/[؀-ۿݐ-ݿA-Za-z0-9‌]+/g) || query.match(/[\u0600-\u06FF\u0750-\u077F\w]+/g);
  if (ftsEnabled && matchTokens?.length) {
    try {
      // فقط حروف/اعداد مجازند (جلوگیری از خطای نحوی MATCH)؛ فیلر مالک هم
      // داخل MATCH می‌رود تا FTS همه‌ی کاربران را نپوید.
      const safeTokens = matchTokens
        .slice(0, 8)
        .map((t) => `"${t.replace(/["*]/g, "")}"*`);
      const textExpr = safeTokens.join(" ");
      const ownerExpr = ids.map((id) => `oid:${Number(id)}`).join(" OR ");
      const matchExpr = `${textExpr} AND (${ownerExpr})`;
      matches = all(
        `SELECT p.*, s.name AS supplier_name FROM products_fts f
           JOIN products p ON p.id = f.rowid
           JOIN suppliers s ON s.id = p.supplier_id
          WHERE products_fts MATCH ?
          ORDER BY p.ordered ASC, p.id DESC LIMIT 50`,
        matchExpr
      );
      usedFts = true;
    } catch {
      matches = [];
    }
  }
  if (!usedFts) {
    matches = all(
      `SELECT p.*, s.name AS supplier_name FROM products p
         JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.owner_id IN (${ph}) AND lower(p.product_name) LIKE lower(?)
        ORDER BY p.ordered ASC, p.id DESC LIMIT 50`,
      ...ids,
      pattern
    );
  }

  // محصولاتِ تأمین‌کنندگانی که نام خود تأمین‌کننده با جستجو می‌خورد
  const bySupplierName = all(
    `SELECT p.*, s.name AS supplier_name FROM products p
       JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.owner_id IN (${ph}) AND p.supplier_id IN
            (SELECT id FROM suppliers WHERE owner_id IN (${ph}) AND lower(name) LIKE lower(?))
      ORDER BY p.ordered ASC, p.id DESC LIMIT 50`,
    ...ids,
    ...ids,
    pattern
  );

  const seenIds = new Set(matches.map((m) => m.id));
  for (const row of bySupplierName) {
    if (!seenIds.has(row.id)) {
      matches.push(row);
      seenIds.add(row.id);
    }
  }
  matches.sort(
    (a, b) => Number(a.ordered) - Number(b.ordered) || b.id - a.id
  );
  matches = matches.slice(0, 50);

  const matchingSuppliers = all(
    `SELECT * FROM suppliers WHERE owner_id IN (${ph}) AND lower(name) LIKE lower(?)
      ORDER BY name LIMIT 8`,
    ...ids,
    pattern
  );
  const counts = activeCountsBySupplier(req.user.id);
  const owners = ownerCache(matches);

  res.json({
    results: matches.map((m) => productPayload(m, null, req.user, owners)),
    suppliers: matchingSuppliers.map((s) => ({
      id: s.id,
      name: s.name,
      active_count: counts[s.id] ?? 0,
    })),
  });
});

// ─── برآورد / تخمین قیمت ────────────────────────────────────────────────────
router.get("/estimate", (req, res) => {
  res.json(estimateSnapshot(req.user.id, req.query.supplier_id ?? null));
});

router.post("/estimate/item/:id", (req, res) => {
  const product = ownedProduct(req.user.id, req.params.id);
  if (!product) return jsonError(res, "محصول پیدا نشد.", 404);
  const body = req.body ?? {};
  // حفظ فیلتر تأمین‌کننده در اسنپ‌شات پاسخ تا پس از انتخاب قیمت، فیلتر نپرد
  const supplierFilter = body.supplier_id ?? null;
  let priceUnitNote = "";
  let priceCleared = false;
  try {
    if ("unit_price" in body) {
      const value = estimateAmountForStorage(body.unit_price, "قیمت");
      if (value && detectPriceUnit(body.unit_price) === "rial") {
        priceUnitNote = "مبلغ ریالی به تومان تبدیل و ذخیره شد.";
      }
      priceCleared = value === null;
      run("UPDATE products SET unit_price = ? WHERE id = ?", value, product.id);
      product.unit_price = value;
    }
    if ("qty_per_unit" in body) {
      const value = estimateAmountForStorage(body.qty_per_unit, "تعداد در واحد");
      run("UPDATE products SET qty_per_unit = ? WHERE id = ?", value, product.id);
      product.qty_per_unit = value;
    }
  } catch (err) {
    return jsonError(res, err.message);
  }
  if ("price_url" in body) {
    const url = (safeHttpUrl(body.price_url) || "").slice(0, 500);
    run("UPDATE products SET price_url = ? WHERE id = ?", url, product.id);
    product.price_url = url;
  } else if (priceCleared && product.price_url) {
    // قیمت پاک شد ولی لینک نه ← لینکِ بی‌قیمت بی‌معنی است، خودش پاک می‌شود
    run("UPDATE products SET price_url = ? WHERE id = ?", "", product.id);
    product.price_url = "";
  }
  const snapshot = estimateSnapshot(req.user.id, supplierFilter);
  snapshot.product = productPayload(product, null, req.user);
  if (priceUnitNote) snapshot.price_unit_note = priceUnitNote;
  res.json(snapshot);
});

router.post("/estimate/budget", (req, res) => {
  let note = "";
  try {
    const rawBudget = (req.body ?? {}).budget;
    const value = estimateAmountForStorage(rawBudget, "سقف بودجه");
    if (value && detectPriceUnit(rawBudget) === "rial") {
      note = "بودجه‌ی ریالی به تومان تبدیل و ذخیره شد.";
    }
    run("UPDATE users SET estimate_budget = ? WHERE id = ?", value, req.user.id);
  } catch (err) {
    return jsonError(res, err.message);
  }
  const snap = estimateSnapshot(req.user.id, (req.body ?? {}).supplier_id ?? null);
  if (note) snap.price_unit_note = note;
  res.json(snap);
});

router.post("/estimate/next/:id", (req, res) => {
  const product = ownedProduct(req.user.id, req.params.id);
  if (!product) return jsonError(res, "محصول پیدا نشد.", 404);
  const sent = applyNextQty(product, (req.body ?? {}).qty);
  if (sent <= 0) return jsonError(res, "تعداد معتبری برای انتقال باقی نمانده است.");
  const snapshot = estimateSnapshot(req.user.id, (req.body ?? {}).supplier_id ?? null);
  snapshot.product = productPayload(product, null, req.user);
  snapshot.sent = sent;
  snapshot.sent_label = storeAmount(sent);
  res.json(snapshot);
});

router.post("/estimate/next/:id/restore", (req, res) => {
  const product = ownedProduct(req.user.id, req.params.id);
  if (!product) return jsonError(res, "محصول پیدا نشد.", 404);
  const restored = restoreNextQty(product, (req.body ?? {}).qty);
  if (restored <= 0) return jsonError(res, "موردی در خرید بعدی برای بازگرداندن نیست.");
  const snapshot = estimateSnapshot(req.user.id, (req.body ?? {}).supplier_id ?? null);
  snapshot.product = productPayload(product, null, req.user);
  snapshot.restored = restored;
  snapshot.restored_label = storeAmount(restored);
  res.json(snapshot);
});

router.post("/estimate/trim-to-budget", (req, res) => {
  const supplierId = (req.body ?? {}).supplier_id ?? null;
  const snapshot = estimateSnapshot(req.user.id, supplierId);
  const budget = parseAmount(snapshot.budget) ?? 0;
  if (budget <= 0) return jsonError(res, "ابتدا سقف بودجه را وارد کنید.");
  if (!snapshot.over_budget) return res.json(snapshot);

  let products = userProducts(req.user.id, { ordered: false });
  products.sort(
    (a, b) => (a.supplier_name ?? "").localeCompare(b.supplier_name ?? "", "fa") || a.id - b.id
  );
  if (supplierId) {
    const sid = Number(supplierId);
    if (sid) products = products.filter((p) => p.supplier_id === sid);
  }

  const currentTotal = () =>
    products.reduce((sum, p) => (remainingQty(p) > 0 ? sum + estimateRowTotal(p) : sum), 0);

  const moved = [];
  for (let i = products.length - 1; i >= 0; i--) {
    const product = products[i];
    const total = currentTotal();
    if (total <= budget) break;
    const remaining = remainingQty(product);
    if (remaining <= 0) continue;
    const rowTotal = estimateRowTotal(product);
    if (rowTotal <= 0) continue;
    const excess = total - budget;
    const unitCost = rowTotal / remaining;
    if (unitCost <= 0) continue;
    const need = excess / unitCost;
    const send = Math.abs(need - Math.floor(need)) < 1e-9
      ? Math.floor(need)
      : Math.floor(need) + 1;
    const clamped = Math.min(Math.max(send, 1), remaining);
    const actually = applyNextQty(product, clamped);
    if (actually > 0) {
      moved.push({ id: product.id, qty: actually, name: product.product_name });
    }
  }

  const out = estimateSnapshot(req.user.id, supplierId);
  out.moved = moved;
  res.json(out);
});

router.get("/estimate/search", ah(async (req, res) => {
  const query = String(req.query.q ?? req.query.query ?? "").trim();
  const site = String(req.query.url ?? req.query.site ?? "").trim();
  const source = String(req.query.source ?? "").trim();
  if (!query) return jsonError(res, "عبارت جستجو را وارد کنید.");
  try {
    const data = await priceSearch(query, site, source);
    res.json({ success: true, ...data });
  } catch (err) {
    return jsonError(res, err.message);
  }
}));

// ─── ایمپورت ────────────────────────────────────────────────────────────────
router.post(
  "/import",
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file || !req.file.originalname) {
      return jsonError(res, "فایلی انتخاب نشده است.");
    }
    const filename = String(req.file.originalname).toLowerCase();
    if (!/\.(csv|xlsx|xlsm|xls)$/.test(filename)) {
      await fs.unlink(req.file.path).catch(() => {});
      return jsonError(res, "فقط فایل CSV یا Excel مجاز است.");
    }
    try {
      const buffer = await fs.readFile(req.file.path);
      const result = await importRows(req.user, buffer, filename);
      res.json({ ...result, limits: getUserLimits(req.user) });
    } catch (err) {
      return jsonError(res, `خطا در خواندن فایل. قالب را بررسی کنید. (${err.message})`);
    } finally {
      await fs.unlink(req.file.path).catch(() => {});
    }
  })
);

router.get("/units", (_req, res) => {
  res.json({ success: true, units: UNIT_TYPES });
});

export default router;

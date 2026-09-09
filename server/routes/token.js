// ─── API کلیددار — ثبت سریع از بیرون اپ (Shortcuts آیفون و…) ─────────────────
import { Router } from "express";
import { get, run, all, getUserByToken } from "../lib/db.js";
import { UNIT_TYPES, normalizeName, clampText } from "../lib/utils.js";
import { FREE_MAX_SUPPLIERS, FREE_MAX_PRODUCTS } from "../lib/licensing.js";
import { isAdminUser, productPayload } from "../lib/queries.js";

const router = Router();

function tokenFromReq(req) {
  let token = String(req.headers["x-api-key"] ?? req.query.key ?? "").trim();
  if (!token) {
    const auth = String(req.headers.authorization ?? "");
    if (auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();
  }
  return token;
}

function userFromApiToken(req) {
  const token = tokenFromReq(req);
  if (!token) return null;
  return getUserByToken(token);
}

function userLicensed(user) {
  return Number(user.is_licensed) === 1 || isAdminUser(user);
}

/** تأمین‌کننده از شناسه/نام — نبود، با بررسی لایسنس ساخته می‌شود. */
function resolveSupplier(user, raw) {
  raw = String(raw ?? "").trim();

  if (/^\d+$/.test(raw)) {
    const found = get(
      "SELECT * FROM suppliers WHERE id = ? AND owner_id = ?",
      parseInt(raw, 10),
      user.id
    );
    if (found) return { supplier: found, created: false, error: null };
  }

  if (raw) {
    const target = normalizeName(raw);
    const rows = all("SELECT * FROM suppliers WHERE owner_id = ?", user.id);
    for (const supplier of rows) {
      if (normalizeName(supplier.name) === target) {
        return { supplier, created: false, error: null };
      }
    }
    if (!userLicensed(user) && rows.length >= FREE_MAX_SUPPLIERS) {
      return {
        supplier: null,
        created: false,
        error: "سقف ۱ تأمین‌کننده نسخه آزمایشی پر شده است. نیاز به لایسنس.",
      };
    }
    const info = run("INSERT INTO suppliers (owner_id, name) VALUES (?, ?)", user.id, raw);
    return {
      supplier: { id: Number(info.lastInsertRowid), name: raw },
      created: true,
      error: null,
    };
  }

  const last = get(
    "SELECT * FROM products WHERE owner_id = ? ORDER BY id DESC LIMIT 1",
    user.id
  );
  if (last) {
    const supplier = get("SELECT * FROM suppliers WHERE id = ?", last.supplier_id);
    if (supplier) return { supplier, created: false, error: null };
  }
  const first = get(
    "SELECT * FROM suppliers WHERE owner_id = ? ORDER BY id LIMIT 1",
    user.id
  );
  if (first) return { supplier: first, created: false, error: null };

  const sCount = Number(
    get("SELECT COUNT(*) AS n FROM suppliers WHERE owner_id = ?", user.id)?.n ?? 0
  );
  if (!userLicensed(user) && sCount >= FREE_MAX_SUPPLIERS) {
    return {
      supplier: null,
      created: false,
      error: "سقف ۱ تأمین‌کننده نسخه آزمایشی پر شده است. نیاز به لایسنس.",
    };
  }
  const info = run("INSERT INTO suppliers (owner_id, name) VALUES (?, ?)", user.id, "نامشخص");
  return {
    supplier: { id: Number(info.lastInsertRowid), name: "نامشخص" },
    created: true,
    error: null,
  };
}

// ─── POST /api/quick-add ─────────────────────────────────────────────────────
router.post("/quick-add", (req, res) => {
  const user = userFromApiToken(req);
  if (!user) return res.status(401).json({ success: false, message: "کلید معتبر نیست." });

  const pCount = Number(
    get("SELECT COUNT(*) AS n FROM products WHERE owner_id = ?", user.id)?.n ?? 0
  );
  if (!userLicensed(user) && pCount >= FREE_MAX_PRODUCTS) {
    return res.status(403).json({
      success: false,
      message:
        "سقف ۵ محصول در نسخه آزمایشی تکمیل شده است. برای ثبت محصولات بیشتر باید لایسنس تهیه کنید.",
      license_locked: true,
    });
  }

  const body = req.body ?? {};
  const field = (name, fallback = "") => {
    const value = body[name] ?? req.query[name];
    return String(value ?? fallback).trim();
  };

  const productName = field("product") || field("name") || field("text");
  if (!productName) {
    return res.status(400).json({ success: false, message: "نام محصول را بفرست." });
  }

  const quantity = field("quantity") || field("qty") || "1";
  const unit = field("unit") || UNIT_TYPES[0];
  if (!UNIT_TYPES.includes(unit)) {
    return res.status(400).json({
      success: false,
      message: "واحد باید یکی از این‌ها باشد: " + UNIT_TYPES.join("، "),
    });
  }

  const { supplier, created, error } = resolveSupplier(user, field("supplier"));
  if (error) {
    return res.status(403).json({ success: false, message: error, license_locked: true });
  }

  const info = run(
    `INSERT INTO products (owner_id, supplier_id, product_name, quantity, unit, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    user.id,
    supplier.id,
    clampText(productName, 300),
    clampText(quantity, 50),
    unit,
    clampText(field("description"), 500)
  );
  const product = get(
    `SELECT p.*, s.name AS supplier_name FROM products p
       JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
    Number(info.lastInsertRowid)
  );

  let message = `«${productName}» ${quantity} ${unit} برای ${supplier.name} ثبت شد`;
  if (created) message += " (تأمین‌کننده جدید ساخته شد)";

  res.json({
    success: true,
    message,
    product: productPayload(product, supplier.name, user),
  });
});

// ─── GET /api/suppliers-list ─────────────────────────────────────────────────
router.get("/suppliers-list", (req, res) => {
  const user = userFromApiToken(req);
  if (!user) return res.status(401).json({ success: false, message: "کلید معتبر نیست." });
  const rows = all("SELECT * FROM suppliers WHERE owner_id = ? ORDER BY name", user.id);
  res.json({
    success: true,
    units: UNIT_TYPES,
    suppliers: rows.map((s) => ({ id: s.id, name: s.name })),
  });
});

export default router;

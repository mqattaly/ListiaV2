// ─── هسته‌ی دامنه: سهمیه‌ها، دسترسی اشتراکی، داشبورد، تخمین قیمت ─────────────
import { all, get, run, getUserById } from "./db.js";
import {
  parseAmount,
  formatAmount,
  storeAmount,
  shamsiLabel,
  compareSupplierNames,
  supplierSortKey,
  todayISO,
  parseUtc,
} from "./utils.js";
import {
  FREE_MAX_SUPPLIERS,
  FREE_MAX_PRODUCTS,
  getUserCode,
  adminUsernames,
} from "./licensing.js";

// ─── مدیر و سهمیه ───────────────────────────────────────────────────────────

export function isAdminUser(user) {
  if (!user) return false;
  if (Number(user.is_admin) === 1) return true;
  const names = adminUsernames();
  return names.has(String(user.username ?? "").toLowerCase());
}

/** وضعیت سهمیه، مدت اعتبار و لایسنس کاربر — پورت get_user_limits */
export function getUserLimits(user, sCount = null, pCount = null) {
  if (!user) {
    return {
      is_licensed: false,
      is_admin: false,
      is_expired: false,
      is_lifetime: false,
      user_code: "",
      supplier_count: 0,
      product_count: 0,
      max_suppliers: FREE_MAX_SUPPLIERS,
      max_products: FREE_MAX_PRODUCTS,
      can_add_supplier: false,
      can_add_product: false,
      license_type: "free",
      licensed_at: null,
      license_expires_at: null,
      expires_at_label: null,
      remaining_days: null,
      license_key: null,
    };
  }

  const admin = isAdminUser(user);
  let isLic = Boolean(Number(user.is_licensed) === 1 || admin);
  let isExpired = false;
  let isLifetime = false;
  let remainingDays = null;
  let expiresLabel = null;

  const expiresRaw = user.license_expires_at;
  const expiresAt = parseUtc(expiresRaw);

  if (admin) {
    isLic = true;
    isLifetime = true;
  } else if (Number(user.is_licensed) === 1) {
    if (!expiresAt) {
      isLifetime = true;
      isLic = true;
    } else {
      const now = Date.now();
      if (expiresAt.getTime() > now) {
        isLic = true;
        const diffMs = expiresAt.getTime() - now;
        remainingDays = Math.max(1, Math.ceil(diffMs / 86400000));
        expiresLabel = shamsiLabel(expiresRaw);
      } else {
        isLic = false;
        isExpired = true;
        remainingDays = 0;
        expiresLabel = shamsiLabel(expiresRaw);
      }
    }
  }

  if (sCount === null || pCount === null) {
    const row = get(
      `SELECT
         (SELECT COUNT(*) FROM suppliers WHERE owner_id = ?) AS s_count,
         (SELECT COUNT(*) FROM products  WHERE owner_id = ?) AS p_count`,
      user.id,
      user.id
    );
    sCount = Number(row?.s_count ?? 0);
    pCount = Number(row?.p_count ?? 0);
  }

  return {
    is_licensed: isLic,
    is_admin: admin,
    is_expired: isExpired,
    is_lifetime: isLifetime,
    user_code: getUserCode(user.username),
    supplier_count: sCount,
    product_count: pCount,
    max_suppliers: isLic ? null : FREE_MAX_SUPPLIERS,
    max_products: isLic ? null : FREE_MAX_PRODUCTS,
    can_add_supplier: isLic || sCount < FREE_MAX_SUPPLIERS,
    can_add_product: isLic || pCount < FREE_MAX_PRODUCTS,
    license_type: isLic ? user.license_type || "free" : isExpired ? "expired" : "free",
    licensed_at: user.licensed_at ?? null,
    license_expires_at: user.license_expires_at ?? null,
    expires_at_label: expiresLabel,
    remaining_days: remainingDays,
    license_key: user.license_key ?? null,
  };
}

export function cachedLimits(user) {
  return getUserLimits(user);
}

// ─── اشتراک‌گذاری داده ──────────────────────────────────────────────────────

export function sharedOwnerIds(userId) {
  const rows = all("SELECT owner_id FROM shared_access WHERE shared_with_id = ?", userId);
  return rows.map((r) => r.owner_id);
}

/** تمام owner_idهایی که کاربر می‌تواند ببیند: خودش + اشتراکی‌ها */
export function accessibleOwnerIds(userId) {
  if (!userId) return [];
  return [Number(userId), ...sharedOwnerIds(userId)].filter(
    (id, index, arr) => id != null && arr.indexOf(id) === index
  );
}

export function userSuppliers(userId) {
  const ids = accessibleOwnerIds(userId);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = all(
    `SELECT s.*, u.username AS owner_username,
            (u.first_name || ' ' || u.last_name) AS owner_name
       FROM suppliers s JOIN users u ON u.id = s.owner_id
      WHERE s.owner_id IN (${placeholders})
      ORDER BY s.name`,
    ...ids
  );
  return rows.sort((a, b) => compareSupplierNames(a.name, b.name));
}

export function userProducts(userId, { ordered = null, supplierId = null } = {}) {
  const ids = accessibleOwnerIds(userId);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const params = [...ids];
  let sql = `SELECT p.*, s.name AS supplier_name
               FROM products p JOIN suppliers s ON s.id = p.supplier_id
              WHERE p.owner_id IN (${placeholders})`;
  if (ordered === true) sql += " AND p.ordered = 1";
  else if (ordered === false) sql += " AND (p.ordered = 0 OR p.ordered IS NULL)";
  if (supplierId != null) {
    sql += " AND p.supplier_id = ?";
    params.push(Number(supplierId));
  }
  sql += " ORDER BY p.id";
  return all(sql, ...params);
}

export function activeCountsBySupplier(userId) {
  const ids = accessibleOwnerIds(userId);
  if (!ids.length) return {};
  const placeholders = ids.map(() => "?").join(",");
  const rows = all(
    `SELECT supplier_id, COUNT(*) AS total
       FROM products
      WHERE owner_id IN (${placeholders}) AND (ordered = 0 OR ordered IS NULL)
      GROUP BY supplier_id`,
    ...ids
  );
  const map = {};
  for (const row of rows) map[row.supplier_id] = Number(row.total);
  return map;
}

export function dashboardCounters(userId, suppliersArg = null) {
  const ids = accessibleOwnerIds(userId);
  let activeCount = 0;
  let archivedCount = 0;
  const bySupplier = {};
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const rows = all(
      `SELECT supplier_id,
              SUM(CASE WHEN ordered = 1 THEN 1 ELSE 0 END) AS archived_n,
              SUM(CASE WHEN ordered = 1 THEN 0 ELSE 1 END) AS active_n
         FROM products WHERE owner_id IN (${placeholders})
         GROUP BY supplier_id`,
      ...ids
    );
    for (const row of rows) {
      bySupplier[row.supplier_id] = Number(row.active_n ?? 0);
      activeCount += Number(row.active_n ?? 0);
      archivedCount += Number(row.archived_n ?? 0);
    }
  }
  const suppliers = suppliersArg ?? userSuppliers(userId);
  return {
    active_count: activeCount,
    archived_count: archivedCount,
    supplier_count: suppliers.length,
    suppliers: bySupplier,
  };
}

/** چند محصول فعالِ اخیر با LIMIT در خود SQL (نه واکشی همه و برش در JS). */
export function recentActiveProducts(userId, limit = 15) {
  const ids = accessibleOwnerIds(userId);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return all(
    `SELECT p.*, s.name AS supplier_name
       FROM products p JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.owner_id IN (${placeholders}) AND (p.ordered = 0 OR p.ordered IS NULL)
      ORDER BY p.id DESC LIMIT ?`,
    ...ids,
    limit
  );
}

/**
 * کش یک‌جای کاربران صاحب محصول برای رفع کوئری N+1 در productPayload.
 * یک SELECT برای همه‌ی owner_idهای متمایز می‌زند.
 */
export function ownerCache(products = []) {
  const map = new Map();
  const ids = new Set();
  for (const p of products) {
    if (p && p.owner_id != null) ids.add(Number(p.owner_id));
  }
  if (ids.size) {
    const list = [...ids];
    const placeholders = list.map(() => "?").join(",");
    const rows = all(`SELECT * FROM users WHERE id IN (${placeholders})`, ...list);
    for (const u of rows) map.set(Number(u.id), u);
  }
  return {
    get(id) {
      return map.get(Number(id));
    },
  };
}

export function recentProductNames(userId, limit = 150) {
  const ids = accessibleOwnerIds(userId);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = all(
    `SELECT product_name FROM products WHERE owner_id IN (${placeholders}) ORDER BY id DESC LIMIT 600`,
    ...ids
  );
  const seen = [];
  const known = new Set();
  for (const row of rows) {
    const key = String(row.product_name ?? "").trim().toLowerCase();
    if (!key || known.has(key)) continue;
    known.add(key);
    seen.push(row.product_name);
    if (seen.length >= limit) break;
  }
  return seen;
}

// ─── دسترسی به رکوردها ──────────────────────────────────────────────────────

export function ownedSupplier(userId, supplierId) {
  const ids = accessibleOwnerIds(userId);
  if (!ids.length) return null;
  const placeholders = ids.map(() => "?").join(",");
  return (
    get(
      `SELECT * FROM suppliers WHERE id = ? AND owner_id IN (${placeholders})`,
      Number(supplierId),
      ...ids
    ) ?? null
  );
}

export function ownedProduct(userId, productId) {
  const ids = accessibleOwnerIds(userId);
  if (!ids.length) return null;
  const placeholders = ids.map(() => "?").join(",");
  return (
    get(
      `SELECT p.*, s.name AS supplier_name FROM products p
        JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.id = ? AND p.owner_id IN (${placeholders})`,
      Number(productId),
      ...ids
    ) ?? null
  );
}

// ─── payload محصولات ─────────────────────────────────────────────────────────

export function estimateRowTotal(product, qty = null) {
  const qtyValue =
    qty === null ? parseAmount(product.quantity) ?? 0 : parseAmount(qty) ?? 0;
  const price = parseAmount(product.unit_price) ?? 0;
  const per = parseAmount(product.qty_per_unit);
  if (per && per > 0) return qtyValue * per * price;
  return qtyValue * price;
}

export function productPayload(product, supplierName = null, currentUser = null, owners = null) {
  const name = supplierName ?? product.supplier_name ?? "";
  const rowTotal = estimateRowTotal(product);
  const nextRowTotal = estimateRowTotal(product, product.next_qty);
  const payload = {
    id: product.id,
    supplier_id: product.supplier_id,
    supplier_name: name,
    product_name: product.product_name,
    quantity: product.quantity ?? "",
    unit: product.unit ?? "",
    description: product.description ?? "",
    ordered: Number(product.ordered) === 1,
    ordered_date: product.ordered_date ?? null,
    ordered_date_label: shamsiLabel(product.ordered_date),
    owner_id: product.owner_id,
    unit_price: product.unit_price ?? "",
    qty_per_unit: product.qty_per_unit ?? "",
    next_qty: product.next_qty ?? "",
    price_url: product.price_url ?? "",
    is_next_purchase: (parseAmount(product.next_qty) ?? 0) > 0,
    row_total: rowTotal,
    row_total_label: rowTotal ? formatAmount(rowTotal) : "",
    next_row_total: nextRowTotal,
    next_row_total_label: nextRowTotal ? formatAmount(nextRowTotal) : "",
  };
  if (currentUser && product.owner_id !== currentUser.id) {
    payload.is_shared = true;
    const owner = owners ? owners.get(product.owner_id) : getUserById(product.owner_id);
    if (owner) {
      payload.owner_username = owner.username;
      payload.owner_display =
        `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() || owner.username;
    }
  }
  return payload;
}

// ─── تخمین قیمت ──────────────────────────────────────────────────────────────

export function remainingQty(product) {
  return parseAmount(product.quantity) ?? 0;
}
export function heldQty(product) {
  return parseAmount(product.next_qty) ?? 0;
}

/** انتقال مقدار به «خرید بعدی» — پورت _apply_next_qty */
export function applyNextQty(product, sendQty) {
  const remaining = remainingQty(product);
  let send = parseAmount(sendQty);
  if (send === null || send <= 0) send = remaining;
  send = Math.min(Math.max(send, 0), remaining);
  if (send <= 0) return 0;
  run("UPDATE products SET quantity = ?, next_qty = ? WHERE id = ?", [
    storeAmount(remaining - send),
    storeAmount(heldQty(product) + send),
    product.id,
  ]);
  product.quantity = storeAmount(remaining - send);
  product.next_qty = storeAmount(heldQty(product) + send);
  return send;
}

/** بازگرداندن از «خرید بعدی» — پورت _restore_next_qty */
export function restoreNextQty(product, backQty) {
  const held = heldQty(product);
  let back = parseAmount(backQty);
  if (back === null || back <= 0) back = held;
  back = Math.min(Math.max(back, 0), held);
  if (back <= 0) return 0;
  const leftover = held - back;
  run("UPDATE products SET quantity = ?, next_qty = ? WHERE id = ?", [
    storeAmount(remainingQty(product) + back),
    leftover > 0 ? storeAmount(leftover) : "",
    product.id,
  ]);
  product.quantity = storeAmount(remainingQty(product) + back);
  product.next_qty = leftover > 0 ? storeAmount(leftover) : "";
  return back;
}

/** اسنپ‌شات صفحه‌ی برآورد — پورت estimate_snapshot */
export function estimateSnapshot(userId, supplierId = null) {
  let products = userProducts(userId, { ordered: false });
  products.sort(
    (a, b) =>
      compareSupplierNames(a.supplier_name, b.supplier_name) || a.id - b.id
  );
  if (supplierId) {
    const sid = Number(supplierId);
    if (sid) products = products.filter((p) => p.supplier_id === sid);
  }

  const user = getUserById(userId);
  const owners = ownerCache(products);
  const items = [];
  const nextItems = [];
  let grandTotal = 0;
  let pricedItems = 0;
  for (const product of products) {
    const payload = productPayload(product, null, user, owners);
    const remaining = remainingQty(product);
    const held = heldQty(product);
    if (remaining > 0) {
      items.push(payload);
      grandTotal += payload.row_total ?? 0;
      if ((parseAmount(product.unit_price) ?? 0) > 0) pricedItems += 1;
    }
    if (held > 0) nextItems.push(payload);
  }

  const budget = parseAmount(user?.estimate_budget) ?? 0;
  const hasPricedItems = pricedItems > 0;
  const overBudget = Boolean(hasPricedItems && budget > 0 && grandTotal > budget);
  const budgetRemaining = budget > 0 ? Math.max(budget - grandTotal, 0) : 0;
  const budgetProgress = budget > 0 ? Math.min((grandTotal / budget) * 100, 100) : 0;

  return {
    success: true,
    budget: user?.estimate_budget ? storeAmount(user.estimate_budget) : "",
    budget_label: budget ? formatAmount(budget) : "",
    grand_total: grandTotal,
    grand_total_label: grandTotal ? formatAmount(grandTotal) : "0",
    priced_items: pricedItems,
    has_priced_items: hasPricedItems,
    over_budget: overBudget,
    over_by: overBudget ? grandTotal - budget : 0,
    over_by_label: overBudget ? formatAmount(grandTotal - budget) : "",
    budget_remaining: budgetRemaining,
    budget_remaining_label: budgetRemaining ? formatAmount(budgetRemaining) : "0",
    budget_progress: budgetProgress,
    items,
    next_items: nextItems,
    suppliers: userSuppliers(userId).map((s) => ({ id: s.id, name: s.name })),
  };
}

// ─── عملیات بایگانی ─────────────────────────────────────────────────────────

export function archiveProductToday(productId) {
  run("UPDATE products SET ordered = 1, ordered_date = ? WHERE id = ?", [
    todayISO(),
    Number(productId),
  ]);
}

export function unarchiveProduct(productId) {
  run("UPDATE products SET ordered = 0, ordered_date = NULL WHERE id = ?", [
    Number(productId),
  ]);
}

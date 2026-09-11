// ─── داده‌ی نمونه برای نمایش: مدیر + کاربر دمو با تأمین‌کننده و محصول ────────
import { get, run } from "./lib/db.js";
import { hashPassword } from "./lib/auth.js";
import { generateKey } from "./lib/licensing.js";

async function upsertUser({ username, password, first, last, phone, email, admin = false, licensed = false, licenseType = "free", budget = "" }) {
  const existing = get("SELECT * FROM users WHERE username = ?", username);
  if (existing) return existing;
  const info = run(
    `INSERT INTO users (username, password_hash, first_name, last_name, phone, email,
                        email_verified, is_licensed, license_type, is_admin, estimate_budget, api_token)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    username,
    await hashPassword(password),
    first,
    last,
    phone,
    email,
    licensed ? 1 : 0,
    licenseType,
    admin ? 1 : 0,
    budget,
    null
  );
  const user = get("SELECT * FROM users WHERE id = ?", Number(info.lastInsertRowid));
  if (licensed) {
    run(
      "UPDATE users SET license_key = ?, licensed_at = datetime('now') WHERE id = ?",
      generateKey(username, "PRO", "LIFE"),
      user.id
    );
  }
  return user;
}

function addSupplier(ownerId, name) {
  const existing = get("SELECT * FROM suppliers WHERE owner_id = ? AND name = ?", ownerId, name);
  if (existing) return existing;
  const info = run("INSERT INTO suppliers (owner_id, name) VALUES (?, ?)", ownerId, name);
  return get("SELECT * FROM suppliers WHERE id = ?", Number(info.lastInsertRowid));
}

function addProduct(ownerId, supplierId, name, quantity, unit, description = "", extra = {}) {
  const info = run(
    `INSERT INTO products (owner_id, supplier_id, product_name, quantity, unit, description,
                           unit_price, qty_per_unit, price_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ownerId,
    supplierId,
    name,
    quantity,
    unit,
    description,
    extra.unit_price ?? null,
    extra.qty_per_unit ?? null,
    extra.price_url ?? null
  );
  return Number(info.lastInsertRowid);
}

// ─── مدیر و کاربر نمونه ──────────────────────────────────────────────────────
const runSeed = async () => {
const admin = await upsertUser({
  username: "admin",
  password: process.env.ADMIN_PASSWORD || "admin123456",
  first: "مدیر",
  last: "لیستیا",
  phone: "09120000000",
  email: "admin@listia.local",
  admin: true,
  licensed: true,
  licenseType: "UNLIMITED",
});

// ─── کاربر دمو (با لایسنس مادام‌العمر و داده‌ی نمونه) ─────────────────────────
const demo = await upsertUser({
  username: "demo",
  password: "demo123456",
  first: "کاربر",
  last: "نمونه",
  phone: "09121112233",
  email: "demo@listia.local",
  licensed: true,
  licenseType: "PRO",
  budget: "25,000,000",
});

const s1 = addSupplier(demo.id, "هایپراستار");
const s2 = addSupplier(demo.id, "مواد غذایی پارس");
const s3 = addSupplier(demo.id, "لوازم‌خانگی مهر");

addProduct(demo.id, s1.id, "برنج طارم", "۴", "گونی", "برنج هاشمی درجه یک", { unit_price: "4,800,000" });
addProduct(demo.id, s1.id, "روغن سرخ‌کردنی", "12", "عدد", "", { unit_price: "185,000" });
addProduct(demo.id, s1.id, "رب گوجه‌فرنگی", "6", "قوطی", "", { unit_price: "95,000" });
addProduct(demo.id, s1.id, "ماکارونی", "24", "بسته", "", { unit_price: "38,000" });

addProduct(demo.id, s2.id, "شکر", "10", "کیلو", "", { unit_price: "62,000" });
addProduct(demo.id, s2.id, "چای کیسه‌ای", "8", "بسته", "", { unit_price: "145,000" });
addProduct(demo.id, s2.id, "زعفران", "5", "گرم", "نگین قائنات", { unit_price: "1,850,000" });

addProduct(demo.id, s3.id, "جاروبرقی", "1", "عدد", "", { unit_price: "12,500,000", price_url: "https://www.digikala.com" });
addProduct(demo.id, s3.id, "کتری برقی", "2", "عدد", "", { unit_price: "2,300,000" });

// یک محصول بایگانی‌شده
const archived = addProduct(demo.id, s1.id, "پودر لباسشویی", "3", "بسته", "");
run("UPDATE products SET ordered = 1, ordered_date = date('now') WHERE id = ?", archived);

console.log("✓ داده‌ی نمونه آماده شد:");
console.log("  👑 مدیر:        admin / admin123456");
console.log("  👤 کاربر دمو:   demo  / demo123456 (لایسنس PRO مادام‌العمر + داده‌ی نمونه)");
};

runSeed().catch((err) => {
  console.error("خطای ساخت داده‌ی نمونه:", err);
  process.exit(1);
});

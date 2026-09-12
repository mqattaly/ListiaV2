// ─── ساخت داده‌ی واقع‌گرایانه برای ۱۰۰۰ کاربر ───────────────────────────────
// اجرا:  LISTIA_DB=server/data/bench.db node bench/seed-bench.mjs
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../server/lib/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.LISTIA_DB || path.join(__dirname, "..", "server", "data", "bench.db");

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  first_name TEXT DEFAULT '', last_name TEXT DEFAULT '', phone TEXT DEFAULT '',
  email TEXT UNIQUE COLLATE NOCASE, email_verified INTEGER NOT NULL DEFAULT 0,
  email_code_hash TEXT, email_code_sent_at TEXT, email_code_expires_at TEXT,
  api_token TEXT UNIQUE, is_licensed INTEGER NOT NULL DEFAULT 0, license_key TEXT,
  licensed_at TEXT, license_expires_at TEXT, license_type TEXT NOT NULL DEFAULT 'free',
  is_admin INTEGER NOT NULL DEFAULT 0, estimate_budget TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_id, name)
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL, quantity TEXT DEFAULT '', unit TEXT DEFAULT '',
  description TEXT DEFAULT '', ordered INTEGER NOT NULL DEFAULT 0, ordered_date TEXT,
  unit_price TEXT, qty_per_unit TEXT, next_qty TEXT, price_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS shared_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_with_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_id, shared_with_id)
);
CREATE INDEX IF NOT EXISTS idx_products_owner ON products(owner_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_owner ON suppliers(owner_id);
CREATE INDEX IF NOT EXISTS idx_shared_owner ON shared_access(owner_id);
CREATE INDEX IF NOT EXISTS idx_shared_with ON shared_access(shared_with_id);
`);

const N_USERS = Number(process.env.BENCH_USERS || 1000);
const SUPPLIERS_PER_USER = 10;
const PRODUCTS_PER_SUPPLIER = 8; // کاربر عادی: ~۸۰ محصول
const HEAVY_USERS = 10;         // ۱۰ کاربر سنگین
const HEAVY_PRODUCTS = 1500;

const UNITS = ["عدد", "کارتن", "بسته", "گونی", "کیلو"];
const NAMES = ["شیر", "برنج", "روغن", "قند", "چای", "ماست", "پنیر", "تخم‌مرغ", "نوشابه", "آب معدنی",
  "دستمال کاغذی", "مایع ظرفشویی", "شامپو", "رب گوجه", "ماکارونی", "حبوبات", "خرما", "عسل", "قهوه", "نسکافه",
  "کاغذ A4", "خودکار", "پوشه", "منگنه", "چسب", "لامپ LED", "سیم برق", "کلید پریز", "نایلون", "ظرف یکبارمصرف"];
const SUPPLIER_NAMES = ["فروشگاه بهار", "پخش مواد غذایی آرین", "بازرگانی شمال", "شرکت پارس", "تعاون ۲۲",
  "فروشگاه رفاه", "پخش سراسری البرز", "بنگاه کالای تهران", "بازرگانی مهر", "تأمین کالا نگین"];

const hash = await hashPassword("bench123456");
const insUser = db.prepare(`INSERT INTO users
  (username,password_hash,first_name,last_name,phone,email,email_verified,is_licensed,license_type,is_admin)
  VALUES (?,?,?,?,?,?,1,1,'PRO',?)`);
const insSup = db.prepare("INSERT INTO suppliers (owner_id,name) VALUES (?,?)");
const insProd = db.prepare(`INSERT INTO products
  (owner_id,supplier_id,product_name,quantity,unit,description,ordered,ordered_date,unit_price,qty_per_unit,next_qty)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

console.log(`🌱 ساخت ${N_USERS} کاربر …`);
const t0 = Date.now();
db.exec("BEGIN");
for (let i = 1; i <= N_USERS; i++) {
  const uname = `user${String(i).padStart(4, "0")}`;
  insUser.run(uname, hash, "کاربر", `شماره ${i}`, `0912${String(1000000 + i).padStart(7, "0")}`,
    `${uname}@bench.local`, uname === "user0001" ? 1 : 0);
}
db.exec("COMMIT");
console.log(`   کاربران ساخته شد در ${((Date.now()-t0)/1000).toFixed(1)}s`);

console.log("🌱 ساخت تأمین‌کنندگان و محصولات …");
const t1 = Date.now();
db.exec("BEGIN");
for (let uid = 1; uid <= N_USERS; uid++) {
  const isHeavy = uid <= HEAVY_USERS;
  const supCount = isHeavy ? 25 : SUPPLIERS_PER_USER;
  const supIds = [];
  for (let s = 0; s < supCount; s++) {
    const info = insSup.run(uid, `${SUPPLIER_NAMES[s % SUPPLIER_NAMES.length]} ${uid}-${s + 1}`);
    supIds.push(Number(info.lastInsertRowid));
  }
  const totalProducts = isHeavy ? HEAVY_PRODUCTS : supCount * PRODUCTS_PER_SUPPLIER;
  for (let p = 0; p < totalProducts; p++) {
    const sid = supIds[p % supIds.length];
    const name = NAMES[(uid * 7 + p * 3) % NAMES.length] + ` ${p + 1}`;
    const ordered = Math.random() < 0.2 ? 1 : 0;
    const priced = Math.random() < 0.6;
    insProd.run(
      uid, sid, name,
      String(1 + (p % 50)),
      UNITS[p % UNITS.length],
      "",
      ordered,
      ordered ? `2026-0${1 + (p % 9)}-1${p % 9}` : null,
      priced ? String(10000 + ((p * 13791) % 900000)) : "",
      "",
      Math.random() < 0.1 ? String(1 + (p % 10)) : ""
    );
  }
  if (uid % 100 === 0) console.log(`   …${uid}/${N_USERS} کاربر (${((Date.now()-t1)/1000).toFixed(1)}s)`);
}
// چند اشتراک‌گذاری داده بین کاربران
const insShare = db.prepare("INSERT OR IGNORE INTO shared_access (owner_id, shared_with_id) VALUES (?,?)");
for (let i = 2; i <= 50; i++) insShare.run(1, i);
db.exec("COMMIT");

const nU = db.prepare("SELECT COUNT(*) n FROM users").get().n;
const nS = db.prepare("SELECT COUNT(*) n FROM suppliers").get().n;
const nP = db.prepare("SELECT COUNT(*) n FROM products").get().n;
console.log(`\n✅ تمام شد در ${((Date.now()-t1)/1000).toFixed(1)}s`);
console.log(`   کاربران: ${nU} · تأمین‌کنندگان: ${nS} · محصولات: ${nP}`);
const size = db.prepare("PRAGMA page_count").get().data * db.prepare("PRAGMA page_size").get().data;
console.log(`   حجم دیتابیس: ${(size/1024/1024).toFixed(1)} MB`);

#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// انتقال داده از نسخه‌ی پایتون (Flask + SQLAlchemy) به نسخه‌ی جدید (Node.js)
//
// منبع می‌تواند یکی از این دو باشد (خودکار تشخیص داده می‌شود):
//   ۱) دیتابیس ابری PostgreSQL چابکان — با دادن آدرس اتصال (DATABASE_URL):
//        node tools/migrate-from-python.mjs "postgresql://user:pass@host:5432/dbname"
//   ۲) فایل SQLite قدیمی (اگر DATABASE_URL نداشتید):
//        node tools/migrate-from-python.mjs purchase.db
//
// مقصد: دیتابیس جدید — به‌ترتیب اولویت: --new <مسیر> ، متغیر LISTIA_DB ،
//        پیش‌فرض server/data/listia.db
//
// چه چیزی منتقل می‌شود؟
//   · کاربران — با همان رمز عبور قدیمی (هش‌های Werkzeug پایتون پشتیبانی می‌شوند)
//   · وضعیت لایسنس، کلید لایسنس، تاریخ انقضا و سهمیه‌ی برآورد
//   · تامین‌کنندگان، کالاها، وضعیت «خرید زده‌شده» و تاریخ آن (آرشیو خریدها)
//   · اشتراک‌گذاری دیتابیس بین کاربران (shared_access)
//
// اجرای دوباره امن است: کاربر و تامین‌کننده‌ی تکراری ساخته نمی‌شود و فقط
// کالاهایی که قبلاً منتقل نشده‌اند اضافه می‌شوند.
// ─────────────────────────────────────────────────────────────────────────────
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── آرگومان‌ها ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let src = null;
let newArg = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--new") newArg = argv[++i];
  else if (!argv[i].startsWith("--")) src = argv[i];
}
if (!src) {
  console.error("✗ منبع را بدهید — آدرس PostgreSQL یا مسیر فایل SQLite قدیمی:");
  console.error('  node tools/migrate-from-python.mjs "postgresql://user:pass@host:5432/dbname"');
  console.error("  node tools/migrate-from-python.mjs purchase.db [--new <listia.db>]");
  process.exit(1);
}
const isPg = /^postgres(ql)?:\/\//i.test(src);
if (newArg) process.env.LISTIA_DB = path.resolve(newArg);

// ─── اتصال به منبع ───────────────────────────────────────────────────────────
let query, columns, closeSource, markerKey, srcLabel;
if (isPg) {
  const { Client } = await import("pg");
  const url = src.replace(/^postgres:\/\//i, "postgresql://");
  let client;
  try {
    client = new Client({ connectionString: url });
    await client.connect();
  } catch (e) {
    console.error("✗ اتصال به PostgreSQL برقرار نشد:", e.message);
    console.error("  آدرس اتصال (DATABASE_URL سرویس قدیمی) و دسترسی شبکه بین دو سرویس را چک کنید.");
    process.exit(1);
  }
  srcLabel = "دیتابیس ابری PostgreSQL";
  // آدرس حاوی رمز است — در نشانگر انتقال فقط هش آن ذخیره می‌شود
  markerKey = "pg:" + crypto.createHash("sha256").update(url).digest("hex").slice(0, 24);
  query = async (sql, params = []) => (await client.query(sql, params)).rows;
  columns = async (table) =>
    (await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      [table]
    )).rows.map((r) => r.column_name);
  closeSource = async () => { try { await client.end(); } catch {} };
} else {
  const oldPath = path.resolve(src);
  if (!fs.existsSync(oldPath)) {
    console.error(`✗ فایل پیدا نشد: ${oldPath}`);
    process.exit(1);
  }
  const old = new DatabaseSync(oldPath, { readOnly: true });
  srcLabel = `فایل SQLite (${oldPath})`;
  markerKey = "file:" + oldPath;
  query = async (sql) => old.prepare(sql).all();
  columns = async (table) => {
    try { return old.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name); }
    catch { return []; }
  };
  closeSource = async () => { try { old.close(); } catch {} };
}

// دیتابیس جدید + اسکیما (همان ماژول سرور)
const { db, run, get } = await import("../server/lib/db.js");

// ─── ابزارها ─────────────────────────────────────────────────────────────────
const log = (...a) => console.log(...a);
const warnings = [];
const warn = (msg) => { warnings.push(msg); console.log("  ⚠ " + msg); };
const int01 = (v) => (v === null || v === undefined ? 0 : v ? 1 : 0);

// PostgreSQL تاریخ‌ها را به‌صورت شیء Date برمی‌گرداند — به رشته‌ی متنی
// دیتابیس جدید تبدیل می‌کنیم (SQLAlchemy مقادیر naive-UTC ذخیره می‌کرد).
const pad = (n) => String(n).padStart(2, "0");
const d2date = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const d2datetime = (d) => `${d2date(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const norm = (v, col) => {
  if (v instanceof Date) return col === "ordered_date" ? d2date(v) : d2datetime(v);
  return v;
};

log(`\nمنبع: ${srcLabel}`);
log(`مقصد: ${process.env.LISTIA_DB}`);

// جدول کاربران در Flask «user» است (با کوتیشن) — در هر دو دیتابیس معتبر
const USER_TABLE = '"user"';
if (!(await columns("user")).length && !(await columns("users")).length) {
  console.error("✗ جدول کاربران در منبع پیدا نشد — آیا این واقعاً دیتابیس لیستیای پایتون است؟");
  await closeSource();
  process.exit(1);
}
const oldUserTable = (await columns("user")).length ? '"user"' : "users";
const oldUserCols = await columns(oldUserTable.replace(/"/g, ""));

// نشانگر انتقال — برای جلوگیری از کالای تکراری هنگام اجرای دوباره
db.exec(`CREATE TABLE IF NOT EXISTS python_migration (
  source TEXT PRIMARY KEY,
  product_ids TEXT NOT NULL DEFAULT '[]',
  migrated_at TEXT,
  counts TEXT
)`);
const marker = get("SELECT * FROM python_migration WHERE source = ?", markerKey);
const doneProductIds = new Set(marker ? JSON.parse(marker.product_ids || "[]") : []);

// نگاشت نام ستون‌های قدیمی → جدید
const userColMap = {
  username: "username",
  password_hash: "password_hash",
  first_name: "first_name",
  last_name: "last_name",
  phone: "phone",
  email: "email",
  email_verified: "email_verified",
  email_code_hash: "email_verification_code_hash",
  email_code_sent_at: "email_verification_sent_at",
  email_code_expires_at: "email_verification_expires_at",
  api_token: "api_token",
  is_licensed: "is_licensed",
  license_key: "license_key",
  licensed_at: "licensed_at",
  license_expires_at: "license_expires_at",
  license_type: "license_type",
  is_admin: "is_admin",
  estimate_budget: "estimate_budget",
};
const boolish = new Set(["email_verified", "is_licensed", "is_admin"]);

// ─── ۱) کاربران ──────────────────────────────────────────────────────────────
log("\n۱) کاربران…");
const oldUsers = await query(`SELECT * FROM ${oldUserTable} ORDER BY id`);
const userIdMap = new Map();
let usersInserted = 0, usersUpdated = 0;

const pickUserFields = (row) => {
  const fields = {};
  for (const [newCol, oldCol] of Object.entries(userColMap)) {
    let v = oldUserCols.includes(oldCol) ? norm(row[oldCol], oldCol) : null;
    if (boolish.has(newCol)) v = int01(v);
    if (newCol === "license_type" && (v === null || v === undefined || v === "")) v = "free";
    if (newCol === "api_token" && v === "") v = null;
    fields[newCol] = v === undefined ? null : v;
  }
  return fields;
};

const upsertUser = (f) => {
  const existing = get("SELECT id FROM users WHERE lower(username) = lower(?)", f.username);
  const taken = (col, val) =>
    val && get(`SELECT id FROM users WHERE lower(${col}) = lower(?) AND id != ?`, val, existing?.id ?? -1);
  for (const col of ["email", "api_token"]) {
    if (taken(col, f[col])) {
      warn(`«${f.username}»: ${col === "email" ? "ایمیل" : "توکن API"} تکراری بود و منتقل نشد`);
      f[col] = null;
    }
  }
  const cols = Object.keys(f);
  if (existing) {
    run(
      `UPDATE users SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
      [...cols.map((c) => f[c]), existing.id]
    );
    return { id: existing.id, updated: true };
  }
  const r = run(
    `INSERT INTO users (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    cols.map((c) => f[c])
  );
  return { id: Number(r.lastInsertRowid), updated: false };
};

for (const row of oldUsers) {
  const f = pickUserFields(row);
  const { id, updated } = upsertUser(f);
  userIdMap.set(row.id, id);
  updated ? usersUpdated++ : usersInserted++;
}
log(`  ✓ ${usersInserted} کاربر جدید، ${usersUpdated} کاربر موجود به‌روزرسانی شد`);

if (!userIdMap.size) {
  console.error("✗ هیچ کاربری در منبع نبود — چیزی برای انتقال نیست.");
  await closeSource();
  process.exit(1);
}
// صاحب ردیف‌های بی‌صاحب = اولین کاربر قدیمی (مثل خودِ نسخه‌ی پایتون)
const fallbackOwner = userIdMap.get(Math.min(...oldUsers.map((u) => u.id)));

// ─── ۲) تامین‌کنندگان ────────────────────────────────────────────────────────
log("\n۲) تامین‌کنندگان…");
const oldSupplierCols = await columns("supplier");
const oldSuppliers = oldSupplierCols.length
  ? await query("SELECT * FROM supplier ORDER BY id") : [];
const supplierIdMap = new Map();
for (const s of oldSuppliers) {
  const owner = userIdMap.get(s.owner_id) ?? fallbackOwner;
  run(
    "INSERT INTO suppliers (owner_id, name) VALUES (?, ?) ON CONFLICT(owner_id, name) DO NOTHING",
    owner, s.name
  );
  const row = get("SELECT id FROM suppliers WHERE owner_id = ? AND name = ?", owner, s.name);
  supplierIdMap.set(s.id, row.id);
}
log(`  ✓ ${oldSuppliers.length} تامین‌کننده (تکراری‌ها ادغام شدند)`);

// ─── ۳) کالاها ───────────────────────────────────────────────────────────────
log("\n۳) کالاها (شامل وضعیت خرید/آرشیو)…");
const productCols = ["product_name", "quantity", "unit", "description", "ordered",
  "ordered_date", "unit_price", "qty_per_unit", "next_qty", "price_url"];
const oldProductCols = await columns("product");
let prodNew = 0, prodSkipped = 0, prodTotal = 0;
if (oldProductCols.length) {
  const oldProducts = await query("SELECT * FROM product ORDER BY id");
  prodTotal = oldProducts.length;
  for (const p of oldProducts) {
    if (doneProductIds.has(p.id)) { prodSkipped++; continue; }
    const supplierId = supplierIdMap.get(p.supplier_id);
    if (!supplierId) { warn(`کالای «${p.product_name}»: تامین‌کننده‌اش منتقل نشده بود — رد شد`); continue; }
    const owner = userIdMap.get(p.owner_id) ?? fallbackOwner;
    const vals = productCols.map((c) => {
      let v = norm(p[c] === undefined ? null : p[c], c);
      if (c === "ordered") v = int01(v);
      if (typeof v === "string" && v === "") v = c === "product_name" ? "بدون نام" : "";
      return v;
    });
    run(
      `INSERT INTO products (owner_id, supplier_id, ${productCols.join(", ")}) VALUES (?, ?, ${productCols.map(() => "?").join(", ")})`,
      [owner, supplierId, ...vals]
    );
    doneProductIds.add(p.id);
    prodNew++;
  }
}
log(`  ✓ ${prodNew} کالای جدید، ${prodSkipped} کالای قبلاً منتقل‌شده (از مجموع ${prodTotal})`);

// ─── ۴) اشتراک‌گذاری ─────────────────────────────────────────────────────────
log("\n۴) اشتراک‌گذاری دیتابیس بین کاربران…");
let sharedCount = 0;
if ((await columns("shared_access")).length) {
  for (const sh of await query("SELECT * FROM shared_access")) {
    const owner = userIdMap.get(sh.owner_id), shared = userIdMap.get(sh.shared_with_id);
    if (!owner || !shared) { warn("یک ردیف اشتراک‌گذاری به کاربر ناموجود اشاره می‌کرد — رد شد"); continue; }
    run(
      "INSERT INTO shared_access (owner_id, shared_with_id) VALUES (?, ?) ON CONFLICT(owner_id, shared_with_id) DO NOTHING",
      owner, shared
    );
    sharedCount++;
  }
}
log(`  ✓ ${sharedCount} ردیف اشتراک‌گذاری`);

// ─── ثبت نشانگر و گزارش ──────────────────────────────────────────────────────
const counts = JSON.stringify({
  users: oldUsers.length, suppliers: oldSuppliers.length,
  products: prodTotal, shared: sharedCount,
});
run(
  `INSERT INTO python_migration (source, product_ids, migrated_at, counts) VALUES (?, ?, ?, ?)
   ON CONFLICT(source) DO UPDATE SET product_ids = excluded.product_ids, migrated_at = excluded.migrated_at, counts = excluded.counts`,
  markerKey, JSON.stringify([...doneProductIds]), new Date().toISOString(), counts
);
await closeSource();

log("\n════════════════════════════════════════════════════");
log("✅ انتقال کامل شد:");
log(`   کاربران:        ${oldUsers.length}  (رمزهای قدیمی هنوز کار می‌کنند)`);
log(`   تامین‌کنندگان:  ${oldSuppliers.length}`);
log(`   کالاها:         ${prodNew + prodSkipped}  (خریدهای آرشیوشده و تاریخشان حفظ شد)`);
log(`   اشتراک‌گذاری:   ${sharedCount}`);
if (warnings.length) log(`   ⚠ هشدارها: ${warnings.length} مورد (بالای همین گزارش)`);
log("\nقدم بعدی: سرویس را ری‌استارت کنید و با همان نام کاربری و رمز نسخه‌ی قدیمی وارد شوید.");

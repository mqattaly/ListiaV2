// ─── دیتابیس SQLite (node:sqlite داخلی — بدون وابستگی) ──────────────────────
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.LISTIA_DB || path.join(DATA_DIR, "listia.db");
// اگر دیتابیس روی مسیر دیسک مانا (مثلاً /data در چابکان) ست شده باشد،
// پوشه‌اش را هم می‌سازیم تا سرور با «unable to open database file» نیفتد.
fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });
export const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// ─── اسکیما ─────────────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT UNIQUE COLLATE NOCASE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_code_hash TEXT,
  email_code_sent_at TEXT,
  email_code_expires_at TEXT,
  api_token TEXT UNIQUE,
  is_licensed INTEGER NOT NULL DEFAULT 0,
  license_key TEXT,
  licensed_at TEXT,
  license_expires_at TEXT,
  license_type TEXT NOT NULL DEFAULT 'free',
  is_admin INTEGER NOT NULL DEFAULT 0,
  estimate_budget TEXT,
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
  product_name TEXT NOT NULL,
  quantity TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  description TEXT DEFAULT '',
  ordered INTEGER NOT NULL DEFAULT 0,
  ordered_date TEXT,
  unit_price TEXT,
  qty_per_unit TEXT,
  next_qty TEXT,
  price_url TEXT,
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

// ─── پوشش‌های سبک برای کوئری‌ها ─────────────────────────────────────────────
// هر دو سبک run(sql, a, b) و run(sql, [a, b]) پشتیبانی می‌شوند.
function normalizeParams(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}
export function get(sql, ...args) {
  return db.prepare(sql).get(...normalizeParams(args));
}
export function all(sql, ...args) {
  return db.prepare(sql).all(...normalizeParams(args));
}
export function run(sql, ...args) {
  return db.prepare(sql).run(...normalizeParams(args));
}

export function getUserById(id) {
  return get("SELECT * FROM users WHERE id = ?", Number(id));
}
export function getUserByUsername(username) {
  return get("SELECT * FROM users WHERE lower(username) = lower(?)", String(username ?? ""));
}
export function getUserByEmail(email) {
  return get("SELECT * FROM users WHERE lower(email) = lower(?)", String(email ?? ""));
}
export function getUserByToken(token) {
  return get("SELECT * FROM users WHERE api_token = ?", String(token ?? ""));
}

export default db;

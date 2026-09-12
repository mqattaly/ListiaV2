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

// ─── تنظیمات کارایی/پایداری ─────────────────────────────────────────────────
// busy_timeout باید پیش از تغییر journal_mode ست شود تا وقتی چند ورکر هم‌زمان
// روی دیتابیس تازه بالا می‌آیند، تبدیل به WAL با «database is locked» نیفتد.
db.exec("PRAGMA busy_timeout = 10000;"); // هنگام قفل نوشتنِ نمونه‌های دیگر، تا ۱۰ ثانیه صبر کند
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA synchronous = NORMAL;"); // در WAL امن و بسیار سریع‌تر از FULL
db.exec("PRAGMA temp_store = MEMORY;");
db.exec("PRAGMA wal_autocheckpoint = 1000;");
db.exec("PRAGMA mmap_size = 268435456;"); // ۲۵۶ مگابایت نگاشت حافظه
db.exec("PRAGMA cache_size = -20000;"); // کش صفحه‌ها ≈ ۲۰ مگابایت

// ─── قفل بوت چندنمونه‌ای ────────────────────────────────────────────────────
// وقتی چند ورکرِ cluster هم‌زمان روی یک دیتابیس تازه بالا می‌آیند، نباید هم‌زمان
// اسکیما/مهاجرت بسازند (خطای قفل یا یونیک). با یک قفل فایلی سبک، فقط یک ورکر
// مقداردهی می‌کند و بقیه صبر می‌کنند.
const BOOT_LOCK = `${DB_PATH}.boot.lock`;
function acquireBootLock() {
  const start = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(BOOT_LOCK, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch {
      // قفل قدیمیِ متعلق به پراسس مرده را بعد از ۶۰ ثانیه می‌شکنیم
      try {
        const age = Date.now() - fs.statSync(BOOT_LOCK).mtimeMs;
        if (age > 60_000) fs.unlinkSync(BOOT_LOCK);
      } catch {
        /* قفل همین الان آزاد شد؛ دور بعد دوباره تلاش می‌شود */
      }
      if (Date.now() - start > 60_000) {
        // محافظ نهایی: نباید بوت برای همیشه هنگ کند
        return;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}
function releaseBootLock() {
  try {
    fs.unlinkSync(BOOT_LOCK);
  } catch {
    /* ignore */
  }
}
acquireBootLock();
process.on("exit", releaseBootLock);

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
CREATE INDEX IF NOT EXISTS idx_products_ordered ON products(owner_id, ordered);
CREATE INDEX IF NOT EXISTS idx_suppliers_owner ON suppliers(owner_id);
CREATE INDEX IF NOT EXISTS idx_shared_owner ON shared_access(owner_id);
CREATE INDEX IF NOT EXISTS idx_shared_with ON shared_access(shared_with_id);
`);

// ─── مهاجرت‌های سبک بین نسخه‌ها ──────────────────────────────────────────────
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}
// نسل توکن نشست؛ با تغییر رمز عبور یکی جلو می‌رود تا همه‌ی نشست‌های قبلی باطل شوند
ensureColumn("users", "session_epoch", "session_epoch INTEGER NOT NULL DEFAULT 0");

// ─── جستجوی متنی FTS5 (با fallback به LIKE در صورت نبود پشتیبانی) ────────────
// oid عمداً ایندکس می‌شود تا فیلتر مالک داخل MATCH انجام شود؛ وگرنه برای
// واژه‌های پرتکرار کل FTS همه‌ی کاربران پویش می‌شد و کند بود.
export let ftsEnabled = false;
try {
  const SCHEMA_VERSION = 2;
  const currentVersion = Number(
    db.prepare("PRAGMA user_version").get().user_version || 0
  );

  const ftsTriggers = `
DROP TRIGGER IF EXISTS products_fts_ai;
CREATE TRIGGER products_fts_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid, product_name, oid, sid)
  VALUES (new.id, new.product_name, new.owner_id, new.supplier_id);
END;
DROP TRIGGER IF EXISTS products_fts_ad;
CREATE TRIGGER products_fts_ad AFTER DELETE ON products BEGIN
  DELETE FROM products_fts WHERE rowid = old.id;
END;
DROP TRIGGER IF EXISTS products_fts_au;
CREATE TRIGGER products_fts_au AFTER UPDATE ON products BEGIN
  DELETE FROM products_fts WHERE rowid = old.id;
  INSERT INTO products_fts(rowid, product_name, oid, sid)
  VALUES (new.id, new.product_name, new.owner_id, new.supplier_id);
END;`;

  if (currentVersion < SCHEMA_VERSION) {
    // نسخه‌ی ۲: oid ایندکس‌شده (مهاجرت از اسکیمای قبلی با بازسازی کامل FTS)
    db.exec("DROP TABLE IF EXISTS products_fts;");
    db.exec(`
CREATE VIRTUAL TABLE products_fts USING fts5(
  product_name,
  oid,
  sid UNINDEXED,
  tokenize = 'unicode61'
);
${ftsTriggers}
INSERT INTO products_fts(rowid, product_name, oid, sid)
SELECT id, product_name, owner_id, supplier_id FROM products;
    `);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  } else {
    db.exec(`
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  product_name,
  oid,
  sid UNINDEXED,
  tokenize = 'unicode61'
);
${ftsTriggers}
    `);
  }
  ftsEnabled = true;
} catch (err) {
  console.warn("⚠️  FTS5 در این بیلد SQLite در دسترس نیست؛ جستجو با LIKE انجام می‌شود:", err?.message);
  ftsEnabled = false;
}
// مقداردهی اسکیما تمام شد؛ اجازه‌ی بوت به بقیه‌ی ورکرها داده می‌شود
releaseBootLock();

// ─── کش prepared statementها (هر SQL یک‌بار کامپایل می‌شود) ──────────────────
const stmtCache = new Map();
function prepared(sql) {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

// ─── پوشش‌های سبک برای کوئری‌ها ─────────────────────────────────────────────
// هر دو سبک run(sql, a, b) و run(sql, [a, b]) پشتیبانی می‌شوند.
function normalizeParams(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

function isBusy(err) {
  return err?.code === "ERR_SQLITE_ERROR" && (err?.errcode === 5 || err?.errstr === "database is locked");
}

export function get(sql, ...args) {
  return prepared(sql).get(...normalizeParams(args));
}
export function all(sql, ...args) {
  return prepared(sql).all(...normalizeParams(args));
}
export function run(sql, ...args) {
  const params = normalizeParams(args);
  const stmt = prepared(sql);
  // busy_timeout اصلی‌ترین محافظ است؛ یک retry کوتاه اضافه برای لبه‌ی مسابقه
  try {
    return stmt.run(...params);
  } catch (err) {
    if (!isBusy(err)) throw err;
    return stmt.run(...params);
  }
}

export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function checkpoint() {
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch {
    /* ignore */
  }
}

export function closeDb() {
  try {
    db.close();
  } catch {
    /* ignore */
  }
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

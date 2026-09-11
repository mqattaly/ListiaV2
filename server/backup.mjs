// ─── بکاپ سازگارِ آنلاین از دیتابیس SQLite ─────────────────────────────────
// کپی کردن مستقیم فایل listia.db وقتی سرور باز است ممکن است ناسازگار باشد
// (بخشی از داده در فایل -wal است). VACUUM INTO یک اسنپ‌شات کامل و سازگار می‌سازد
// و نیازی به توقف سرور ندارد.
//
//   node server/backup.mjs                 # ذخیره در server/data/backups/
//   BACKUP_DIR=/backups node server/backup.mjs
//   BACKUP_KEEP=14 node server/backup.mjs  # نگه‌داشتن آخرین ۱۴ بکاپ
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.LISTIA_DB || path.join(__dirname, "data", "listia.db");
const backupDir = process.env.BACKUP_DIR || path.join(__dirname, "data", "backups");
const keep = Number(process.env.BACKUP_KEEP || "14");

if (!fs.existsSync(dbPath)) {
  console.error(`✗ دیتابیس پیدا نشد: ${dbPath}`);
  process.exit(1);
}
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupDir, `listia-${stamp}.db`);
const db = new DatabaseSync(dbPath, { readOnly: true });
try {
  // VACUUM INTO مقدار پارامتر نمی‌پذیرد؛ مسیر ساخته‌شده فقط از اعداد/حروف/خط تیره است
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const sizeMb = (fs.statSync(target).size / 1024 / 1024).toFixed(2);
  console.log(`✓ بکاپ ساخته شد: ${target} (${sizeMb} MB)`);
} finally {
  db.close();
}

// چرخش: حذف قدیمی‌ترین بکاپ‌ها بالاتر از سقف نگه‌داری
if (keep > 0) {
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => /^listia-.*\.db$/.test(f))
    .sort()
    .reverse();
  for (const old of files.slice(keep)) {
    fs.rmSync(path.join(backupDir, old), { force: true });
    console.log(`  بکاپ قدیمی حذف شد: ${old}`);
  }
}

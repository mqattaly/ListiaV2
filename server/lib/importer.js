// ─── ایمپورت CSV / Excel — مقاوم در برابر فایل بزرگ و قفل event loop ────────
//  • تجزیه‌ی فایل در worker thread انجام می‌شود (CPU سنگین از حلقه‌ی رویداد جدا)
//  • مقایسه‌ی فازی نام تأمین‌کنندگان با باکت‌بندی، خطی (O(n)) است نه درجه دو
//  • درج‌ها دسته‌دسته داخل تراکنش انجام می‌شوند و بین دسته‌ها به event loop
//    نفس داده می‌شود تا بقیه‌ی اپ پاسخ‌گو بماند
//  • سقف تعداد ردیف وجود دارد
import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UNIT_TYPES, normalizeName, closestMatch } from "./utils.js";
import { all, get, run, transaction } from "./db.js";
import { FREE_MAX_SUPPLIERS, FREE_MAX_PRODUCTS } from "./licensing.js";
import { isAdminUser } from "./queries.js";
import { importCell } from "./spreadsheet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_ROWS = Number(process.env.IMPORT_MAX_ROWS || 10000);
const CHUNK = 400;

/** تجزیه‌ی فایل در worker thread */
function parseInWorker(buffer, filename) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "importWorker.js"), {
      workerData: { buffer, filename },
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new Error("زمان پردازش فایل طولانی شد؛ فایل را کوچک‌تر کنید."));
    }, 60_000);
    worker.once("message", (msg) => {
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      if (msg?.ok) resolve(msg.rows);
      else reject(new Error(msg?.error || "خواندن فایل ناموفق بود."));
    });
    worker.once("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

const yieldTick = () => new Promise((resolve) => setImmediate(resolve));

/** کلید باکت برای مقایسه‌ی فازی (۲ نویسه‌ی اول نرمال‌شده) */
function bucketKey(name) {
  return name.slice(0, 2) || "__";
}

/** اجرای ایمپورت روی حساب خود کاربر */
export async function importRows(user, buffer, filename) {
  const rows = await parseInWorker(buffer, filename);
  if (rows.length > MAX_ROWS) {
    throw new Error(
      `فایل بیش از ${MAX_ROWS.toLocaleString("en-US")} ردیف دارد. لطفاً فایل را در چند بخش کوچک‌تر ایمپورت کنید.`
    );
  }

  const suppliers = all(
    "SELECT * FROM suppliers WHERE owner_id = ? ORDER BY name",
    user.id
  );
  const normalizedMap = new Map(suppliers.map((s) => [normalizeName(s.name), s]));
  // باکت‌بندیِ فقط نام‌های از قبل موجود برای تطبیق فازی. نام‌هایی که در همین
  // فایل ساخته می‌شوند عمداً وارد فهرست فازی نمی‌شوند: تطبیق فازی فقط برای
  // جلوگیری از تایپوی نام تأمین‌کننده‌ی شناخته‌شده است؛ مقایسه‌ی هر ردیف با
  // هزاران نام جدیدِ داخل فایل، O(n²) و فریزکننده بود.
  const fuzzyBuckets = new Map();
  for (const name of normalizedMap.keys()) {
    const key = bucketKey(name);
    if (!fuzzyBuckets.has(key)) fuzzyBuckets.set(key, []);
    fuzzyBuckets.get(key).push(name);
  }
  // پیش‌فیلتر ارزان: مقایسه‌ی فازی فقط با نام‌های هم‌طولِ تقریبی
  const closeLength = (a, b) => Math.abs(a.length - b.length) <= Math.max(2, Math.round(a.length * 0.15));

  const isLicensed = Number(user.is_licensed) === 1 || isAdminUser(user);
  let currentProductCount = Number(
    get("SELECT COUNT(*) AS n FROM products WHERE owner_id = ?", user.id)?.n ?? 0
  );
  let currentSupplierCount = suppliers.length;

  const added = [];
  const errors = [];
  let processed = 0;

  // هر دسته در یک تراکنش ثبت می‌شود
  const flush = (chunk) =>
    transaction(() => {
      for (const item of chunk) {
        const { excelRowNumber, supplierName, productName, quantity, unit } = item;

        const normName = normalizeName(supplierName);
        let supplierId;
        if (normalizedMap.has(normName)) {
          supplierId = normalizedMap.get(normName).id;
        } else {
          const candidates = (fuzzyBuckets.get(bucketKey(normName)) ?? []).filter(
            (candidate) => closeLength(normName, candidate)
          );
          const close = closestMatch(normName, candidates, 0.82);
          if (close) {
            const similarName = normalizedMap.get(close).name;
            errors.push(
              `ردیف ${excelRowNumber}: نام «${supplierName}» شبیه تأمین‌کننده‌ی موجود «${similarName}» است. ` +
                `برای جلوگیری از ساخت تأمین‌کننده‌ی تکراری، این ردیف وارد نشد — نام را در فایل اصلاح کن یا اگر واقعاً جدید است، دوباره امتحان کن.`
            );
            continue;
          }
          if (!isLicensed && currentSupplierCount >= FREE_MAX_SUPPLIERS) {
            errors.push(
              `ردیف ${excelRowNumber}: ثبت تأمین‌کننده جدید «${supplierName}» ناموفق بود. در نسخه آزمایشی فقط مجاز به داشتن ۱ تأمین‌کننده هستید. (نیاز به لایسنس)`
            );
            continue;
          }
          const info = run(
            "INSERT INTO suppliers (owner_id, name) VALUES (?, ?)",
            user.id,
            supplierName
          );
          const created = { id: Number(info.lastInsertRowid), name: supplierName };
          // برای جلوگیری از درج تکراری دقیق در همین فایل به map اضافه می‌شود،
          // اما به فهرست فازی اضافه نمی‌شود (توضیح بالا)
          normalizedMap.set(normName, created);
          supplierId = created.id;
          currentSupplierCount += 1;
        }

        if (!isLicensed && currentProductCount + added.length >= FREE_MAX_PRODUCTS) {
          errors.push(
            `ردیف ${excelRowNumber}: سقف ۵ محصول در نسخه آزمایشی پر شد. محصول «${productName}» ثبت نشد. (برای افزودن محصولات بیشتر لایسنس تهیه کنید)`
          );
          continue;
        }

        const ins = run(
          `INSERT INTO products (owner_id, supplier_id, product_name, quantity, unit, description)
           VALUES (?, ?, ?, ?, ?, ?)`,
          user.id,
          supplierId,
          productName,
          quantity,
          unit,
          item.description
        );
        added.push(Number(ins.lastInsertRowid));
      }
    });

  let chunk = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const excelRowNumber = index + 2;

    const supplierName = importCell(row, 0);
    const productName = importCell(row, 1);
    const quantity = importCell(row, 2);
    const unit = importCell(row, 3);
    const description = importCell(row, 4);

    if (!supplierName) {
      errors.push(`ردیف ${excelRowNumber}: نام تأمین‌کننده خالی است`);
      continue;
    }
    if (!productName) {
      errors.push(`ردیف ${excelRowNumber}: نام محصول خالی است`);
      continue;
    }
    if (!UNIT_TYPES.includes(unit)) {
      errors.push(`ردیف ${excelRowNumber}: نوع تعداد «${unit}» معتبر نیست`);
      continue;
    }
    if (!quantity) {
      errors.push(`ردیف ${excelRowNumber}: تعداد خالی است`);
      continue;
    }

    chunk.push({ excelRowNumber, supplierName, productName, quantity, unit, description });
    if (chunk.length >= CHUNK) {
      flush(chunk);
      chunk = [];
      processed += CHUNK;
      await yieldTick(); // بعد از هر دسته، event loop نفس بکشد
    }
  }
  if (chunk.length) flush(chunk);

  let message = `✓ ${added.length} ردیف با موفقیت ثبت شد.`;
  if (errors.length) message += ` (${errors.length} ردیف رد شد)`;

  return { success: added.length > 0, message, errors, added_count: added.length };
}

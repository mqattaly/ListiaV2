// ─── ایمپورت CSV / Excel — پورت منطق اصلی (بدون pandas) ─────────────────────
import * as XLSX from "xlsx";
import { UNIT_TYPES, normalizeName, closestMatch } from "./utils.js";
import { all, get, run } from "./db.js";
import { FREE_MAX_SUPPLIERS, FREE_MAX_PRODUCTS } from "./licensing.js";
import { isAdminUser } from "./queries.js";

function importCell(row, index) {
  const value = row?.[index];
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isNaN(value)) return "";
  if (typeof value === "string") return value.trim();
  // عددِ صحیحِ اکسل که به‌صورت float ذخیره شده (5.0) نباید «5.0» شود
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value ?? "").trim();
}

/** ردیف‌های CSV را دستی می‌خواند (پشتیبانی از گیومه و کاما داخل متن). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** ردیف‌های فایل را می‌خواند؛ سطر اول (سرستون) حذف می‌شود. */
export function readUploadRows(buffer, filename) {
  const name = String(filename ?? "").toLowerCase();
  if (name.endsWith(".csv")) {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const rows = parseCsv(text);
    return rows.length ? rows.slice(1) : [];
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: true,
    });
    return rows.length ? rows.slice(1) : [];
  }
  throw new Error("قالبِ Excel قدیمی (.xls) پشتیبانی نمی‌شود؛ فایل را .xlsx ذخیره کنید.");
}

/** اجرای ایمپورت روی حساب خود کاربر — پورت /import */
export function importRows(user, buffer, filename) {
  const rows = readUploadRows(buffer, filename).filter((row) =>
    row.some((_, i) => importCell(row, i) !== "")
  );

  const suppliers = all(
    "SELECT * FROM suppliers WHERE owner_id = ? ORDER BY name",
    user.id
  );
  const normalizedMap = new Map(suppliers.map((s) => [normalizeName(s.name), s]));
  const normalizedNames = [...normalizedMap.keys()];

  const isLicensed = Number(user.is_licensed) === 1 || isAdminUser(user);
  const currentProductCount = Number(
    get("SELECT COUNT(*) AS n FROM products WHERE owner_id = ?", user.id)?.n ?? 0
  );
  let currentSupplierCount = suppliers.length;

  const added = [];
  const errors = [];

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

    const normName = normalizeName(supplierName);
    let supplierId;
    if (normalizedMap.has(normName)) {
      supplierId = normalizedMap.get(normName).id;
    } else {
      const close = closestMatch(normName, normalizedNames, 0.82);
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
      normalizedMap.set(normName, created);
      normalizedNames.push(normName);
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
      description
    );
    added.push(Number(ins.lastInsertRowid));
  }

  let message = `✓ ${added.length} ردیف با موفقیت ثبت شد.`;
  if (errors.length) message += ` (${errors.length} ردیف رد شد)`;

  return { success: added.length > 0, message, errors, added_count: added.length };
}

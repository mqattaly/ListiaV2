// ─── خواندن فایل‌های CSV/Excel (بدون دسترسی به دیتابیس) ──────────────────────
// این ماژول هم از ترد اصلی و هم از worker thread قابل استفاده است.
import * as XLSX from "@e965/xlsx";

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
    const text = buffer.toString("utf8").replace(/^﻿/, "");
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

export { importCell };

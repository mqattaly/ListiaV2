// ─── worker thread تجزیه‌ی فایل ایمپورت (جدا از event loop اصلی) ────────────
import { parentPort, workerData } from "node:worker_threads";
import { readUploadRows } from "./spreadsheet.js";

try {
  const rows = readUploadRows(Buffer.from(workerData.buffer), workerData.filename);
  // فقط ردیف‌های غیرخالی به ترد اصلی برگردد (حجم انتقال کم شود)
  const nonEmpty = rows.filter((row) =>
    Array.from({ length: 5 }, (_, i) => row?.[i]).some((v) => String(v ?? "").trim() !== "")
  );
  parentPort.postMessage({ ok: true, rows: nonEmpty });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message || String(err) });
}

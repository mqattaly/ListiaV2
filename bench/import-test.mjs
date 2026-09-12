// ─── تست انسداد event-loop هنگام ایمپورت فایل بزرگ ──────────────────────────
// هم‌زمان: ۸۰ کاربر داشبورد می‌خوانند؛ در ثانیه‌ی ۳ یک فایل ۲۰۰۰ ردیفی ایمپورت می‌شود.
import { Agent, fetch } from "undici";
import { createSessionToken } from "../server/lib/auth.js";
import XLSX from "@e965/xlsx";

const BASE = process.env.BENCH_BASE || "http://127.0.0.1:3001";
const IMPORT_USER = Number(process.env.IMPORT_USER || 50);
const ROWS = Number(process.env.ROWS || 2000);
const token = createSessionToken(IMPORT_USER);
const agent = new Agent({ connections: 80, bodyTimeout: 240_000, headersTimeout: 240_000 });

function makeXlsx(rows) {
  const data = [["تأمین‌کننده", "محصول", "تعداد", "واحد", "توضیحات"]];
  for (let i = 0; i < rows; i++) {
    // نام‌های کاملاً متفاوت تا فازی‌مچ ردشان نکند و واقعاً درج شوند
    data.push([`بنگاه ${i}-${Math.random().toString(36).slice(2, 8)}`, `کالای ایمپورت ${i}-${Math.random().toString(36).slice(2, 7)}`, String(1 + (i % 30)), "عدد", ""]);
  }
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "list");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const lat = [];
let stop = false;
async function reader(id) {
  while (!stop) {
    const t = performance.now();
    try {
      const res = await fetch(`${BASE}/api/dashboard`, {
        headers: { Authorization: `Bearer ${createSessionToken(100 + (id % 400))}` },
        dispatcher: agent,
      });
      await res.arrayBuffer();
      lat.push({ ms: performance.now() - t, phase: globalThis.__imported ? "after" : globalThis.__started ? "during" : "before" });
    } catch (e) {
      lat.push({ ms: performance.now() - t, phase: "err", err: e.message });
    }
  }
}

function stats(list) {
  const s = list.map((x) => x.ms).sort((a, b) => a - b);
  if (!s.length) return "—";
  const p = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return `n=${s.length} p50=${p(50).toFixed(0)}ms p95=${p(95).toFixed(0)}ms p99=${p(99).toFixed(0)}ms max=${s.at(-1).toFixed(0)}ms`;
}

const workers = Array.from({ length: 80 }, (_, i) => reader(i));
await new Promise((r) => setTimeout(r, 6000)); // فاز before
globalThis.__started = true;
const tImport = performance.now();
const buf = makeXlsx(ROWS);
console.error(`فایل xlsx ساخته شد: ${(buf.length / 1024).toFixed(0)} KB · ارسال…`);
const boundary = "----listiabench" + Math.random().toString(16).slice(2);
const head = Buffer.from(
  `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="import-2000.xlsx"\r\n` +
  `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
);
const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
const body = Buffer.concat([head, buf, tail]);
let impBody = null;
try {
  const impRes = await fetch(`${BASE}/api/import`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
    dispatcher: agent,
  });
  impBody = await impRes.json();
  console.log(`ایمپورت: status=${impRes.status} مدت=${(performance.now() - tImport).toFixed(0)}ms`,
    JSON.stringify({ message: impBody.message, added: impBody.added_count, errors: impBody.errors?.length }));
} catch (e) {
  console.log(`ایمپورت پس از ${(performance.now() - tImport).toFixed(0)}ms با خطا تایم‌اوت شد:`, e.message);
}
globalThis.__imported = true;
await new Promise((r) => setTimeout(r, 8000)); // فاز after
stop = true;
await Promise.allSettled(workers);

console.log("داشبورد قبل از ایمپورت:", stats(lat.filter((x) => x.phase === "before")));
console.log("داشبورد حین ایمپورت:   ", stats(lat.filter((x) => x.phase === "during")));
console.log("داشبورد بعد از ایمپورت:", stats(lat.filter((x) => x.phase === "after")));
console.log("خطاهای خواندن حین تست:", lat.filter((x) => x.phase === "err").length);
process.exit(0);

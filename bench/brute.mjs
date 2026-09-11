import { Agent, fetch } from "undici";
const BASE = process.env.BENCH_BASE || "http://127.0.0.1:3001";
const agent = new Agent({ connections: 40 });
let n = 0, blocked = 0, other = {};
const t0 = performance.now();
async function run() {
  while (performance.now() - t0 < 15000) {
    const code = String(100000 + (n++)).padStart(6, "0");
    try {
      const res = await fetch(`${BASE}/api/auth/verify-email`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "brutetest@bench.local", code }), dispatcher: agent,
      });
      const body = await res.json();
      if (body.message?.includes("زیاد")) blocked++;
      else other[body.message] = (other[body.message]||0)+1;
    } catch (e) { other[e.message] = (other[e.message]||0)+1; }
  }
}
await Promise.all(Array.from({length:40}, run));
const secs = (performance.now()-t0)/1000;
console.log(`تلاش‌ها: ${n} در ${secs.toFixed(1)}s = ${(n/secs).toFixed(0)} تلاش/ثانیه · مسدودشده: ${blocked}`);
console.log("پاسخ‌ها:", JSON.stringify(other, null, 0));
console.log("زمان نظری پیمایش کل فضای ۱ میلیون کد:", (1_000_000/(n/secs)/60).toFixed(1), "دقیقه (پنجره‌ی اعتبار کد: ۱۰ دقیقه)");
process.exit(0);

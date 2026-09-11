import { Agent, fetch } from "undici";
import { createSessionToken } from "../server/lib/auth.js";
const ports = [3001, 3002];
const agent = new Agent({ connections: 64, bodyTimeout: 30000 });
let ok = 0, busy = 0, otherErr = 0;
const codes = {};
async function one(i) {
  const port = ports[i % 2];
  const uid = 100 + (i % 800);
  const token = createSessionToken(uid);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ supplier_id: null, product_name: "x", quantity: "1", unit: "عدد" }),
      dispatcher: agent,
    });
    codes[res.status] = (codes[res.status]||0)+1;
    // supplier_id=null → 400 انتظار می‌رود؛ برای تست واقعی نوشتن از toggle استفاده می‌کنیم
  } catch (e) { otherErr++; }
}
// فاز اول: صرفاً بررسی اتصال
await Promise.all(Array.from({length:10}, (_,i)=>one(i)));
// فاز دوم: نوشتن واقعی هم‌زمان روی هر دو نمونه (toggle)
async function writeOne(i) {
  const port = ports[i % 2];
  const uid = 100 + (i % 400);
  const token = createSessionToken(uid);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }, dispatcher: agent,
    });
    const body = await res.json();
    if (!body.success) { codes['e'+res.status]=(codes['e'+res.status]||0)+1; return; }
    const pid = body.recent?.[0]?.id;
    if (!pid) return;
    const action = i % 2 ? "toggle-order" : "unarchive";
    const w = await fetch(`http://127.0.0.1:${port}/api/products/${pid}/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: "{}", dispatcher: agent,
    });
    codes['w'+w.status] = (codes['w'+w.status]||0)+1;
    if (w.status === 200) ok++; else busy++;
  } catch (e) { otherErr++; }
}
const t0 = performance.now();
await Promise.all(Array.from({length:400}, (_,i)=>writeOne(i)));
console.log("مدت:", ((performance.now()-t0)/1000).toFixed(1)+"s");
console.log("کدهای پاسخ نوشتن:", JSON.stringify(codes));
console.log("موفق:", ok, "| ناموفق:", busy, "| خطای شبکه:", otherErr);
process.exit(0);

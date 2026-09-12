// اثبات انسداد سراسری: حین طوفان لاگین، حتی healthz باید منتظر بماند
import { Agent, fetch } from "undici";
import { createSessionToken } from "../server/lib/auth.js";
const BASE = process.env.BENCH_BASE || "http://127.0.0.1:3001";
const agent = new Agent({ connections: 60 });
const healthLat = [];
let stop = false;
async function healthLoop() {
  while (!stop) {
    const t = performance.now();
    await fetch(`${BASE}/healthz`, { dispatcher: agent });
    healthLat.push(performance.now() - t);
  }
}
const hs = Array.from({ length: 3 }, healthLoop);
await new Promise(r => setTimeout(r, 1500));
const t0 = performance.now();
const logins = await Promise.all(Array.from({ length: 40 }, (_, i) =>
  fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `user${String(1 + i).padStart(4, "0")}`, password: "bench123456" }),
    dispatcher: agent,
  }).then(r => r.status).catch(() => 0)));
stop = true; await Promise.all(hs);
const pct = (a,p) => { const s=[...a].sort((x,y)=>x-y); return s[Math.floor(p/100*s.length)]; };
console.log("۴۰ لاگین هم‌زمان تمام شد در", ((performance.now()-t0)/1000).toFixed(1)+"s");
console.log(`تأخیر healthz قبل/حین طوفان: p50=${pct(healthLat,50).toFixed(0)}ms p95=${pct(healthLat,95).toFixed(0)}ms max=${Math.max(...healthLat).toFixed(0)}ms`);
console.log("(در حالت عادی p95 حدود ۳۰-۶۰ms است)");
process.exit(0);

// ─── ابزار بارگذاری لیستیا — شبیه‌سازی کاربران هم‌زمان ─────────────────────
// اجرا: node bench/load.mjs <سناریو> [concurrency] [durationSec]
// داده: همان دیتابیس بنچ (۱۰۰۰ کاربر). رمز همه: bench123456
import { Agent, fetch } from "undici";
import { createSessionToken } from "../server/lib/auth.js";
import { run, all, get } from "../server/lib/db.js";

const BASE = process.env.BENCH_BASE || "http://127.0.0.1:3001";
const scenario = process.argv[2] || "mix";
const CONC = Number(process.argv[3] || 100);
const DURATION = Number(process.argv[4] || 25);

process.env.LISTIA_DB = process.env.LISTIA_DB; // فقط برای یادآوری

// ─── مانیتور event loop و حافظه ────────────────────────────────────────────
const lagSamples = [];
let loopBusy = 0;
let loopTotal = 0;
function lagMonitor() {
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    const delta = now - last - 50;
    lagSamples.push(Math.max(0, delta));
    last = now;
    setTimeout(tick, 50);
  };
  setTimeout(tick, 50);
}
lagMonitor();

// ─── توکن ۱۰۰۰ کاربر (از همان راز سرور ساخته می‌شود) ────────────────────────
function makeTokens(n) {
  const t = [];
  for (let id = 1; id <= n; id++) t.push({ id, token: createSessionToken(id) });
  return t;
}
const users1000 = makeTokens(1000);

// ─── هیستوگرام تأخیر ────────────────────────────────────────────────────────
class Hist {
  constructor() {
    this.byName = new Map();
    this.statusCodes = {};
    this.errors = {};
    this.bytes = 0;
  }
  record(name, ms, status, err, bytes) {
    let h = this.byName.get(name);
    if (!h) {
      h = { count: 0, sum: 0, max: 0, samples: [] };
      this.byName.set(name, h);
    }
    h.count++;
    h.sum += ms;
    h.max = Math.max(h.max, ms);
    if (h.samples.length < 3000) h.samples.push(ms);
    if (status) this.statusCodes[status] = (this.statusCodes[status] || 0) + 1;
    if (err) {
      const key = err.name || err.code || String(err).slice(0, 60);
      this.errors[key] = (this.errors[key] || 0) + 1;
    }
    if (bytes) this.bytes += bytes;
  }
  pct(sorted, p) {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  }
  report() {
    const out = [];
    for (const [name, h] of this.byName) {
      const s = h.samples.sort((a, b) => a - b);
      out.push({
        endpoint: name,
        count: h.count,
        rps: +(h.count / DURATION).toFixed(1),
        avg_ms: +(h.sum / h.count).toFixed(1),
        p50: +this.pct(s, 50).toFixed(1),
        p95: +this.pct(s, 95).toFixed(1),
        p99: +this.pct(s, 99).toFixed(1),
        max: +h.max.toFixed(0),
      });
    }
    out.sort((a, b) => b.count - a.count);
    const lagSorted = lagSamples.sort((a, b) => a - b);
    return {
      scenario,
      concurrency: CONC,
      duration_s: DURATION,
      total_requests: out.reduce((s, r) => s + r.count, 0),
      total_rps: +(out.reduce((s, r) => s + r.count, 0) / DURATION).toFixed(1),
      mb_received: +(this.bytes / 1024 / 1024).toFixed(1),
      status_codes: this.statusCodes,
      errors: this.errors,
      eventloop: {
        lag_p50_ms: +this.pct(lagSorted, 50).toFixed(1),
        lag_p95_ms: +this.pct(lagSorted, 95).toFixed(1),
        lag_p99_ms: +this.pct(lagSorted, 99).toFixed(1),
        lag_max_ms: +(lagSorted.at(-1) || 0).toFixed(0),
      },
      rss_mb: +(process.memoryUsage().rss / 1024 / 1024).toFixed(0),
      endpoints: out,
    };
  }
}
const hist = new Hist();

const agent = new Agent({
  connections: CONC,
  pipelining: 0,
  connectTimeout: 10_000,
  bodyTimeout: 30_000,
  headersTimeout: 30_000,
});

async function call(method, path, { token, body, name } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      dispatcher: agent,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    hist.record(name || path, performance.now() - t0, res.status, null, buf.length);
    return res.status;
  } catch (err) {
    hist.record(name || path, performance.now() - t0, null, err, 0);
    return 0;
  }
}

let stop = false;
let cursor = 0;
const nextUser = () => users1000[cursor++ % users1000.length];

// محصولات قابل نوشتن برای کاربرهای مختلف (کش مسیرها)
const productCache = new Map();
async function productFor(uid, token) {
  if (productCache.has(uid)) return productCache.get(uid);
  const rows = all("SELECT id FROM products WHERE owner_id = ? AND ordered = 0 LIMIT 5", uid);
  productCache.set(uid, rows.map((r) => r.id));
  return productCache.get(uid);
}
const supplierCache = new Map();
function supplierFor(uid) {
  if (supplierCache.has(uid)) return supplierCache.get(uid);
  const rows = all("SELECT id FROM suppliers WHERE owner_id = ? LIMIT 1", uid);
  supplierCache.set(uid, rows[0]?.id);
  return rows[0]?.id;
}

// ─── سناریوها ───────────────────────────────────────────────────────────────
const SCENARIOS = {
  health: async (u) => call("GET", "/healthz", { name: "GET /healthz" }),

  dashboard: async (u) => call("GET", "/api/dashboard", { token: u.token, name: "GET /api/dashboard" }),

  suppliers: async (u) => call("GET", "/api/suppliers", { token: u.token, name: "GET /api/suppliers" }),

  purchases: async (u) => call("GET", "/api/purchases", { token: u.token, name: "GET /api/purchases" }),

  estimate: async (u) => call("GET", "/api/estimate", { token: u.token, name: "GET /api/estimate" }),

  search: async (u) => {
    const q = ["شیر", "برنج", "روغن", "کاغذ", "لامپ"][Math.floor(Math.random() * 5)];
    return call("GET", `/api/search?q=${encodeURIComponent(q)}`, { token: u.token, name: "GET /api/search" });
  },

  supplierDetail: async (u) => {
    const sid = supplierFor(u.id);
    return call("GET", `/api/suppliers/${sid}`, { token: u.token, name: "GET /api/suppliers/:id" });
  },

  // سنگین: کاربر ۱۵۰۰ محصولی
  heavy: async (u) => {
    const t = createSessionToken(2);
    const pick = Math.random();
    if (pick < 0.4) return call("GET", "/api/dashboard", { token: t, name: "HEAVY /dashboard (1500 محصول)" });
    if (pick < 0.75) return call("GET", "/api/purchases", { token: t, name: "HEAVY /purchases (1500 محصول)" });
    return call("GET", "/api/estimate", { token: t, name: "HEAVY /estimate (1500 محصول)" });
  },

  adminUsers: async () => {
    const t = createSessionToken(1);
    return call("GET", "/api/admin/users", { token: t, name: "GET /api/admin/users" });
  },

  // لاگین کامل: هر درخواست scryptSync روی CPU
  login: async (u) => {
    const uname = `user${String(u.id).padStart(4, "0")}`;
    return call("POST", "/api/auth/login", {
      body: { username: uname, password: "bench123456" },
      name: "POST /api/auth/login (scrypt)",
    });
  },

  // نوشتن: بایگانی/بازگرداندن نوبتی
  writeToggle: async (u) => {
    const ids = await productFor(u.id, u.token);
    if (!ids?.length) return 0;
    const pid = ids[cursor % ids.length];
    // نوبتی بایگانی/بازگردانی تا حالت پایدار بماند
    const flip = (globalThis.__flip = (globalThis.__flip || 0) + 1);
    const action = flip % 2 ? "toggle-order" : "unarchive";
    return call("POST", `/api/products/${pid}/${action}`, {
      token: u.token, body: {}, name: "POST بایگانی/بازگردانی (نوشتن)"
    });
  },

  writeInsert: async (u) => {
    const sid = supplierFor(u.id);
    return call("POST", "/api/products", {
      token: u.token,
      body: { supplier_id: sid, product_name: `کالای تست ${Date.now()}-${cursor}`, quantity: "2", unit: "عدد", description: "" },
      name: "POST /products (درج)",
    });
  },

  // ترکیب واقعی اپ: ۷۰٪ خواندن، ۱۵٪ نوشتن، ۱۰٪ جستجو، ۵٪ لاگین
  mix: async (u) => {
    const r = Math.random();
    if (r < 0.30) return SCENARIOS.dashboard(u);
    if (r < 0.50) return SCENARIOS.purchases(u);
    if (r < 0.62) return SCENARIOS.estimate(u);
    if (r < 0.72) return SCENARIOS.suppliers(u);
    if (r < 0.82) return SCENARIOS.search(u);
    if (r < 0.87) return SCENARIOS.supplierDetail(u);
    if (r < 0.95) return SCENARIOS.writeToggle(u);
    if (r < 0.98) return SCENARIOS.writeInsert(u);
    return SCENARIOS.login(u);
  },

  readMix: async (u) => {
    const r = Math.random();
    if (r < 0.35) return SCENARIOS.dashboard(u);
    if (r < 0.65) return SCENARIOS.purchases(u);
    if (r < 0.82) return SCENARIOS.estimate(u);
    if (r < 0.92) return SCENARIOS.suppliers(u);
    return SCENARIOS.supplierDetail(u);
  },

  writeMix: async (u) => {
    const r = Math.random();
    if (r < 0.7) return SCENARIOS.writeToggle(u);
    return SCENARIOS.writeInsert(u);
  },
};

const handler = SCENARIOS[scenario];
if (!handler) {
  console.error("سناریوی نامعتبر. یکی از:", Object.keys(SCENARIOS).join(", "));
  process.exit(1);
}

async function worker() {
  while (!stop) {
    const u = nextUser();
    await handler(u);
  }
}

console.error(`🏁 سناریو: ${scenario} · هم‌زمانی: ${CONC} · مدت: ${DURATION}s …`);
const workers = Array.from({ length: CONC }, () => worker());
await new Promise((r) => setTimeout(r, DURATION * 1000));
stop = true;
await Promise.allSettled(workers);
await agent.close();

const report = hist.report();
console.log(JSON.stringify(report, null, 2));
// دستگیره‌ی node:sqlite که از ماژول‌های سرور import شده event loop را زنده نگه می‌دارد
process.exit(0);

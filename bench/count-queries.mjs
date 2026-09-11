import { DatabaseSync } from "node:sqlite";
process.env.LISTIA_DB = process.env.LISTIA_DB;
// شمارش دقیق statementها با پچ نمونه اولیه
let count = 0;
const origPrepare = DatabaseSync.prototype.prepare;
DatabaseSync.prototype.prepare = function (sql) {
  const stmt = origPrepare.call(this, sql);
  for (const m of ["get", "all", "run"]) {
    const o = stmt[m].bind(stmt);
    stmt[m] = (...a) => { count++; return o(...a); };
  }
  return stmt;
};
const { getUserById } = await import("../server/lib/db.js");
const Q = await import("../server/lib/queries.js");

function run(label, fn) {
  count = 0;
  fn();
  console.log(label.padEnd(42), count, "statement همگام SQL");
}
for (const uid of [300, 50, 2]) {
  const user = getUserById(uid);
  console.log(`\n── کاربر ${uid} ${uid === 50 ? "(داده‌ی اشتراکی سنگین)" : uid === 2 ? "(کاربر سنگین ۱۵۰۰ محصول)" : "(عادی)"}`);
  run("GET /dashboard", () => {
    Q.userSuppliers(uid);
    Q.dashboardCounters(uid);
    Q.userProducts(uid, { ordered: false }).sort((a,b)=>b.id-a.id).slice(0,15).forEach(p => Q.productPayload ? null : 0);
    Q.recentProductNames(uid);
    Q.getUserLimits(user);
  });
  run("GET /purchases", () => {
    Q.userProducts(uid, { ordered: false });
    Q.userSuppliers(uid);
    Q.recentProductNames(uid);
    Q.getUserLimits(user);
  });
  run("GET /estimate (estimateSnapshot)", () => Q.estimateSnapshot(uid));
  run("  + هر ذخیره‌ی قیمت یک آیتم", () => {
    Q.estimateSnapshot(uid); // بعد از هر UPDATE دوباره snapshot کامل
  });
}
process.exit(0);

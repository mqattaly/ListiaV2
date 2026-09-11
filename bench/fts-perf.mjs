import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.env.LISTIA_DB);
const ids = [300];
const ph = ids.map(() => "?").join(",");

const variants = {
  "فعلی (fts بیرونی + فیلتر owner بعد)": `
    SELECT p.* FROM products_fts f
      JOIN products p ON p.id = f.rowid
      JOIN suppliers s ON s.id = p.supplier_id
     WHERE products_fts MATCH ? AND f.owner_id IN (${ph})
     ORDER BY p.ordered, p.id DESC LIMIT 50`,
  "products بیرونی + جوین fts": `
    SELECT p.* FROM products p
      JOIN products_fts f ON f.rowid = p.id
      JOIN suppliers s ON s.id = p.supplier_id
     WHERE p.owner_id IN (${ph}) AND f.products_fts MATCH ?
     ORDER BY p.ordered, p.id DESC LIMIT 50`,
  "fts با MATCH ستون owner ایندکس‌شده": null,
  "LIKE قدیمی": `
    SELECT p.* FROM products p JOIN suppliers s ON s.id=p.supplier_id
     WHERE p.owner_id IN (${ph}) AND lower(p.product_name) LIKE lower(?)
     ORDER BY p.ordered, p.id DESC LIMIT 50`,
};

for (const [name, sql] of Object.entries(variants)) {
  if (!sql) continue;
  // گرم‌کردن
  for (let i = 0; i < 3; i++) db.prepare(sql).all(...(name.includes("قدیمی") ? ["%شیر%", ...ids] : ["\"شیر\"*", ...ids]));
  const t = performance.now();
  let n = 0;
  for (let i = 0; i < 200; i++) {
    n = db.prepare(sql).all(...(name.includes("قدیمی") ? ["%شیر%", ...ids] : ["\"شیر\"*", ...ids])).length;
  }
  console.log(`${name.padEnd(42)} ${((performance.now() - t) / 200).toFixed(2)}ms/query (${n} نتیجه)`);
}

// پلن اجرای فعلی
for (const r of db.prepare("EXPLAIN QUERY PLAN " + variants["فعلی (fts بیرونی + فیلتر owner بعد)"]).all('"شیر"*', ...ids))
  console.log("PLAN:", r.detail);

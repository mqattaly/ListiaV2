import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.env.LISTIA_DB);
db.exec("DROP TABLE IF EXISTS products_fts2");
db.exec(`
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts2 USING fts5(
  product_name, oid, sid UNINDEXED, tokenize='unicode61');
INSERT INTO products_fts2(rowid, product_name, oid, sid)
  SELECT id, product_name, owner_id, supplier_id FROM products;
`);
const ids = [300];
const expr = `"شیر"* AND (${ids.map((i) => `oid:${i}`).join(" OR ")})`;
const sql = `
  SELECT p.*, s.name AS supplier_name FROM products_fts2 f
    JOIN products p ON p.id = f.rowid
    JOIN suppliers s ON s.id = p.supplier_id
   WHERE products_fts2 MATCH ?
   ORDER BY p.ordered, p.id DESC LIMIT 50`;
for (let i = 0; i < 3; i++) db.prepare(sql).all(expr);
const t = performance.now();
let n = 0;
for (let i = 0; i < 500; i++) n = db.prepare(sql).all(expr).length;
console.log(`owner در MATCH: ${((performance.now() - t) / 500).toFixed(3)}ms/query (${n} نتیجه)`);
for (const r of db.prepare("EXPLAIN QUERY PLAN " + sql).all(expr)) console.log("PLAN:", r.detail);
db.exec("DROP TABLE products_fts2");

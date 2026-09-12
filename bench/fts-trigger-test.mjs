import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE products(id INTEGER PRIMARY KEY, name TEXT, o INT)");
db.exec(`
CREATE VIRTUAL TABLE pfts USING fts5(name, o UNINDEXED);
CREATE TRIGGER ai AFTER INSERT ON products BEGIN
  INSERT INTO pfts(rowid,name,o) VALUES(new.id,new.name,new.o);
END;
CREATE TRIGGER ad AFTER DELETE ON products BEGIN
  DELETE FROM pfts WHERE rowid=old.id;
END;
CREATE TRIGGER au AFTER UPDATE ON products BEGIN
  DELETE FROM pfts WHERE rowid=old.id;
  INSERT INTO pfts(rowid,name,o) VALUES(new.id,new.name,new.o);
END;`);
db.prepare("INSERT INTO products VALUES(1,'تست',10)").run();
db.prepare("INSERT INTO products VALUES(2,'شیر',10)").run();
try {
  db.prepare("DELETE FROM products WHERE id=1").run();
  console.log("delete موفق");
} catch (e) {
  console.log("خطای delete:", e.message, "|", e.errstr);
}
console.log("نتیجه جستجو:", db.prepare("SELECT rowid FROM pfts WHERE pfts MATCH ?").all("شیر*"));
db.prepare("UPDATE products SET name='شیرکاکائو' WHERE id=2").run();
console.log("بعد از آپدیت:", db.prepare("SELECT rowid, name FROM pfts").all());

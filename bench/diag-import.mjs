process.env.LISTIA_DB = process.argv[2] || '../server/data/bench.db';
import XLSX from '@e965/xlsx';
import { getUserById } from '../server/lib/db.js';
import { readUploadRows } from '../server/lib/spreadsheet.js';
import { importRows } from '../server/lib/importer.js';

const data = [["تأمین‌کننده","محصول","تعداد","واحد","توضیحات"]];
for (let i=0;i<10000;i++) data.push([`بنگاه ${i}-${Math.random().toString(36).slice(2,7)}`,`کالا ${i}-${Math.random().toString(36).slice(2,7)}`,"2","عدد",""]);
const ws = XLSX.utils.aoa_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "l");
const buf = XLSX.write(wb, {type:"buffer",bookType:"xlsx"});
console.log("xlsx ساخته شد", (buf.length/1024).toFixed(0),"KB");

let t=performance.now();
const rows = readUploadRows(buf, "f.xlsx");
console.log(`پارس main-thread: ${rows.length} ردیف در ${(performance.now()-t).toFixed(0)}ms`);

const user = getUserById(993);
t=performance.now();
const out = await importRows(user, buf, "f.xlsx");
console.log(`importRows کامل: ${(performance.now()-t).toFixed(0)}ms`, JSON.stringify({added: out.added_count, errors: out.errors.length}));
console.log("اولین خطاها:", out.errors.slice(0,2));
process.exit(0);

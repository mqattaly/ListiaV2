// گارد بیلد: اگر علامت کانفلیکتِ حل‌نشده‌ی گیت (<<<<<<<) داخل سورس مانده
// باشد، بیلد را با یک پیام روشن متوقف می‌کند — نه با خطای گنگ esbuild.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const MARKER_RE = /^(<{7} .+|={7}$|>{7} .+)$/m;

const bad = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (/\.(jsx?|css|html|json)$/.test(entry)) {
      const text = readFileSync(full, "utf8");
      if (MARKER_RE.test(text)) bad.push(path.relative(SRC, full));
    }
  }
}
walk(SRC);

if (bad.length) {
  console.error("\n❌ BUILD BLOCKED: unresolved git merge-conflict markers found in:");
  for (const f of bad) console.error(`   - client/src/${f}`);
  console.error("\nکانفلیکت گیت حل‌نشده داخل سورس است. اول آن را resolve و کامیت کنید، بعد بیلد بگیرید.\n");
  process.exit(1);
}
console.log("✓ no git conflict markers in client/src");

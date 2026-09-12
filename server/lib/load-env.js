// ─── بارگذاری سبک فایل .env (بدون وابستگی) ─────────────────────────────────
// متغیرهای واقعی محیط همیشه اولویت دارند؛ .env فقط جاهای خالی را پر می‌کند.
// این ماژول باید نخستین import در نقطه‌ی ورود سرور باشد (auth/licensing هنگام
// بارگذاری، متغیرهای محیطی را می‌خوانند).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.env.ENV_FILE, // مسیر دلخواه صریح
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "..", "..", ".env"), // ریشه‌ی پروژه هنگام اجرا از داخل server/
].filter(Boolean);

function applyDotEnv(file) {
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return false;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // حذف کوتیشن‌های دور مقدار
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
  return true;
}

for (const file of candidates) {
  if (applyDotEnv(file)) {
    console.log(`⚙️  تنظیمات از فایل ${path.relative(process.cwd(), file) || file} بارگذاری شد`);
    break;
  }
}

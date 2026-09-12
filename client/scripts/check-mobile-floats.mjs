// گارد چیدمان موبایل: دکمه‌های شناور (پشتیبانی/تم) و نوار بالا باید از
// متغیرهای --bottom-nav-h و --safe-* استفاده کنند، نه از عدد ثابت.
//
// چرا؟ قبلاً حباب پشتیبانی در انتهای support.css با «bottom: 74px» بازنویسی
// شده بود و روی گوشی‌هایی که نوار پایین‌شان بلندتر است (فونت بزرگ یا نوار
// ناوبری سیستم) دقیقاً روی دکمه‌ی «مدیریت»/«لایسنس» می‌افتاد. این گارد همان
// الگو را در زمان بیلد می‌گیرد و بیلد را با پیام روشن متوقف می‌کند.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const STYLES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "styles");
const ORDER = ["fonts.css", "theme.css", "components.css", "layout.css", "pages.css", "support.css"];

// گوشی‌های رایج (عرض × ارتفاع) — ویوو/اندروید هم در همین بازه‌اند
const VIEWPORTS = [
  { w: 360, h: 640, name: "اندروید کوچک" },
  { w: 390, h: 844, name: "ویوو/اندروید" },
  { w: 412, h: 915, name: "اندروید بزرگ" },
];

// ویوپورت نمی‌تواند env() را در بیلد ارزیابی کند؛ فقط بررسی می‌کنیم که
// مقدار برنده‌ی هر ویژگی به متغیرها گره خورده باشد، نه به عدد ثابت.
const RULES = [
  { sel: ".support-fab", prop: "bottom", must: "var(--bottom-nav-h)", why: "حباب پشتیبانی باید بالای ارتفاع واقعی نوار پایین بنشیند" },
  { sel: ".theme-fab-m", prop: "bottom", must: "var(--bottom-nav-h)", why: "دکمه‌ی تم باید بالای حباب پشتیبانی و نوار پایین بنشیند" },
  { sel: ".bottom-nav", prop: "padding", must: "var(--safe-bottom)", why: "نوار پایین باید ناحیه‌ی امن سیستم را رعایت کند" },
  { sel: ".mobile-topbar", prop: "padding", must: "var(--safe-top)", why: "نوار بالای موبایل نباید زیر نوتیفیکیشن‌بار برود" },
  { sel: ".toast-stack", prop: "top", must: "var(--safe-top)", why: "توست‌ها نباید زیر نوتیفیکیشن‌بار بروند" },
];

function mediaApplies(cond, { w, h }) {
  if (!cond) return true;
  const c = cond.trim();
  const maxW = c.match(/max-width:\s*(\d+)px/);
  const maxH = c.match(/max-height:\s*(\d+)px/);
  const minW = c.match(/min-width:\s*(\d+)px/);
  if (/prefers-reduced-motion|prefers-color-scheme|hover|pointer/.test(c)) return false;
  let ok = true;
  if (maxW) ok &&= w <= Number(maxW[1]);
  if (maxH) ok &&= h <= Number(maxH[1]);
  if (minW) ok &&= w >= Number(minW[1]);
  return ok;
}

// شبیه‌سازی کوچک کاسکید: آخرین اعلانِ برنده برای هر ویژگی، با شرط مدیای آن
function winnerFor(sel, prop, viewport) {
  let winner = null;
  for (const file of ORDER) {
    const css = readFileSync(path.join(STYLES, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const re = /(@media[^{]+\{)?([^{}@]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const [, media, selsRaw, declsRaw] = m;
      const cond = media ? media.replace(/^@media/, "").replace(/\{$/, "").trim() : null;
      if (!mediaApplies(cond, viewport)) continue;
      const sels = selsRaw.split(",").map((s) => s.trim().replace(/\s+/g, " "));
      if (!sels.includes(sel)) continue;
      for (const line of declsRaw.split(";")) {
        const i = line.indexOf(":");
        if (i < 0) continue;
        if (line.slice(0, i).trim() !== prop) continue;
        winner = { value: line.slice(i + 1).trim(), where: `${file}${cond ? ` @media (${cond})` : ""}` };
      }
    }
  }
  return winner;
}

const problems = [];
for (const vp of VIEWPORTS) {
  for (const rule of RULES) {
    const win = winnerFor(rule.sel, rule.prop, vp);
    if (!win) {
      problems.push(`${rule.sel} { ${rule.prop} } در ${vp.name} (${vp.w}px) تعریف نشده — ${rule.why}`);
    } else if (!win.value.includes(rule.must)) {
      problems.push(
        `${rule.sel} { ${rule.prop}: ${win.value} } در ${vp.name} (${vp.w}px)\n` +
          `   ↳ باید «${rule.must}» داشته باشد (${rule.why})\n` +
          `   ↳ برنده: ${win.where}`
      );
    }
  }
}

if (problems.length) {
  console.error("\n❌ BUILD BLOCKED: چیدمان موبایل از ناحیه‌ی امن/نوار پایین تبعیت نمی‌کند:\n");
  for (const p of problems) console.error(`   - ${p}`);
  console.error("\nعدد ثابت (مثل bottom: 74px) را با متغیرهای --bottom-nav-h و --safe-* جایگزین کنید.");
  console.error("اگر قاعده‌ی جدیدی اضافه می‌کنید، حتماً بالاتر از بلوک موبایلِ انتهای support.css نباشد.\n");
  process.exit(1);
}

console.log("✓ mobile floats: دکمه‌های شناور از ارتفاع واقعی نوار پایین و ناحیه‌ی امن استفاده می‌کنند");

// ─── برآورد هوشمند بر اساس شغل (هماهنگ‌کننده‌ی AI + جستجوی قیمت زنده) ────────
// هوش مصنوعی خودش به اینترنت دسترسی ندارد؛ این ماژول فقط «تصمیم‌گیر» است:
// فهرست اقلام موردنیاز هر شغل + تعداد/واحد + اولویت منابع را می‌سازد و بعد
// سرور قیمت واقعی و قابل‌کلیک را از جستجوگرهای بازار (priceSearch) می‌گیرد.
// خطای هر قلم/منبع ایزوله است و کل فرایند را نمی‌شکند.
import { aiChatComplete } from "./aiSupport.js";
import { priceSearch, PRICE_SOURCES } from "./priceSearch.js";
import { UNIT_TYPES } from "./utils.js";

export const JOB_MAX_ITEMS = 10;
const SOURCE_IDS = Object.keys(PRICE_SOURCES);

const JOB_PLAN_SYSTEM = `تو یک کارشناس باتجربه‌ی تأمین کالا و تدارکات برای کسب‌وکارهای کوچک ایران هستی.
کاربر شغل/حرفه‌ی خودش را می‌گوید و تو فهرست «اقلام و لوازم پایه‌ی موردنیاز برای راه‌اندازی یا خرید دوره‌ای» همان شغل را می‌سازی.

قوانین سخت:
- فقط و فقط یک شیء JSON معتبر خروجی بده، بدون هیچ متن، توضیح، مارک‌داون یا کد‌فنس.
- هر قلم باید یک کالای واقعی و قابل‌جست‌وجو در فروشگاه‌های آنلاین ایرانی باشد؛ نام قلم را کوتاه، عام و فارسی بنویس (مثل «ترازوی دیجیتال ۳۰ کیلویی») و از برند خاص استفاده نکن مگر اینکه شغل ذاتاً به برند وابسته باشد.
- واحد هر قلم باید دقیقاً یکی از این‌ها باشد: عدد، بسته، کارتن، گونی، کیلو.
- فیلد sources آرایه‌ای از شناسه‌های منابع جست‌وجو به‌ترتیب اولویت است؛ فقط از این شناسه‌ها انتخاب کن:
  digikala (ابزار، برق، الکترونیک، تجهیزات دیجیتال و صنعتی سبک)،
  torob (کالای عمومی و خرده‌فروشی همه‌منظوره)،
  basalam (اقلام سنتی، دست‌ساز، صنفی و محلی)،
  tedadbala (خرید عمده و مواد مصرفی انبوه).
- تعداد پیشنهادی (qty) منطقی و برای شروع یک کسب‌وکار کوچک باشد (اعداد صحیح ۱ تا ۵۰).
- ۶ تا ${JOB_MAX_ITEMS} قلم مهم را به‌ترتیب اولویت بده؛ موارد حیاتی اول بیایند.
- why: دلیل کوتاه کمتر از ۱۲ کلمه (فارسی).
- مواد مصرفی و تجهیزات بادوام هر دو لحاظ شوند؛ اقلام بسیار گران و ثابت (مثل رهن مغازه، دکور سنگین، خودرو) را نده.

ساختار دقیق خروجی:
{"title":"عنوان کوتاه فارسی برای این فهرست","items":[{"name":"نام کالا","qty":2,"unit":"عدد","sources":["digikala","torob"],"why":"دلیل کوتاه"}]}`;

/**
 * فهرست اقلام هوشمند برای یک شغل.
 * @returns {Promise<{title:string, items:Array}>}
 */
export async function buildJobPlan({ job = "", note = "" } = {}) {
  const jobText = String(job ?? "").trim().slice(0, 120);
  if (jobText.length < 2) {
    const e = new Error("عنوان شغل را درست بنویسید (حداقل ۲ حرف).");
    e.status = 400;
    throw e;
  }
  const noteText = String(note ?? "").trim().slice(0, 300);
  const user =
    `شغل من: «${jobText}».` +
    (noteText ? ` توضیح/مقیاس من: «${noteText}».` : "") +
    ` حالا فهرست ${JOB_MAX_ITEMS} قلمی لوازم پایه را فقط به‌صورت JSON بده.`;

  const { reply } = await aiChatComplete(
    [
      { role: "system", content: JOB_PLAN_SYSTEM },
      { role: "user", content: user },
    ],
    {
      maxTokens: 1400,
      temperature: 0.4,
      timeoutMs: 40000,
      label: "برآورد شغلی AI",
      maxChars: 8000,
    }
  );

  const parsed = extractJson(reply);
  const items = sanitizePlanItems(parsed?.items);
  if (!items.length) {
    const e = new Error("هوش مصنوعی فهرست معتبری نساخت؛ دوباره تلاش کنید یا شغل را واضح‌تر بنویسید.");
    e.status = 502;
    throw e;
  }
  const title =
    typeof parsed?.title === "string" && parsed.title.trim()
      ? parsed.title.trim().slice(0, 120)
      : `فهرست لوازم «${jobText}»`;
  return { title, items };
}

/** استخراج JSON حتی اگر مدل کدفنس یا جمله‌ی اضافه گذاشته باشد. */
function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // اول تلاش مستقیم
  try {
    return JSON.parse(t);
  } catch {
    /* ادامه */
  }
  // پیدا کردن اولین {...} متوازن
  const start = t.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < t.length; i++) {
      const ch = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(t.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

export function sanitizePlanItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const seen = new Set();
  const out = [];
  for (const it of rawItems) {
    if (!it || typeof it !== "object") continue;
    const name = String(it.name ?? "").trim().slice(0, 160);
    if (name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    let qty = Math.round(Number(it.qty) || 1);
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    qty = Math.min(qty, 50);

    const unit = UNIT_TYPES.includes(it.unit) ? it.unit : "عدد";

    let sources = Array.isArray(it.sources)
      ? [
          ...new Set(
            it.sources
              .map((s) => String(s).trim().toLowerCase())
              .filter((s) => SOURCE_IDS.includes(s))
          ),
        ]
      : [];
    if (!sources.length) sources = ["torob", "digikala", "basalam"];

    const why = String(it.why ?? "").trim().slice(0, 120);
    out.push({ name, qty, unit, sources, why });
    if (out.length >= JOB_MAX_ITEMS) break;
  }
  return out;
}

// ─── مرحله‌ی دوم: جستجوی واقعی قیمت برای اقلام فهرست ──────────────────────────

const PRICE_CONCURRENCY = 3;
// برای هر قلم حداکثر این تعداد منبع (به‌ترتیب اولویت AI) امتحان می‌شود
const SOURCES_PER_ITEM = 3;

async function mapPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/**
 * برای هر قلم، منابع پیشنهادی AI را به‌ترتیب می‌گردد تا قیمت پیدا شود.
 * شکست هر منبع/قلم ایزوله است و هیچ‌گاه خطا پرتاب نمی‌کند.
 * @param {Array} items خروجی sanitizeِ فهرست
 * @param {(done:number,total:number,name:string)=>void} [onProgress]
 */
export async function pricePlanItems(items, onProgress = null) {
  const list = sanitizePlanItems(items);
  let done = 0;

  return mapPool(
    list,
    async (item) => {
      const sources = item.sources.slice(0, SOURCES_PER_ITEM);
      const collected = [];
      const tried = [];
      const sourceErrors = [];

      // موازی در سقفِ منابع هر قلم؛ نتایج منابع متعدد برای ارزان‌ترین مبنا جمع می‌شود.
      const settled = await Promise.all(
        sources.map(async (src) => {
          try {
            const data = await priceSearch(item.name, "", src);
            return { src, results: data.results ?? [], errors: data.errors ?? [] };
          } catch (err) {
            return { src, results: [], errors: [String(err?.message ?? err)] };
          }
        })
      );

      for (const s of settled) tried.push(s.src);
      for (const s of settled) {
        if (s.results.length) collected.push(...s.results);
        else if (s.errors.length) sourceErrors.push(`${s.src}: ${s.errors[0]}`);
      }

      // اگر هیچ‌کدام از منابع پیشنهادی نتیجه نداد، یک‌بار با همه‌ی منابع
      // (جستجوی سراسری) تلاش می‌کنیم تا «قیمت پیدا نشد» به حداقل برسد.
      if (!collected.length) {
        try {
          const fallback = await priceSearch(item.name, "", "");
          if (fallback.results?.length) {
            collected.push(...fallback.results);
            tried.push("*");
          }
        } catch {
          /* قلم بی‌نتیجه می‌ماند */
        }
      }

      // ارزان‌ترینِ هم‌عنوان مبنا؛ بدیل‌ها هم برای انتخاب کاربر نگه داشته می‌شوند
      collected.sort((a, b) => a.price - b.price);
      const chosen = collected[0] || null;
      const alternatives = collected.slice(1, 4);

      done++;
      onProgress?.(done, list.length, item.name);

      return {
        name: item.name,
        qty: item.qty,
        unit: item.unit,
        why: item.why || "",
        sources: tried,
        status: chosen ? "priced" : "none",
        result: chosen,
        alternatives,
        row_total: chosen ? chosen.price * item.qty : 0,
        errors: chosen ? [] : sourceErrors.slice(0, 2),
      };
    },
    PRICE_CONCURRENCY
  );
}

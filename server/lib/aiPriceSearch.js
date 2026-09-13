// ─── جستجوی قیمت زنده با هوش مصنوعی (کاملاً توسط AI) ───────────────────────
// قیمت‌ها دیگر از APIهای سایت‌های خاص (دیجی‌کالا/ترب/باسلام/…) خوانده نمی‌شوند.
// هوش مصنوعی خودش در اینترنت جستجو می‌کند، قیمت‌های زنده از هر سایتی که
// مناسب بداند را جمع می‌کند و برمی‌گرداند. شغلِ کاربر هم به AI داده می‌شود تا
// سایت‌ها و گونه‌ی کالا را بر اساس همان حرفه انتخاب کند.
//
// جستجوی اینترنت: طبق مستندات درگاه سازگار با OpenAI (OpenRouter/چابکان)،
// حالت جستجوی وب با پلاگین `web` در بدنه‌ی درخواست فعال می‌شود تا مدل
// نتایج زنده‌ی وب را ببیند و قیمت‌های به‌روز بدهد. مدلِ استفاده‌شده هم
// دقیقاً همان CHABOKAN_AI_MODEL است.
// اگر درگاه پلاگین را نپذیرد (خطای ۴۰۰)، بی‌صدا بدون پلاگین امتحان
// دوباره می‌شود.
//
// خروجی همان شکلی است که قبل‌تر priceSearch برمی‌گرداند تا فرانت بدون
// تغییر کار کند (results با price/price_label/url/image/source_label).
// منطق تبدیل قیمت و تقسیم بر تعدادِ صفحه‌ی برآورد دست‌نخورده باقی می‌ماند؛
// فقط «جستجو» کاملاً با AI انجام می‌شود.
import { aiChatComplete, aiConfigured, aiModel } from "./aiSupport.js";
import { parseAmount, formatAmount, safeHttpUrl } from "./utils.js";

const MAX_RESULTS = 10;
const TIMEOUT_MS = 90_000; // جستجوی اینترنتی وقت بیشتری می‌گیرد
const CACHE_TTL = 60_000;
const CACHE_MAX = 200;
const cache = new Map();

function cacheSet(key, data) {
  cache.set(key, { at: Date.now(), data });
  if (cache.size <= CACHE_MAX) return;
  const now = Date.now();
  for (const [k, v] of cache) {
    if (cache.size <= CACHE_MAX * 0.8) break;
    if (now - v.at > CACHE_TTL) cache.delete(k);
  }
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at > CACHE_TTL) cache.delete(k);
}, 60_000).unref?.();

const SYSTEM_PROMPT = `تو متخصص جستجوی قیمت کالا در بازار آنلاین ایران هستی و به اینترنت دسترسی داری.
کاربر شغل/حرفه‌ی خودش و نام یک کالا را می‌دهد؛ تو باید قیمتِ زنده و به‌روزِ همان کالا را
با جستجو در اینترنت پیدا کنی.

قوانین:
- حتماً واقعاً در اینترنت جستجو کن (فروشگاه‌ها، موتورهای مقایسه‌ی قیمت، سایت‌های رسمی
  برند، سایت‌های تخصصیِ همان شغل و هر منبع معتبر دیگری که بخوای). منابع را خودت
  بر اساس شغل کاربر انتخاب کن — برای مثال برای رستوران/کافی‌شاپ سایت‌های عمده‌فروشی مواد
  غذایی، برای خدمات نظافت ابزارهای صنعتی نظافت، برای مکانیکی قطعات خودرو و…
- گونه‌ی کالا را مطابق همان شغل جستجو کن (اگر در آن شغل از گونه‌ی صنعتی/حرفه‌ای استفاده
  می‌شود، همان را بگرد؛ اگر کاربر چیزی نگفته، گونه‌ی رایج بازار همان است).
- بین ۳ تا ۸ نتیجه بده؛ ترجیحاً از سایت‌های مختلف (هر نتیجه از یک صفحه‌ی واقعی).
- قیمت هر نتیجه را به تومان تبدیل کن (سایت‌هایی که ریال نشان می‌دهند را ۱۰ تقسیم کن).
- هر نتیجه باید لینکِ واقعیِ همان صفحه باشد که قیمت را از آن خوانده‌ای.
- هرگز قیمت، عنوان یا لینک اختراع نکن. اگر نتوانستی قیمت واقعی پیدا کنی، نتایج کمتر
  بده یا results را خالی بگذار؛ گمراه‌کردن با عدد جعلی ممنوع است.
- image اختیاری است؛ فقط آدرس واقعی تصویر کالا را بده اگر در همان صفحه دیدی.
- پاسخ فقط و فقط یک شیء JSON معتبر باشد؛ بدون متن اضافه، بدون کد‌فنس و بدون توضیح.

ساختار خروجی:
{"results":[{"title":"عنوان کالا در سایت","price":1250000,"url":"https://...","source":"نام سایت","image":"https://..."}]}`;

/** استخراج JSON از پاسخ مدل (با تحمل کد‌فنس/متن اضافی). */
function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
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
  }
  return null;
}

function slugSource(label) {
  const s = String(label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "site";
}

/** نتیجه‌ی خام مدل → شکل خروجی priceSearch (قیمت عددی و تومانی). */
function normalizeResult(item, index) {
  if (!item || typeof item !== "object") return null;
  const title = String(item.title ?? item.name ?? "").trim().slice(0, 220);
  if (!title) return null;

  // قیمت: عدد خالص (Persian/Arabic digits و جداکننده هم می‌پذیرد) — همیشه تومان
  const rawPrice = item.price ?? item.amount ?? item.price_toman ?? item.value ?? null;
  let price = typeof rawPrice === "number" ? Math.round(rawPrice) : null;
  if (price === null) {
    const text = String(rawPrice ?? "").trim();
    price = parseAmount(text);
    // اگر مدل قیمت را با واحد ریال نوشته باشد («۹۱٬۰۰٬ ریال»)، به تومان تبدیل می‌شود
    if (price === null && /(ریال|ريال|rial|irr)/i.test(text)) {
      const cleaned = text.replace(/ریال|ريال|rial|irr/gi, "").replace(/[-–—]/g, "");
      const v = parseAmount(cleaned);
      if (v !== null) price = v / 10;
    }
  }
  if (price === null || !Number.isFinite(price) || price <= 0) return null;
  price = Math.round(price);

  const url = safeHttpUrl(item.url ?? item.link ?? item.href ?? "") || "";
  const source = String(item.source ?? item.site ?? item.store ?? "").trim().slice(0, 60) || "فروشگاه آنلاین";
  const image = safeHttpUrl(item.image ?? item.img ?? item.photo ?? "") || "";

  return {
    title,
    price,
    price_label: formatAmount(price) + " تومان",
    price_unit: "تومان",
    url,
    image,
    source_id: slugSource(source),
    source_label: source,
    _order: index,
  };
}

/**
 * جستجوی قیمت زنده — کاملاً با هوش مصنوعی.
 * AI خودش در اینترنت می‌گردد، سایت‌ها را بر اساس شغل انتخاب می‌کند و
 * چند نتیجه‌ی واقعی (عنوان/قیمت تومانی/لینک/سایت) برمی‌گرداند.
 * @returns {Promise<{results:Array, query:string, job:string, sources:Array, errors:Array, queries:string[], smart:boolean, model:string|null}>}
 */
export async function smartPriceSearch({ job = "", query = "" } = {}) {
  const raw = String(query ?? "").trim().slice(0, 180);
  if (!raw) return { results: [], query: "", job: "", sources: [], errors: [], queries: [], smart: false, model: null };
  const jobText = String(job ?? "").trim().slice(0, 120);

  if (!aiConfigured()) {
    const err = new Error("سرویس هوش مصنوعی در حال حاضر فعال نیست؛ برای جستجوی قیمت، کلید AI را در سرور تنظیم کنید.");
    err.status = 503;
    throw err;
  }

  const cacheKey = `${raw.toLowerCase()}|${jobText.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

  const model = aiModel(); // مدلِ تنظیم‌شده در CHABOKAN_AI_MODEL
  const jobLine = jobText
    ? `شغل/حرفه‌ی من: «${jobText}» — سایت‌ها و گونه‌ی کالا را بر اساس همین شغل انتخاب کن.\n`
    : "";
  const userMessage = `${jobLine}کالایی که قیمتش را می‌خواهم: «${raw}»
قیمت‌های زنده و واقعی را در اینترنت جستجو کن و خروجی JSON بده.`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];
  const callOpts = {
    model,
    maxTokens: 3000,
    temperature: 0.2,
    timeoutMs: TIMEOUT_MS,
    label: "جستجوی قیمت AI",
    maxChars: 12000,
  };

  // خطای درگاه AI (503/502/504) با همان پیام فارسی به کاربر می‌رسد
  let reply;
  let annotations = [];
  try {
    ({ reply, annotations } = await aiChatComplete(messages, { ...callOpts, webSearch: true }));
  } catch (err) {
    // اگر درگاه پلاگین جستجوی وب را نپذیرد (HTTP 400)، بدون پلاگین امتحان دوباره می‌شود
    if (err?.status !== 400) throw err;
    console.warn("جستجوی قیمت AI: پلاگین جستجوی اینترنت پذیرفته نشد؛ بدون آن تلاش دوباره می‌شود.");
    ({ reply, annotations } = await aiChatComplete(messages, callOpts));
  }

  const parsed = extractJson(reply);
  const rawItems = Array.isArray(parsed?.results) ? parsed.results : [];
  if (!rawItems.length && parsed === null) {
    const err = new Error("پاسخ هوش مصنوعی قابل‌خواندن نبود؛ دوباره تلاش کنید.");
    err.status = 502;
    err.retryable = true;
    throw err;
  }

  // نرمال‌سازی + حذف تکرار (بر اساس URL و بعداً عنوان+قیمت)
  const seenUrl = new Set();
  const seenTitle = new Set();
  const results = [];
  rawItems.forEach((item, index) => {
    const r = normalizeResult(item, index);
    if (!r) return;
    if (r.url && seenUrl.has(r.url)) return;
    const tk = `${r.title.toLowerCase()}|${r.price}`;
    if (seenTitle.has(tk)) return;
    if (r.url) seenUrl.add(r.url);
    seenTitle.add(tk);
    results.push(r);
  });

  // اگر مدل لینک نداده باشد، از لینک‌های واقعی‌ای که در نتایج جستجوی وب
  // (annotations) استفاده کرده، نزدیک‌ترین عنوان را پیدا و تکمیل می‌کنیم
  if (annotations.length) {
    for (const r of results) {
      if (r.url) continue;
      const words = r.title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const hit = words.length
        ? annotations.find((a) => {
            const t = (a.title || "").toLowerCase();
            const u = (a.url || "").toLowerCase();
            return words.some((w) => t.includes(w) || u.includes(w));
          })
        : null;
      if (hit) r.url = hit.url;
    }
  }

  // ارزان‌ترین اول
  results.sort((a, b) => a.price - b.price || a._order - b._order);
  const limited = results.slice(0, MAX_RESULTS).map(({ _order, ...r }) => r);

  // شمارش بر اساس سایت (برای نشان‌های منبع در فرانت)
  const counts = new Map();
  for (const r of limited) {
    const prev = counts.get(r.source_label) || { id: r.source_id, label: r.source_label, count: 0 };
    prev.count += 1;
    counts.set(r.source_label, prev);
  }

  const data = {
    results: limited,
    query: raw,
    job: jobText,
    source: "",
    sources: [...counts.values()],
    errors: limited.length === 0 ? ["هوش مصنوعی نتوانست قیمت واقعی پیدا کند."] : [],
    queries: [raw],
    smart: true,
    model,
  };
  if (limited.length) cacheSet(cacheKey, data);
  return data;
}

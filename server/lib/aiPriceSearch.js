// ─── جستجوی قیمت زنده با هوش مصنوعی (کاملاً توسط AI) ───────────────────────
// قیمت‌ها از APIهای سایت‌های خاص (دیجی‌کالا/ترب/باسلام/…) خوانده نمی‌شوند؛
// هوش مصنوعی خودش در اینترنت جستجو می‌کند و قیمت‌های زنده از هر سایتی که
// مناسب بداند (بر اساس شغلِ کاربر) جمع می‌کند.
//
// سرعت: پرامپت عمداً فشرده نگه داشته می‌شود تا مدل کوتاه و سریع پاسخ دهد
// (۳ تا ۵ نتیجه، عنوان کوتاه، JSON فشرده) و تعداد نتایج وب پلاگین محدود است.
// جستجوی اینترنت طبق مستندات درگاه سازگار با OpenAI (OpenRouter/چابکان)
// با پلاگین `web` در بدنه‌ی درخواست فعال می‌شود؛ مدل CHABOKAN_AI_MODEL است.
// اگر درگاه پلاگین را نپذیرد (خطای ۴۰۰)، بی‌صدا بدون پلاگین امتحان می‌شود.
//
// تصویر: مدل image صفحه را (هر جا در نتایج دید) می‌دهد؛ اگر نداد، سرور
// og:image همان URL را با timeout کوتاه می‌گیرد (فیل‌بک بی‌صدا).
//
// خروجی هم‌شکل priceSearch است تا فرانت بدون تغییر کار کند.
// منطق قیمت صفحه‌ی برآورد (تبدیل/تقسیم بر تعداد/بودجه) دست‌نخورده است.
import { aiChatComplete, aiConfigured, aiModel } from "./aiSupport.js";
import { parseAmount, formatAmount, safeHttpUrl } from "./utils.js";

const MAX_RESULTS = 10;
const TIMEOUT_MS = 90_000; // سقف کلی — پاسخ فشرده معمولاً زودتر تمام می‌شود
const CACHE_TTL = 60_000;
const CACHE_MAX = 200;
const IMAGE_FETCH_TIMEOUT = 2500; // هر صفحه‌ی تصویر حداکثر ۲.۵ ثانیه
const IMAGE_FETCH_MAX = 4; // فیل‌بک تصویر فقط برای ۴ نتیجه‌ی اول
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

// پرامپت عمداً کوتاه و مستقیم است (مثل پرامپت ساده‌ای که در چت چابکان
// سریع جواب می‌دهد): دستور کم، محدودیت کم، خروجی فشرده با کلیدهای کوتاه
// (توکنِ دی‌کد کمتر = پاسخ سریع‌تر).
const SYSTEM_PROMPT = `قیمت‌یاب بازار آنلاین ایران؛ قیمت‌های به‌روز را فقط از نتایج زنده‌ی جستجوی اینترنت بیاور و شغلِ کاربر را در انتخاب سایت رعایت کن.

فقط یک JSON فشرده بده، بدون هیچ متن دیگر:
{"r":[{"p":1250000,"t":"تی حوله‌ای صنعتی ۱۲ عددی","u":"https://...","s":"دیجی‌کالا","i":"https://..."}]}

- p: قیمت به تومان، عدد صحیح (ریال ÷۱۰؛ اگر بازه بود، حدِ پایین)
- t: عنوان کوتاه کالا (حداکثر ۴۰ نویسه؛ اگر قیمت برای بسته/کارتن است، در همین‌جا بنویس)
- u: لینک دقیقِ صفحه‌ای که قیمت را از آن خواندی
- s: نام سایت
- i: لینک تصویر کالا (اگر ندیدی، خالی)
- ۳ تا ۶ نتیجه، ترجیحاً سایت‌های متفاوت؛ قیمتِ کالای نامرتبط یا مشابهِ دیگر نده و چیزی اختراع نکن
`;

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

// ─── تصویر محصول: فیل‌بک سروری از og:image صفحه ──────────────────────────────
// نتایج پلاگین وب معمولاً متن‌اند و image همیشه در دسترس مدل نیست؛ اگر مدل
// تصویر نداده باشد، سرور og:image همان URL را با timeout کوتاه می‌گیرد.
const IMAGE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const IMAGE_TAG_RES = [
  /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"'>]+)["']/i,
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"'>]+)["']/i,
  /<meta[^>]+content=["']([^"'>]+)["'][^>]+property=["']og:image["']/i,
  /<meta[^>]+name=["']twitter:image[:\w]*["'][^>]+content=["']([^"'>]+)["']/i,
  /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"'>]+)["']/i,
];

async function fetchPageImage(pageUrl) {
  try {
    const res = await fetch(pageUrl, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT),
      headers: { "User-Agent": IMAGE_UA, "Accept-Language": "fa,en;q=0.8" },
    });
    if (!res.ok || !res.body) return "";
    // og:image در head است؛ فقط ۶۰K اول را بخوان (صفحه‌های چند مگابایتی را نگه ندار)
    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= 60_000) break;
    }
    const html = Buffer.concat(chunks).toString("utf8");
    for (const re of IMAGE_TAG_RES) {
      const m = html.match(re);
      if (!m || !m[1]) continue;
      try {
        return safeHttpUrl(new URL(m[1].trim(), pageUrl).href) || "";
      } catch {
        /* آدرس نسبیِ نامعتبر */
      }
    }
  } catch {
    /* timeout یا خطای شبکه — بی‌صدا بدون تصویر */
  }
  return "";
}

/** نتیجه‌ی خام مدل → شکل خروجی priceSearch (قیمت عددی و تومانی). */
function normalizeResult(item, index) {
  if (!item || typeof item !== "object") return null;
  // کلیدهای جدیدِ فشرده (p/t/u/s/i) + کلیدهای بلندِ قدیمی (سازگاری با هر فرمت مدل)
  const title = String(item.t ?? item.title ?? item.name ?? "").trim().slice(0, 220);
  if (!title) return null;

  // قیمت: عدد خالص (Persian/Arabic digits و جداکننده هم می‌پذیرد) — همیشه تومان
  const rawPrice = item.p ?? item.price ?? item.amount ?? item.price_toman ?? item.value ?? null;
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

  const url = safeHttpUrl(item.u ?? item.url ?? item.link ?? item.href ?? "") || "";
  const source = String(item.s ?? item.source ?? item.site ?? item.store ?? "").trim().slice(0, 60) || "فروشگاه آنلاین";
  const image = safeHttpUrl(item.i ?? item.image ?? item.img ?? item.photo ?? "") || "";

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
  // پیام کاربر هم مینیمال است تا پری‌فیل کوتاه و سریع باشد
  const userMessage = jobText ? `شغل: «${jobText}»\nکالا: «${raw}»` : `کالا: «${raw}»`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];
  const callOpts = {
    model,
    // سقف توکن فقط «سقف» است و خروجی کوتاه را کند نمی‌کند؛ اما برای مدل‌هایی که
    // در حین جستجوی وب reasoning می‌کنند، سقف کوچک باعث پاسخِ خالی (length)
    // می‌شود — به‌همین‌دلیل ۳۰۰ نگه داشته می‌شود.
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
    if (err?.status === 400) {
      console.warn("جستجوی قیمت AI: پلاگین جستجوی اینترنت پذیرفته نشد؛ بدون آن تلاش دوباره می‌شود.");
      ({ reply, annotations } = await aiChatComplete(messages, callOpts));
    } else if (err?.finishReason === "length") {
      // مدل سقف توکن را در reasoning/جستجو خرچ کرده و متن ننوشته؛ با سقف بزرگ‌تر یک‌بار دیگر
      console.warn("جستجوی قیمت AI: پاسخ با سقف توکن پر شد (length)؛ با maxTokens=6000 تلاش دوباره می‌شود.");
      ({ reply, annotations } = await aiChatComplete(messages, {
        ...callOpts,
        webSearch: true,
        maxTokens: 6000,
      }));
    } else {
      throw err;
    }
  }

  const parsed = extractJson(reply);
  // فرمت جدید: {"r":[...]} — فرمت قدیمی: {"results":[...]} (هر دو پذیرفته می‌شود)
  const rawItems = Array.isArray(parsed?.r) ? parsed.r : Array.isArray(parsed?.results) ? parsed.results : [];
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

  // نتایج بدون تصویر: og:image صفحه را موازی و با timeout کوتاه می‌گیریم
  // (سقف IMAGE_FETCH_MAX نتیجه تا جستجو کند نشده، تصویر را طولانی نکند)
  const needImage = limited.filter((r) => !r.image && r.url).slice(0, IMAGE_FETCH_MAX);
  if (needImage.length) {
    await Promise.all(needImage.map(async (r) => {
      r.image = await fetchPageImage(r.url);
    }));
  }

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

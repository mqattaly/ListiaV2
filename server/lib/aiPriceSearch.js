// ─── جستجوی قیمت هوشمند شغل‌محور ───────────────────────────────────────────
// کاربر شغلش را انتخاب می‌کند و نام یک کالا را می‌زند؛ هوش مصنوعی عبارت را
// برای همان حرفه بازنویسی می‌کند (واژه‌های صنعتی/حرفه‌ای، گونه‌ی مناسب کار)
// و منابع مناسب را برمی‌گزیند. خود AI به اینترنت دست ندارد؛ قیمت واقعی و
// قابل‌کلیک همچنان با جستجوگرهای بازار (priceSearch) گرفته می‌شود.
// اگر AI فعال نباشد یا خطا بدهد، جست‌وجو بی‌صدا به حالت عادی برمی‌گردد.
import { aiChatComplete, aiConfigured } from "./aiSupport.js";
import { priceSearch, PRICE_SOURCES } from "./priceSearch.js";
import { normalizeName } from "./utils.js";

const SOURCE_IDS = Object.keys(PRICE_SOURCES);
const MAX_VARIANTS = 3; // شامل عبارت اصلی کاربر

const STRATEGY_SYSTEM = `تو دستیار جست‌وجوی کالا در بازار آنلاین ایران هستی. کاربر شغل/حرفه‌ی خودش و نام یک کالا را می‌دهد؛
تو عبارت جست‌وجو را طوری بازنویسی می‌کنی که دقیقاً همان گونه‌ی کالا که در آن شغل استفاده می‌شود در فروشگاه‌های آنلاین پیدا شود.

قوانین سخت:
- فقط و فقط یک شیء JSON معتبر بده، بدون متن اضافه یا کد‌فنس.
- queries: بین ۲ تا ${MAX_VARIANTS} عبارت فارسی، کوتاه و قابل جست‌وجو در فروشگاه؛ عبارت اول باید خودِ نام کالای کاربر (با املای رایج) باشد.
  بقیه عبارت‌ها می‌توانند معادل صنعتی/حرفه‌ای، گونه‌ی مناسب شغل یا نام رایج بازار باشند (مثلاً برای شغل خدمات نظافت و «تی حوله‌ای»:
  «تی شور حوله‌ای صنعتی»، «دسته تی حوله‌ای»). هرگز به کالای دیگری منحرف نشو و واژه‌های اصلی نام کالا را حفظ کن.
- sources: ترتیب منابع مناسبِ این کالا در این شغل از میان همین شناسه‌ها:
  digikala (ابزار، تجهیزات برقی/دیجیتال/صنعتی سبک و کالای برنددار)،
  torob (کالای عمومی خرده‌فروشی، تقریباً همه‌چیز)،
  basalam (کالای سنتی، صنفی، دستی و محلی)،
  tedadbala (خرید عمده و مواد مصرفی انبوه).
  بین ۲ تا ۴ شناسه بده؛ معمولاً جست‌وجوی عمومی و تخصصی هر دو باشند.

ساختار خروجی:
{"queries":["نام کالای کاربر","گونه‌ی حرفه‌ای آن"],"sources":["torob","digikala","basalam","tedadbala"]}`;

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

/**
 * استراتژی جست‌وجوی هوشمند برای یک کالا در یک شغل.
 * همیشه لااقل عبارت اصلی کاربر و همه‌ی منابع برمی‌گردد (پس زمینه امن دارد).
 * @returns {Promise<{queries:string[], sources:string[], model:string|null}>}
 */
export async function buildSearchStrategy({ job = "", query = "" } = {}) {
  const q = String(query ?? "").trim().slice(0, 120);
  const fallback = { queries: [q], sources: SOURCE_IDS, model: null };
  if (!q) return fallback;
  if (!aiConfigured()) return fallback;

  const jobText = String(job ?? "").trim().slice(0, 120);
  if (jobText.length < 2) return fallback;

  try {
    const { reply, model } = await aiChatComplete(
      [
        { role: "system", content: STRATEGY_SYSTEM },
        {
          role: "user",
          content: `شغل من: «${jobText}»
کالای مورد جست‌وجو: «${q}»
عبارت‌ها و ترتیب منابع را فقط به‌صورت JSON بده.`,
        },
      ],
      { maxTokens: 500, temperature: 0.25, timeoutMs: 20000, label: "جستجوی شغلی AI", maxChars: 2000 }
    );
    const parsed = extractJson(reply);

    // عبارت‌ها: اول عبارت اصلی کاربر، بعد عبارت‌های معتبر مدل (بدون تکرار)
    const queries = [q];
    const rawQueries = Array.isArray(parsed?.queries) ? parsed.queries : [];
    for (const v of rawQueries) {
      const s = String(v ?? "").trim().slice(0, 80);
      if (s.length < 2) continue;
      if (queries.some((x) => normalizeName(x) === normalizeName(s))) continue;
      queries.push(s);
      if (queries.length >= MAX_VARIANTS) break;
    }

    let sources = [];
    if (Array.isArray(parsed?.sources)) {
      sources = [...new Set(parsed.sources.map((s) => String(s).trim().toLowerCase()).filter((s) => SOURCE_IDS.includes(s)))];
    }
    if (!sources.length) sources = SOURCE_IDS;

    return { queries, sources, model };
  } catch (err) {
    console.warn("جستجوی شغلی AI در دسترس نبود؛ جست‌وجوی عادی اجرا می‌شود →", String(err?.message ?? err).slice(0, 140));
    return fallback;
  }
}

function titleKey(title) {
  // نرمال‌سازی فارسی + حذف پسوندهای متغیر برای ادغام یک کالای واحد از منابع مختلف
  const n = normalizeName(title)
    .replace(/[()«»"',.،؛:!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // هسته‌ی اول ۳۸ نویسه (گونه/رنگ/حجم متفاوت با همین هسته یکسان فرض نمی‌شوند؛
  // ولی تیترهای تقریباً یکسانِ ترب و دیجی‌کالا ادغام می‌شوند)
  return n.slice(0, 38).trim();
}

/**
 * جست‌وجوی قیمت شغل‌محور.
 * دور اول: عبارت اصلی کاربر در همه‌ی منابعِ پیشنهادی (موازی).
 * دور دوم (فقط منابع بی‌نتیجه): عبارت‌های جایگزین AI به‌ترتیب.
 * خروجی هم‌شکل priceSearch است تا فرانت بدون تغییر کار کند.
 */
export async function smartPriceSearch({ job = "", query = "" } = {}) {
  const raw = String(query ?? "").trim().slice(0, 180);
  if (!raw) return { results: [], query: "", job: "", sources: [], errors: [], queries: [], smart: false };

  const strategy = await buildSearchStrategy({ job, query: raw });
  const queries = strategy.queries;
  const sources = strategy.sources;
  const smart = Boolean(strategy.model);

  const errors = [];
  const perSource = new Map(sources.map((s) => [s, []]));

  const runOne = async (source, q) => {
    try {
      const data = await priceSearch(q, "", source);
      (data.errors ?? []).forEach((e) => errors.push(e));
      return data.results ?? [];
    } catch (err) {
      errors.push(`${PRICE_SOURCES[source]?.label || source}: ${String(err?.message ?? err).slice(0, 120)}`);
      return [];
    }
  };

  // دور اول با عبارت اصلی (همان تجربه‌ی فعلی، ولی با ترتیب منابع پیشنهادی AI)
  const firstRound = await Promise.all(sources.map((s) => runOne(s, queries[0])));
  sources.forEach((s, i) => perSource.set(s, firstRound[i]));

  // دور دوم فقط برای منابعی که هیچ نتیجه‌ای نداده‌اند و عبارت جایگزین هست
  const hungry = sources.filter((s) => perSource.get(s).length === 0).slice(0, 4);
  if (hungry.length && queries.length > 1) {
    await Promise.all(
      hungry.map(async (s) => {
        for (const vq of queries.slice(1)) {
          const found = await runOne(s, vq);
          if (found.length) {
            perSource.set(s, found);
            break;
          }
        }
      })
    );
  }

  // ادغام + حذف تکرار بین منابع (ترب اغلب همان کالای دیجی‌کالا را برمی‌گرداند)
  const seenByUrl = new Set();
  const seenByTitle = new Set();
  const merged = [];
  for (const s of sources) {
    for (const item of perSource.get(s)) {
      if (item.url && seenByUrl.has(item.url)) continue;
      const tk = titleKey(item.title);
      // هسته‌ی تیتر بین منابع مختلفِ قیمت‌مشابه یک کالاست؛ ارزان‌ترین نگه داشته شود
      if (seenByTitle.has(tk + s)) continue;
      if (item.url) seenByUrl.add(item.url);
      seenByTitle.add(tk + s);
      merged.push(item);
    }
  }
  // ادغام بین‌منبعیِ هسته‌ی یکسان (ارزان‌ترین بماند)
  const cross = new Map();
  for (const item of merged) {
    const k = titleKey(item.title);
    const old = cross.get(k);
    if (!old || item.price < old.price) cross.set(k, item);
  }
  let results = [...cross.values()];

  // مرتب‌سازی: ترتیب منابع AI، سپس ارزان‌ترین اول
  const order = Object.fromEntries(sources.map((s, i) => [s, i]));
  results.sort((a, b) => (order[a.source_id] ?? 9) - (order[b.source_id] ?? 9) || a.price - b.price);
  results = results.slice(0, 14);

  const counts = sources.map((id) => ({
    id,
    label: PRICE_SOURCES[id].label,
    count: results.filter((r) => r.source_id === id).length,
  }));

  return {
    results,
    query: raw,
    job: String(job ?? "").trim().slice(0, 120),
    source: "",
    sources: counts,
    errors: [...new Set(errors)].slice(0, 8),
    queries,
    smart,
  };
}

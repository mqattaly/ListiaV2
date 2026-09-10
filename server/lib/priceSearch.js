// ─── جستجوی قیمت زنده از بازارهای آنلاین (پورت فشرده) ───────────────────────
// دیجی‌کالا و ترب از API عمومی؛ بالام با POST. نتیجه‌ی بدون قیمت برگردانده
// نمی‌شود. کشِ ۴۵ ثانیه‌ای برای جستجوی تکراری.
import { parseAmount, formatAmount, safeHttpUrl } from "./utils.js";

const SEARCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const CACHE_TTL = 45_000;
const cache = new Map();

export const PRICE_SOURCES = {
  digikala: {
    id: "digikala",
    label: "دیجی‌کالا",
    domains: ["digikala.com"],
  },
  torob: {
    id: "torob",
    label: "ترب",
    domains: ["torob.com"],
  },
  basalam: {
    id: "basalam",
    label: "باسلام",
    domains: ["basalam.com"],
  },
};

const SOURCE_ALIASES = {
  digikala: "digikala",
  dk: "digikala",
  "دیجی کالا": "digikala",
  "دیجی‌کالا": "digikala",
  torob: "torob",
  ترب: "torob",
  basalam: "basalam",
  باسلام: "basalam",
};

function sourceForUrl(url) {
  try {
    let host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    if (host.startsWith("www.")) host = host.slice(4);
    for (const source of Object.values(PRICE_SOURCES)) {
      if (source.domains.some((d) => host === d || host.endsWith("." + d))) {
        return source.id;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": SEARCH_UA,
        "Accept-Language": "fa,en;q=0.8",
        ...(options.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── تشخیص هوشمند واحد قیمت (ریال/تومان) ─────────────────────────────────────
// قیمت نمایشی سایت‌های ایرانی همیشه «تومان» است، ولی فیلد عددی API ممکن است
// ریال یا تومان باشد (و گاهی بدون اطلاع عوض می‌شود). ترتیب شواهد:
//  ۱) متن نمایشی قیمت (price_text و مشابه‌ها) ← همیشه تومان
//  ۲) فیلد واحد/ارز (currency) ← ریال/تومان صریح
//  ۳) ریاضی: ریال همیشه مضرب ۱۰ است، پس عددِ نبخش‌پذیر بر ۱۰ حتماً تومان است
//  ۴) پیش‌فرض هر منبع + کالیبراسیون خودکار بین منابع
const RIAL_UNIT_RE = /ریال|ريال|rial|irr/i;
const TOMAN_UNIT_RE = /تومان|تومن|toman|(?<![a-z])irt(?![a-z])/i;

const SOURCE_DEFAULT_UNIT = {
  digikala: "rial",
  torob: "toman",
  basalam: "rial",
};

function detectUnitFromCurrency(currency) {
  const c = String(currency ?? "").trim();
  if (!c) return null;
  const isRial = RIAL_UNIT_RE.test(c);
  const isToman = TOMAN_UNIT_RE.test(c);
  if (isRial && !isToman) return "rial";
  if (isToman && !isRial) return "toman";
  return null;
}

/** هر ورودی عددی/متنی را به تومان نرمال می‌کند. null یعنی قیمت نامعتبر. */
function toTomanAmount(rawValue, { source = "", currency = "", priceText = "" } = {}) {
  if (priceText) {
    const textPrice = parseAmount(priceText);
    if (textPrice !== null && textPrice > 0) {
      return { price: Math.round(textPrice), detected: "toman-text" };
    }
  }
  const num = Number(rawValue);
  if (!Number.isFinite(num) || num <= 0) return null;
  const explicit = detectUnitFromCurrency(currency);
  if (explicit === "rial") return { price: Math.round(num / 10), detected: "rial" };
  if (explicit === "toman") return { price: Math.round(num), detected: "toman" };
  if (Math.abs(num % 10) > 1e-9) {
    return { price: Math.round(num), detected: "toman" };
  }
  const def = SOURCE_DEFAULT_UNIT[source] || "toman";
  if (def === "rial") return { price: Math.round(num / 10), detected: "rial-default" };
  return { price: Math.round(num), detected: "toman-default" };
}

/** کلیدهای متنی احتمالی قیمت را از آبجکت‌ها پیدا می‌کند. */
function findPriceText(...objs) {
  const keys = ["price_text", "selling_price_text", "display_price", "formatted_price", "price_string", "price_label", "priceText"];
  for (const obj of objs) {
    if (!obj || typeof obj !== "object") continue;
    for (const key of keys) {
      const v = obj[key];
      if (v && parseAmount(v) > 0) return String(v);
    }
  }
  return "";
}

function tomanResult({ title, priceInfo, url, image, sourceId }) {
  if (!priceInfo || !(priceInfo.price > 0)) return null;
  if (!title || !url) return null;
  const price = Math.round(priceInfo.price);
  return {
    title: String(title).trim().slice(0, 220),
    price,
    price_label: formatAmount(price) + " تومان",
    price_unit: "تومان",
    url,
    image: image || "",
    source_id: sourceId,
    source_label: PRICE_SOURCES[sourceId].label,
  };
}

function buildResult({ title, rawValue, sourceId, url, image, currency = "", priceText = "" }) {
  const priceInfo = toTomanAmount(rawValue, { source: sourceId, currency, priceText });
  return tomanResult({ title, priceInfo, url, image, sourceId });
}

// دیجی‌کالا: API عمومی جستجو — واحد با تشخیص هوشمند (معمولاً ریال ← ÷۱۰)
async function searchDigikala(query) {
  const url =
    "https://api.digikala.com/v1/search/?page=1&rows=8&q=" +
    encodeURIComponent(query);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const products = body?.data?.products ?? [];
  return products
    .map((item) => {
      const product = item.product ?? item;
      const priceObj = product.default_variant?.price ?? {};
      return buildResult({
        title: product.title_fa ?? product.title_en ?? "",
        rawValue: priceObj.selling_price ?? priceObj.rrp_price ?? null,
        sourceId: "digikala",
        url: `https://www.digikala.com/product/dkp-${product.id}`,
        image:
          product.images?.main?.url ??
          (Array.isArray(product.images) ? product.images[0]?.url : null) ??
          "",
        currency: priceObj.currency ?? "",
        priceText: findPriceText(priceObj, product.default_variant, product),
      });
    })
    .filter(Boolean);
}

// ترب: API عمومی جستجو — price_text مبنای تومان، فیلد price هم تومانی است
async function searchTorob(query) {
  const url =
    "https://api.torob.com/v4/base-product/search/?size=8&q=" +
    encodeURIComponent(query);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const products = body?.results ?? [];
  return products
    .map((item) =>
      buildResult({
        title: item.name1 ?? item.name ?? "",
        rawValue: item.price ?? null,
        sourceId: "torob",
        url: item.web_client_absolute_url
          ? "https://torob.com" + item.web_client_absolute_url
          : item.url1 || "",
        image: item.image_url ?? "",
        currency: item.currency ?? "",
        priceText: item.price_text ?? findPriceText(item),
      })
    )
    .filter(Boolean);
}

// باسلام: OpenAPI — واحد از روی currency، بدون شاهد با تشخیص هوشمند
async function searchBasalam(query) {
  const res = await fetchWithTimeout(
    "https://openapi.basalam.com/v1/products/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ q: query, page: 0, size: 8 }),
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const products = body?.data?.products ?? body?.products ?? [];
  return products
    .map((item) =>
      buildResult({
        title: item.name ?? item.title ?? "",
        rawValue: item.price ?? item.selling_price ?? item.current_price ?? item.min_price ?? null,
        sourceId: "basalam",
        url: item.id ? `https://basalam.com/product/${item.id}` : item.url || "",
        image:
          item.photo?.x256?.url ??
          item.photo?.url ??
          (Array.isArray(item.photos) ? item.photos[0]?.s256?.url : null) ??
          "",
        currency: item.currency ?? "",
        priceText: findPriceText(item, item.price_detail, item.prices),
      })
    )
    .filter(Boolean);
}

const SEARCHERS = {
  digikala: searchDigikala,
  torob: searchTorob,
  basalam: searchBasalam,
};

function resultMatchesQuery(item, query) {
  const words = String(query)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (!words.length) return true;
  const title = item.title.toLowerCase();
  return words.every((w) => title.includes(w));
}

function dedupe(results) {
  const seen = new Set();
  return results.filter((item) => {
    const key = `${item.source_id}:${item.title}:${item.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function medianOf(numbers) {
  if (!numbers.length) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * کالیبراسیون خودکار واحد بین منابع: برای یک کالای یکسان، میانه‌ی قیمت
 * منابع باید هم‌مرتبه باشد. اگر میانه‌ی یک منبع دقیقاً ~۱۰ برابر کوچک‌تر
 * یا بزرگ‌تر از بقیه بود، یعنی واحدش اشتباه تشخیص داده شده و همان‌جا اصلاح
 * می‌شود (×۱۰ یا ÷۱۰). این لایه، تغییرِ بی‌خبرِ واحد APIها را هم پوشش می‌دهد.
 */
function autoCalibrateUnits(items) {
  const bySource = new Map();
  for (const item of items) {
    if (!bySource.has(item.source_id)) bySource.set(item.source_id, []);
    bySource.get(item.source_id).push(item);
  }
  if (bySource.size < 2) return items;
  const medians = new Map();
  for (const [src, list] of bySource) {
    medians.set(src, medianOf(list.map((i) => i.price)));
  }
  for (const [src, list] of bySource) {
    if (list.length < 2) continue;
    const rest = items.filter((i) => i.source_id !== src).map((i) => i.price);
    if (rest.length < 2) continue;
    const med = medians.get(src);
    const base = medianOf(rest);
    if (!med || !base) continue;
    const ratio = base / med;
    let fix = 0;
    if (ratio >= 8 && ratio <= 12.5) fix = 10;
    else if (ratio >= 0.08 && ratio <= 0.125) fix = 0.1;
    if (!fix) continue;
    for (const item of list) {
      item.price = Math.round(item.price * fix);
      item.price_label = formatAmount(item.price) + " تومان";
      item.unit_fixed = fix === 10 ? "x10" : "/10";
    }
  }
  return items;
}

/** جستجوی قیمت زنده — پورت price_search */
export async function priceSearch(query, siteUrl = "", source = "") {
  query = String(query ?? "").trim().slice(0, 180);
  if (!query) {
    return { results: [], query: "", site: "", source: "", sources: [], errors: [] };
  }

  const safeSite = safeHttpUrl(siteUrl);
  if (siteUrl && !safeSite) throw new Error("آدرس سایت معتبر نیست.");
  const siteSource = safeSite ? sourceForUrl(safeSite) : null;
  if (safeSite && !siteSource) {
    throw new Error("فقط دیجی‌کالا، ترب و باسلام پشتیبانی می‌شوند.");
  }

  let selected = SOURCE_ALIASES[String(source ?? "").trim().toLowerCase()] ?? "";
  if (selected && !PRICE_SOURCES[selected]) throw new Error("منبع قیمت پشتیبانی نمی‌شود.");
  if (siteSource) {
    if (selected && selected !== siteSource) {
      throw new Error("آدرس و منبع انتخاب‌شده با هم یکسان نیستند.");
    }
    selected = siteSource;
  }

  const sources = selected ? [selected] : Object.keys(PRICE_SOURCES);
  const cacheKey = `${query.toLowerCase()}|${selected || "*"}`;
  if (!safeSite) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;
  }

  const results = [];
  const errors = [];
  await Promise.all(
    sources.map(async (key) => {
      try {
        const found = await SEARCHERS[key](query);
        results.push(...found);
      } catch (err) {
        errors.push(`${PRICE_SOURCES[key].label}: ${String(err?.message ?? err).slice(0, 160)}`);
      }
    })
  );

  let filtered = autoCalibrateUnits(dedupe(results).filter((item) => resultMatchesQuery(item, query)));
  const order = Object.fromEntries(Object.keys(PRICE_SOURCES).map((k, i) => [k, i]));
  filtered.sort(
    (a, b) => (order[a.source_id] ?? 99) - (order[b.source_id] ?? 99) || a.title.localeCompare(b.title)
  );

  const counts = sources.map((key) => ({
    id: key,
    label: PRICE_SOURCES[key].label,
    count: filtered.filter((item) => item.source_id === key).length,
  }));

  const data = {
    results: filtered.slice(0, 12),
    query,
    site: safeSite,
    source: selected,
    sources: counts,
    errors: errors.slice(0, 8),
  };
  if (data.results.length && !safeSite) {
    cache.set(cacheKey, { at: Date.now(), data });
  }
  return data;
}

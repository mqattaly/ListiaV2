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

function tomanResult({ title, price, url, image, sourceId }) {
  if (price === null || price === undefined || !(price > 0)) return null;
  if (!title || !url) return null;
  return {
    title: String(title).trim().slice(0, 220),
    price: Math.round(price),
    price_label: formatAmount(Math.round(price)) + " تومان",
    url,
    image: image || "",
    source_id: sourceId,
    source_label: PRICE_SOURCES[sourceId].label,
  };
}

// دیجی‌کالا: API عمومی جستجو — قیمت‌ها ریالی هستند (÷۱۰)
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
      const rialPrice =
        product.default_variant?.price?.selling_price ??
        product.default_variant?.price?.rrp_price ??
        null;
      return tomanResult({
        title: product.title_fa ?? product.title_en ?? "",
        price: rialPrice ? rialPrice / 10 : null,
        url: `https://www.digikala.com/product/dkp-${product.id}`,
        image:
          product.images?.main?.url ??
          (Array.isArray(product.images) ? product.images[0]?.url : null) ??
          "",
        sourceId: "digikala",
      });
    })
    .filter(Boolean);
}

// ترب: API عمومی جستجو — price ریالی است، price_text تومانی
async function searchTorob(query) {
  const url =
    "https://api.torob.com/v4/base-product/search/?size=8&q=" +
    encodeURIComponent(query);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const products = body?.results ?? [];
  return products
    .map((item) => {
      let price = parseAmount(item.price_text);
      if (price === null && item.price) price = item.price / 10;
      return tomanResult({
        title: item.name1 ?? item.name ?? "",
        price,
        url: item.web_client_absolute_url
          ? "https://torob.com" + item.web_client_absolute_url
          : item.url1 || "",
        image: item.image_url ?? "",
        sourceId: "torob",
      });
    })
    .filter(Boolean);
}

// باسلام: OpenAPI — قیمت ریالی (IRR → ÷۱۰)
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
    .map((item) => {
      const rial =
        item.price ??
        item.selling_price ??
        item.current_price ??
        item.min_price ??
        null;
      return tomanResult({
        title: item.name ?? item.title ?? "",
        price:
          rial != null && /irr|rial|ریال/i.test(String(item.currency ?? "irr"))
            ? rial / 10
            : rial,
        url: `https://basalam.com/product/${item.id}`,
        image:
          item.photo?.x256?.url ??
          item.photo?.url ??
          (Array.isArray(item.photos) ? item.photos[0]?.s256?.url : null) ??
          "",
        sourceId: "basalam",
      });
    })
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

  let filtered = dedupe(results).filter((item) => resultMatchesQuery(item, query));
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

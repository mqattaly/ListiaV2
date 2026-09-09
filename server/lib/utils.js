// ─── ابزارهای عمومی لیستیا (پورت از app.py) ─────────────────────────────────
import crypto from "node:crypto";

export const UNIT_TYPES = ["عدد", "کارتن", "بسته", "گونی", "کیلو"];

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩";
const EN_DIGITS = "01234567890123456789";

/** تبدیل ارقام فارسی/عربی به انگلیسی */
export function toEnDigits(raw) {
  let out = String(raw ?? "");
  for (let i = 0; i < FA_DIGITS.length; i++) {
    out = out.split(FA_DIGITS[i]).join(EN_DIGITS[i]);
  }
  return out;
}

/** عددِ تعداد/قیمت را از رشته‌ی فارسی/انگلیسی با جداکننده می‌خواند. */
export function parseAmount(raw) {
  if (raw === null || raw === undefined) return null;
  let text = String(raw).trim();
  if (!text) return null;
  text = toEnDigits(text);
  // نقطه در ورودی‌های معمولی اعشار است، اما گاهی قیمت به شکل ۷.۸۹۰.۰۰۰
  // نوشته می‌شود؛ فقط الگوی جداکننده‌ی سه‌رقمی را یک‌جا حذف کن.
  if (/^\d{1,3}([,٬٫.]\d{3})+$/.test(text)) {
    text = text.replace(/[,٬٫.]/g, "");
  } else {
    text = text
      .replace(/\u066c/g, "")
      .replace(/٬/g, "")
      .replace(/,/g, "")
      .replace(/ /g, "")
      .replace(/\u200c/g, "")
      .replace(/٫/g, ".");
  }
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

/** نمایش مبلغ با جداکننده‌ی هزارگان (۲۵٬۰۰۰ → 25,000). */
export function formatAmount(value) {
  if (value === null || value === undefined || value === "") return "";
  let number = Number(value);
  if (!Number.isFinite(number)) {
    const parsed = parseAmount(value);
    if (parsed === null) return "";
    number = parsed;
  }
  if (Math.abs(number - Math.round(number)) < 1e-9) {
    return Math.round(number).toLocaleString("en-US");
  }
  return number
    .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    .replace(/\.?0+$/, "");
}

/** ورودی کاربر را برای ذخیره نرمال می‌کند (ارقام انگلیسی، بدون جداکننده). */
export function storeAmount(raw) {
  const number = parseAmount(raw);
  if (number === null) return String(raw ?? "").trim().slice(0, 50);
  if (Math.abs(number - Math.round(number)) < 1e-9) {
    return String(Math.round(number)).slice(0, 50);
  }
  return String(Number(number.toFixed(4))).slice(0, 50);
}

/** مقدار تخمین قیمت برای ذخیره: خالی → null، نامعتبر → خطا. */
export function estimateAmountForStorage(raw, label) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const number = parseAmount(text);
  if (number === null || number < 0) {
    throw new Error(`${label} باید عددی معتبر باشد.`);
  }
  return storeAmount(number);
}

// ─── تاریخ شمسی ─────────────────────────────────────────────────────────────

const jalaliDateFmt = new Intl.DateTimeFormat("en-US-u-ca-persian", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

function jalaliParts(date) {
  const parts = jalaliDateFmt.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** تاریخ میلادی ISO (YYYY-MM-DD) → برچسب شمسی (YYYY/MM/DD) */
export function shamsiLabel(dateISO) {
  if (!dateISO) return null;
  const text = String(dateISO).slice(0, 10);
  const d = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const { year, month, day } = jalaliParts(d);
  return `${year}/${month}/${day}`;
}

/** تاریخ‌وساعت UTC → برچسب شمسی با ساعت (آفست تهران +۳:۳۰). */
export function shamsiDatetimeLabel(dtStr) {
  if (!dtStr) return null;
  const d = new Date(String(dtStr).replace(" ", "T") + (String(dtStr).endsWith("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return null;
  const local = new Date(d.getTime() + 3.5 * 3600 * 1000);
  const time = local.toISOString().slice(11, 19);
  const { year, month, day } = jalaliParts(local);
  return `${year}/${month}/${day} ${time}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** تاریخ ذخیره‌شده (ISO یا 'YYYY-MM-DD HH:MM:SS') → Date در UTC؛ نامعتبر → null */
export function parseUtc(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replace(" ", "T");
  if (!/Z$/.test(s) && !/[+-]\d{2}:?\d{2}$/.test(s)) s += "Z";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function utcNowISO() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// ─── اعتبارسنجی‌ها ──────────────────────────────────────────────────────────

/** نرمال‌سازی نام برای مقایسه (ي→ی، ك→ک، حروف کوچک). */
export function normalizeName(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .toLowerCase();
}

/** شماره موبایل ایران → 09xxxxxxxxx (یا null / "") */
export function normalizePhone(raw) {
  const text = toEnDigits(String(raw ?? "")).trim();
  if (!text) return "";
  let digits = text.replace(/\D/g, "");
  if (digits.startsWith("0098") && digits.length === 14) digits = "0" + digits.slice(4);
  else if (digits.startsWith("98") && digits.length === 12) digits = "0" + digits.slice(2);
  else if (digits.length === 10 && digits.startsWith("9")) digits = "0" + digits;
  return /^09\d{9}$/.test(digits) ? digits : null;
}

/** ایمیل را برای ذخیره و جست‌وجوی یکتا نرمال می‌کند. */
export function normalizeEmail(raw) {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email || email.length > 255) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** نام/نام خانوادگی: فقط حروف و فاصله. */
export function cleanPersonName(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .slice(0, 100);
}

/** سیاست قدرت رمز عبور — همان نسخه‌ی اصلی. */
export function passwordStrengthError(password) {
  const pw = String(password ?? "");
  if (pw.length <= 8) return "رمز عبور باید بیشتر از ۸ کاراکتر باشد.";
  if (!/[a-z]/.test(pw)) return "رمز عبور باید حداقل یک حرف کوچک انگلیسی داشته باشد.";
  if (!/[A-Z]/.test(pw)) return "رمز عبور باید حداقل یک حرف بزرگ انگلیسی داشته باشد.";
  if (!/\d/.test(pw)) return "رمز عبور باید حداقل یک عدد داشته باشد.";
  return null;
}

/** آدرس HTTP(S) امن؛ دامنه‌ی بدون اسکیم را https می‌کند. */
export function safeHttpUrl(raw) {
  let text = String(raw ?? "").trim();
  if (!text) return "";
  if (text.startsWith("//")) text = "https:" + text;
  if (!/^https?:\/\//i.test(text)) {
    if (/^[\w.-]+\.[A-Za-z]{2,}(\/.*)?$/.test(text)) text = "https://" + text;
    else return "";
  }
  try {
    const parsed = new URL(text);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

// ─── مرتب‌سازی فارسی ────────────────────────────────────────────────────────

const faCollator = new Intl.Collator("fa");

/** مرتب‌سازی نام‌ها بر اساس الفبای فارسی. */
export function supplierSortKey(name) {
  return String(name ?? "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .trim()
    .toLowerCase();
}

export function compareSupplierNames(a, b) {
  return faCollator.compare(supplierSortKey(a), supplierSortKey(b));
}

/** شباهت دو رشته (نزدیک به difflib.SequenceMatcher.ratio) برای ایمپورت. */
export function similarityRatio(a, b) {
  const s1 = String(a ?? "");
  const s2 = String(b ?? "");
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const bigrams = (s) => {
    const set = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      set.set(bg, (set.get(bg) ?? 0) + 1);
    }
    return set;
  };
  const b1 = bigrams(s1);
  const b2 = bigrams(s2);
  let matches = 0;
  for (const [bg, count] of b1) {
    const other = b2.get(bg);
    if (other) matches += Math.min(count, other);
  }
  return (2 * matches) / (s1.length - 1 + s2.length - 1);
}

/** نزدیک‌ترین نام موجود (جایگزین difflib.get_close_matches). */
export function closestMatch(target, candidates, cutoff = 0.82) {
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = similarityRatio(target, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore >= cutoff ? best : null;
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function randomCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

export function clampText(value, max) {
  const text = String(value ?? "").trim();
  return text.slice(0, max);
}

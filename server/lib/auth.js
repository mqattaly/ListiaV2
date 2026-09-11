// ─── احراز هویت: هش رمز (scrypt)، نشست کوکی امضاشده، محدودسازی نرخ ──────────
import crypto from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getUserById } from "./db.js";

const scryptAsync = promisify(crypto.scrypt);
const pbkdf2Async = promisify(crypto.pbkdf2);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

// راز نشست: از محیط، یا ساخته‌شده و ذخیره‌شده در data (پایدار بین ری‌استارت‌ها)
function loadSecret() {
  const fromEnv = (process.env.SECRET_KEY || "").trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SECRET_KEY در محیط پروداکشن ست نشده است. یک راز تصادفی قوی در SECRET_KEY تنظیم کنید."
    );
  }
  const secretPath = path.join(DATA_DIR, ".secret");
  try {
    const existing = fs.readFileSync(secretPath, "utf8").trim();
    if (existing) return existing;
  } catch {
    /* هنوز ساخته نشده */
  }
  const generated = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(secretPath, generated, { mode: 0o600 });
  return generated;
}
const SECRET = loadSecret();
export function getSecret() {
  return SECRET;
}

export const SESSION_COOKIE = "listia_session";
// کوکی‌ی نوشته‌شده توسط کلاینت (fallback برای iframeها)
export const CLIENT_TOKEN_COOKIE = "listia_token";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

// کوکی در حالت پیش‌فرض SameSite=None + Secure است تا داخل iframeِ پیش‌نمایش
// هم کار کند؛ برای اجرای محلی روی http خاموشش کنید: COOKIE_INSECURE=1
const COOKIE_INSECURE = process.env.COOKIE_INSECURE === "1";

// ─── هش رمز عبور (scrypt — هم‌ارز Werkzeug، نسخه‌ی غیرهمگام) ─────────────────
// نسخه‌ی async در استخر ترد libuv اجرا می‌شود و event loop را قفل نمی‌کند.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(String(password), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPasswordHash(stored, candidate) {
  try {
    const [params, saltPart, hashPart] = String(stored ?? "").split("$");
    if (!params || !saltPart || !hashPart) return false;
    const [scheme, ...nums] = params.split(":");
    const password = String(candidate ?? "");

    // Werkzeug پایتون هش را hex می‌نویسد و نمک را «رشته‌ی خام» به‌عنوان نمک
    // استفاده می‌کند؛ نسخه‌ی Node ما هر دو را base64. برای سازگاری کامل با
    // دیتابیس‌های نسخه‌ی پایتون، هر دو تفسیر امتحان می‌شود.
    const isHex = (s) => /^[0-9a-f]+$/i.test(s) && s.length % 2 === 0;
    let expected;
    if (isHex(hashPart)) expected = Buffer.from(hashPart, "hex");
    else expected = Buffer.from(hashPart, "base64");
    const saltVariants = [Buffer.from(saltPart, "utf8")];
    if (!isHex(saltPart)) {
      const b = Buffer.from(saltPart, "base64");
      if (b.length) saltVariants.push(b);
    }

    if (scheme === "scrypt") {
      const N = parseInt(nums[0], 10);
      const r = parseInt(nums[1], 10);
      const p = parseInt(nums[2], 10);
      if (!N || !r || !p) return false;
      // فرمول maxmem مثل Werkzeug + حاشیه‌ی امنیت
      const maxmem = 132 * N * r * p + 64 * 1024 * 1024;
      for (const salt of saltVariants) {
        try {
          const actual = await scryptAsync(password, salt, expected.length, { N, r, p, maxmem });
          if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) return true;
        } catch { /* پارامتر نامعتبر — تفسیر بعدی */ }
      }
      return false;
    }

    if (scheme === "pbkdf2") {
      const hashName = nums[0];
      const iterations = parseInt(nums[1], 10);
      if (!hashName || !iterations) return false;
      for (const salt of saltVariants) {
        try {
          const actual = await pbkdf2Async(password, salt, iterations, expected.length, hashName);
          if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) return true;
        } catch { /* الگوریتم نامعتبر — تفسیر بعدی */ }
      }
      return false;
    }

    return false;
  } catch {
    return false;
  }
}

// ─── نشست‌های امضاشده (شامل نسل/epoch برای ابطال با تغییر رمز) ───────────────
function sign(payload) {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function createSessionToken(userId, epoch = 0) {
  const payload = `${userId}.${Number(epoch) || 0}.${Date.now() + SESSION_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token) {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 4) return null;
  const [uid, epoch, exp, sig] = parts;
  if (sign(`${uid}.${epoch}.${exp}`) !== sig) return null;
  if (Number(exp) < Date.now()) return null;
  const num = Number(uid);
  if (!Number.isInteger(num) || num <= 0) return null;
  return { uid: num, epoch: Number(epoch) || 0 };
}

export function setSessionCookie(res, userId, epoch = 0) {
  const token = createSessionToken(userId, epoch);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: COOKIE_INSECURE ? "lax" : "none",
    secure: !COOKIE_INSECURE,
    partitioned: !COOKIE_INSECURE,
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res) {
  res.cookie(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: COOKIE_INSECURE ? "lax" : "none",
    secure: !COOKIE_INSECURE,
    partitioned: !COOKIE_INSECURE,
    path: "/",
    maxAge: 0,
  });
  // گونه‌ی قدیمیِ بدون Partitioned هم اگر مانده باشد پاک شود
  if (!COOKIE_INSECURE) {
    res.cookie(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      path: "/",
      maxAge: 0,
    });
  }
}

// پاک‌سازی کوکی پشتیبانِ نوشته‌شده توسط کلاینت (با و بدون Partitioned)
export function clearClientTokenCookie(res) {
  const variants = COOKIE_INSECURE
    ? [{ sameSite: "lax", secure: false }]
    : [
        { sameSite: "none", secure: true, partitioned: true },
        { sameSite: "none", secure: true },
      ];
  for (const v of variants) {
    res.cookie(CLIENT_TOKEN_COOKIE, "", { ...v, path: "/", maxAge: 0 });
  }
}

// ─── میدل‌ورها ───────────────────────────────────────────────────────────────
export function attachUser(req, _res, next) {
  let parsed = null;
  // ۱) پارامتر آدرس ?_lt= — مطمئن‌ترین مسیر برای iframeها
  const qToken = req.query?._lt;
  if (typeof qToken === "string" && qToken) parsed = parseSessionToken(qToken);
  // ۲) توکن Bearer — برای حالت عادی خارج از iframe
  if (!parsed) {
    const auth = String(req.headers.authorization ?? "");
    if (auth.toLowerCase().startsWith("bearer ")) {
      parsed = parseSessionToken(auth.slice(7).trim());
    }
  }
  // ۳) هدر اختصاصی — برخی پراکسی‌ها فقط Authorization استاندارد را می‌زنند
  if (!parsed) {
    const custom = String(req.headers["x-listia-auth"] ?? "");
    if (custom) parsed = parseSessionToken(custom);
  }
  // ۴) کوکی‌ی نشست (httpOnly، سمت سرور)
  if (!parsed) parsed = parseSessionToken(req.cookies?.[SESSION_COOKIE]);
  // ۵) کوکی‌ی پشتیبانِ نوشته‌شده توسط کلاینت (Partitioned/CHIPS)
  if (!parsed) parsed = parseSessionToken(req.cookies?.[CLIENT_TOKEN_COOKIE]);

  req.user = null;
  if (parsed) {
    const user = getUserById(parsed.uid);
    // نشست باید با نسل فعلی حساب یکی باشد (تغییر رمز → باطل‌شدن نشست‌های قدیمی)
    if (user && Number(user.session_epoch || 0) === parsed.epoch) {
      req.user = user;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    // برای عیب‌یابی بدون نشت توکن: فقط وجود/نبود توکن ثبت می‌شود، نه مقدارش
    console.log(
      `🔒 401 ${req.method} ${req.path} (cookie:${
        req.cookies?.[SESSION_COOKIE] || req.cookies?.[CLIENT_TOKEN_COOKIE] ? "✓" : "✗"
      } bearer:${String(req.headers.authorization ?? "").startsWith("Bearer ") ? "✓" : "✗"})`
    );
    return res.status(401).json({ success: false, message: "ابتدا وارد شوید." });
  }
  next();
}

// ─── محدودسازی نرخ (در حافظه، با جاروی دوره‌ای و سقف ظرفیت) ─────────────────
const buckets = new Map();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_BUCKETS = 20_000;

export function requestIP(req) {
  // بعد از app.set("trust proxy")، req.ip طبق تعداد پراکسی‌های مورد اعتماد،
  // اولین IP واقعیِ زنجیره‌ی X-Forwarded-For را برمی‌گرداند.
  const ip = req.ip || req.socket?.remoteAddress || "?";
  return ip.replace(/^::ffff:/, "");
}

export function recordAttempt(bucket, key, windowMs = WINDOW_MS) {
  const now = Date.now();
  const mapKey = `${bucket}:${key}`;
  const slot = buckets.get(mapKey) ?? { count: 0, reset: now + windowMs };
  if (now > slot.reset) {
    slot.count = 0;
    slot.reset = now + windowMs;
  }
  slot.count += 1;
  buckets.set(mapKey, slot);
}

export function isThrottled(bucket, key) {
  const slot = buckets.get(`${bucket}:${key}`);
  if (!slot) return false;
  if (Date.now() > slot.reset) {
    buckets.delete(`${bucket}:${key}`);
    return false;
  }
  return slot.count;
}

/** تعداد تلاش‌های باقی‌مانده را برمی‌گرداند؛ صفر یعنی مسدود است (شمارش از قبل). */
export function rateCheck(bucket, key, limit, windowMs = WINDOW_MS) {
  const count = isThrottled(bucket, key);
  if (count && count >= limit) return false;
  recordAttempt(bucket, key, windowMs);
  return true;
}

export function clearAttempts(bucket, key) {
  buckets.delete(`${bucket}:${key}`);
}

// پاسخ استاندارد ۴۲۹ برای مسدودشدگان
export function tooMany(res, message = "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.") {
  return res.status(429).json({ success: false, message, retry_after: 60 });
}

// جاروی دوره‌ای سطل‌های منقضی + سقف ظرفیت (جلوگیری از نشت حافظه با IP جعلی)
setInterval(() => {
  const now = Date.now();
  for (const [key, slot] of buckets) {
    if (now > slot.reset) buckets.delete(key);
  }
  if (buckets.size > MAX_BUCKETS) {
    const excess = buckets.size - MAX_BUCKETS;
    let i = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (++i >= excess) break;
    }
  }
}, 60_000).unref?.();

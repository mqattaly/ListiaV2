// ─── احراز هویت: هش رمز (scrypt)، نشست کوکی امضاشده، محدودسازی نرخ ──────────
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getUserById } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

// راز نشست: از محیط، یا ساخته‌شده و ذخیره‌شده در data (پایدار بین ری‌استارت‌ها)
function loadSecret() {
  const fromEnv = (process.env.SECRET_KEY || "").trim();
  if (fromEnv) return fromEnv;
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

export const SESSION_COOKIE = "listia_session";
// کوکی‌ی نوشته‌شده توسط خود کلاینت (fallback برای iframeها)
export const CLIENT_TOKEN_COOKIE = "listia_token";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

// کوکی در حالت پیش‌فرض SameSite=None + Secure است تا داخل iframeِ پیش‌نمایش
// هم کار کند؛ برای اجرای محلی روی http خاموشش کنید: COOKIE_INSECURE=1
const COOKIE_INSECURE = process.env.COOKIE_INSECURE === "1";

// ─── هش رمز عبور (scrypt — هم‌ارز Werkzeug) ─────────────────────────────────
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPasswordHash(stored, candidate) {
  try {
    const [params, saltB64, hashB64] = String(stored ?? "").split("$");
    if (!params || !saltB64 || !hashB64) return false;
    const [scheme, n, r, p] = params.split(":");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = crypto.scryptSync(String(candidate ?? ""), salt, expected.length, {
      N: parseInt(n, 10),
      r: parseInt(r, 10),
      p: parseInt(p, 10),
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ─── نشست‌های امضاشده ───────────────────────────────────────────────────────
function sign(payload) {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function createSessionToken(userId) {
  const payload = `${userId}.${Date.now() + SESSION_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token) {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  if (sign(`${uid}.${exp}`) !== sig) return null;
  if (Number(exp) < Date.now()) return null;
  const num = Number(uid);
  return Number.isInteger(num) && num > 0 ? num : null;
}

export function setSessionCookie(res, userId) {
  const token = createSessionToken(userId);
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
}

// ─── میدل‌ورها ───────────────────────────────────────────────────────────────
export function attachUser(req, _res, next) {
  let uid = null;
  // ۱) پارامتر آدرس ?_lt= — مطمئن‌ترین مسیر: هیچ پراکسی‌ای (مثل لایه‌ی
  //    edge پیش‌نمایش که ممکن است هدر Authorization را حذف کند) و هیچ
  //    تنظیمات مرورگری (بلاک کوکی third-party) پارامتر آدرس را حذف نمی‌کند.
  const qToken = req.query?._lt;
  if (typeof qToken === "string" && qToken) {
    uid = parseSessionToken(qToken);
  }
  // ۲) توکن Bearer — برای حالت عادی خارج از iframe
  if (!uid) {
    const auth = String(req.headers.authorization ?? "");
    if (auth.toLowerCase().startsWith("bearer ")) {
      uid = parseSessionToken(auth.slice(7).trim());
    }
  }
  // ۳) هدر اختصاصی — برخی پراکسی‌ها فقط Authorization استاندارد را می‌زنند
  if (!uid) {
    const custom = String(req.headers["x-listia-auth"] ?? "");
    if (custom) uid = parseSessionToken(custom);
  }
  // ۴) کوکی‌ی نشست (httpOnly، سمت سرور)
  if (!uid) {
    uid = parseSessionToken(req.cookies?.[SESSION_COOKIE]);
  }
  // ۵) کوکی‌ی پشتیبانِ نوشته‌شده توسط کلاینت (Partitioned/CHIPS)
  if (!uid) {
    uid = parseSessionToken(req.cookies?.[CLIENT_TOKEN_COOKIE]);
  }
  req.user = uid ? getUserById(uid) ?? null : null;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    // برای عیب‌یابی: مشخص می‌کند درخواستِ ردشده اصلاً توکن/کوکی داشته یا نه
    console.log(
      `🔒 401 ${req.method} ${req.originalUrl} (cookie:${
        req.cookies?.[SESSION_COOKIE] || req.cookies?.[CLIENT_TOKEN_COOKIE] ? "✓" : "✗"
      } bearer:${String(req.headers.authorization ?? "").startsWith("Bearer ") ? "✓" : "✗"})`
    );
    return res.status(401).json({ success: false, message: "ابتدا وارد شوید." });
  }
  next();
}

// ─── محدودسازی نرخ (در حافظه) ──────────────────────────────────────────────
const buckets = new Map();

export function requestIP(req) {
  const xff = req.headers["x-forwarded-for"] ?? "";
  if (xff) {
    const candidate = String(xff).split(",").pop().trim();
    if (candidate) return candidate;
  }
  return req.socket.remoteAddress || "?";
}

export function recordAttempt(bucket, key) {
  const now = Date.now();
  const slot = buckets.get(`${bucket}:${key}`) ?? { count: 0, reset: now + 5 * 60 * 1000 };
  if (now > slot.reset) {
    slot.count = 0;
    slot.reset = now + 5 * 60 * 1000;
  }
  slot.count += 1;
  buckets.set(`${bucket}:${key}`, slot);
}

export function isThrottled(bucket, key, limit = 6) {
  const slot = buckets.get(`${bucket}:${key}`);
  if (!slot) return false;
  if (Date.now() > slot.reset) {
    buckets.delete(`${bucket}:${key}`);
    return false;
  }
  return slot.count >= limit;
}

export function clearAttempts(bucket, key) {
  buckets.delete(`${bucket}:${key}`);
}

// ─── سامانه‌ی لایسنس لیستیا — پورت کامل از licensing.py ──────────────────────
// کلیدهای صادرشده با این ماژول با نسخه‌ی پایتون سازگارند (همان راز + همان HMAC).
import crypto from "node:crypto";
import os from "node:os";

export const LICENSE_SECRET =
  process.env.LICENSE_SECRET || "LISTIA-GHATTALI-LICENSE-SECURE-KEY-2026";

export const FREE_MAX_SUPPLIERS = 1;
export const FREE_MAX_PRODUCTS = 5;

export const DURATION_CHOICES = {
  LIFE: { label: "مادام‌العمر (دائمی)", days: null },
  "30D": { label: "۱ ماهه (۳۰ روز)", days: 30 },
  "90D": { label: "۳ ماهه (۹۰ روز)", days: 90 },
  "180D": { label: "۶ ماهه (۱۸۰ روز)", days: 180 },
  "365D": { label: "۱ ساله (۳۶۵ روز)", days: 365 },
};

export function normalizeIdent(ident) {
  if (ident && typeof ident === "object" && "username" in ident) ident = ident.username;
  return String(ident ?? "").trim().toLowerCase();
}

/** نرمال‌سازی مدت زمان: (code, days, label) */
export function normalizeDuration(duration) {
  if (duration === null || duration === undefined) {
    return ["LIFE", null, "مادام‌العمر (دائمی)"];
  }
  const dStr = String(duration).trim().toUpperCase();
  if (["LIFE", "LIFETIME", "PERMANENT", "0", "NONE"].includes(dStr)) {
    return ["LIFE", null, "مادام‌العمر (دائمی)"];
  }
  if (DURATION_CHOICES[dStr]) {
    const item = DURATION_CHOICES[dStr];
    return [dStr, item.days, item.label];
  }
  if (/^D\d+$/.test(dStr)) {
    const days = parseInt(dStr.slice(1), 10);
    return [`${days}D`, days, `${days} روزه`];
  }
  if (/^\d+D$/.test(dStr)) {
    const days = parseInt(dStr, 10);
    if (days <= 0) return ["LIFE", null, "مادام‌العمر (دائمی)"];
    return [`${days}D`, days, `${days} روزه`];
  }
  if (/^\d+$/.test(dStr)) {
    const days = parseInt(dStr, 10);
    if (days <= 0) return ["LIFE", null, "مادام‌العمر (دائمی)"];
    return [`${days}D`, days, `${days} روزه`];
  }
  return ["LIFE", null, "مادام‌العمر (دائمی)"];
}

/** شناسه‌ی فعال‌سازی کاربر (مثلاً LST-7842-9901) */
export function getUserCode(userOrUsername) {
  const ident = normalizeIdent(userOrUsername);
  const raw = `LISTIA-USER:${ident}:${LICENSE_SECRET.slice(0, 12)}`;
  const digest = crypto
    .createHash("sha256")
    .update(raw, "utf8")
    .digest("hex")
    .toUpperCase();
  return `LST-${digest.slice(0, 4)}-${digest.slice(4, 8)}`;
}

function hmacHex(message) {
  return crypto
    .createHmac("sha256", LICENSE_SECRET)
    .update(message, "utf8")
    .digest("hex")
    .toUpperCase();
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // مقایسه‌ی زمان‌ثابت روی طول‌های برابر؛ طول نابرابر = قطعاً نامساوی
    return crypto.timingSafeEqual(bufA, bufA) && false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/** کلید لایسنس: LST-<PERIOD>-XXXX-XXXX-XXXX */
export function generateKey(userOrIdent, tier = "PRO", duration = "LIFE") {
  const ident = normalizeIdent(userOrIdent);
  const userCode = getUserCode(ident);
  const cleanTier = String(tier || "PRO").trim().toUpperCase();
  const [periodCode] = normalizeDuration(duration);
  const sig = hmacHex(`LISTIA:${ident}:${userCode}:${cleanTier}:${periodCode}`);
  return `LST-${periodCode}-${sig.slice(0, 4)}-${sig.slice(4, 8)}-${sig.slice(8, 12)}`;
}

/** کلید سراسری (Universal Master Key) */
export function generateMasterKey(tier = "UNLIMITED", duration = "LIFE") {
  const cleanTier = String(tier || "UNLIMITED").trim().toUpperCase();
  const [periodCode] = normalizeDuration(duration);
  const sig = hmacHex(`LISTIA:MASTER_KEY_UNIVERSAL:${cleanTier}:${periodCode}`);
  return `LST-${periodCode}-${sig.slice(0, 4)}-${sig.slice(4, 8)}-${sig.slice(8, 12)}`;
}

/** بررسی صحت کلید: [is_valid, tier, days, message] */
export function verifyKey(userOrIdent, key) {
  if (!key || typeof key !== "string") {
    return [false, null, null, "لطفاً کلید لایسنس را وارد کنید."];
  }
  const cleanKey = key.trim().toUpperCase();
  const ident = normalizeIdent(userOrIdent);
  const userCode = getUserCode(ident);

  // ۱. کلیدهای دارای برچسب مدت: LST-<PERIOD>-XXXX-XXXX-XXXX
  const parts = cleanKey.split("-");
  if (parts.length >= 4 && parts[0] === "LST") {
    const [periodCode, days, label] = normalizeDuration(parts[1]);
    for (const candidate of [ident, userCode]) {
      for (const tier of ["PRO", "UNLIMITED", "ENTERPRISE"]) {
        const expected = generateKey(candidate, tier, periodCode);
        if (timingSafeEqual(cleanKey, expected)) {
          return [true, tier, days, `لایسنس ${label} با موفقیت فعال شد.`];
        }
      }
    }
    for (const tier of ["UNLIMITED", "PRO"]) {
      const expectedMaster = generateMasterKey(tier, periodCode);
      if (timingSafeEqual(cleanKey, expectedMaster)) {
        return [true, tier, days, `کلید لایسنس سراسری (${label}) با موفقیت تأیید شد.`];
      }
    }
  }

  // ۲. کلیدهای قدیمی بدون تگ مدت (مادام‌العمر)
  for (const candidate of [ident, userCode]) {
    for (const tier of ["PRO", "UNLIMITED", "ENTERPRISE"]) {
      const sig = hmacHex(`LISTIA:${candidate}:${getUserCode(candidate)}:${tier}`);
      const legacyExpected = `LST-${sig.slice(0, 4)}-${sig.slice(4, 8)}-${sig.slice(8, 12)}-${sig.slice(12, 16)}`;
      if (timingSafeEqual(cleanKey, legacyExpected)) {
        return [true, tier, null, "لایسنس مادام‌العمر با موفقیت فعال شد."];
      }
    }
  }
  for (const tier of ["UNLIMITED", "PRO"]) {
    const sig = hmacHex(`LISTIA:MASTER_KEY_UNIVERSAL:${tier}`);
    const legacyMaster = `LST-${sig.slice(0, 4)}-${sig.slice(4, 8)}-${sig.slice(8, 12)}-${sig.slice(12, 16)}`;
    if (timingSafeEqual(cleanKey, legacyMaster)) {
      return [true, tier, null, "کلید لایسنس سراسری مادام‌العمر با موفقیت تأیید شد."];
    }
  }

  return [false, null, null, "کلید لایسنس وارد شده نامعتبر است یا برای این حساب صادر نشده است."];
}

/** نام‌های کاربری رزروشده‌ی مدیر */
export function adminUsernames() {
  const raw = process.env.ADMIN_USERNAMES || "smq2458,admin";
  return new Set(
    raw
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
  );
}

export const HOSTNAME = os.hostname();

// ─── مسیرهای احراز هویت: ثبت‌نام، ورود، تأیید ایمیل ─────────────────────────
import { Router } from "express";
import crypto from "node:crypto";
import {
  getUserByUsername,
  getUserByEmail,
  getUserById,
  run,
} from "../lib/db.js";
import {
  hashPassword,
  verifyPasswordHash,
  setSessionCookie,
  clearSessionCookie,
  clearClientTokenCookie,
  createSessionToken,
  requestIP,
  recordAttempt,
  isThrottled,
  clearAttempts,
} from "../lib/auth.js";
import {
  normalizeEmail,
  normalizePhone,
  cleanPersonName,
  passwordStrengthError,
  randomCode,
  parseUtc,
} from "../lib/utils.js";
import { adminUsernames } from "../lib/licensing.js";
import { getUserLimits, isAdminUser } from "../lib/queries.js";
import { userPayload } from "../lib/serialize.js";
import { smtpConfigured, sendEmail } from "../lib/mailer.js";

const router = Router();

function jsonError(res, message, status = 400, extra = null) {
  return res.status(status).json({ success: false, message, ...(extra ?? {}) });
}

function hashCode(code) {
  // کد یک‌بارمصرف است؛ هشِ سبک‌تر از رمز کافی است
  return crypto
    .createHmac("sha256", `listia-code:${process.env.SECRET_KEY || "dev"}`)
    .update(String(code))
    .digest("hex");
}

// کد تأیید فقط در حالت توسعه (NODE_ENV≠production یا DEV_MODE_CODES=1) در
// پاسخ برگردانده می‌شود؛ در پروداکشن حتماً باید SMTP تنظیم شود.
function devCodesAllowed() {
  return process.env.DEV_MODE_CODES === "1" || process.env.NODE_ENV !== "production";
}

async function sendVerificationCode(user) {
  const code = randomCode();
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60 * 1000);
  run(
    `UPDATE users SET email_code_hash = ?, email_code_sent_at = ?, email_code_expires_at = ?
      WHERE id = ?`,
    hashCode(code),
    now.toISOString(),
    expires.toISOString(),
    user.id
  );
  if (smtpConfigured()) {
    await sendEmail(
      user.email,
      "کد تأیید ایمیل لیستیا",
      `سلام ${user.first_name || user.username} عزیز،\n\nکد تأیید ایمیل شما: ${code}\n\nاین کد ۱۰ دقیقه اعتبار دارد.`
    );
    return { dev_code: null };
  }
  if (!devCodesAllowed()) {
    throw new Error("SMTP تنظیم نشده است؛ در حالت پروداکشن کد تأیید فقط با ایمیل ارسال می‌شود.");
  }
  // حالت توسعه: SMTP تنظیم نیست — کد در کنسول و پاسخ نمایش می‌یابد
  console.log(`\n📩 [لیستیا] کد تأیید برای ${user.email}: ${code}\n`);
  return { dev_code: code };
}

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get("/me", (req, res) => {
  if (!req.user) return res.json({ success: true, user: null, limits: null });
  res.json({
    success: true,
    user: userPayload(req.user),
    limits: getUserLimits(req.user),
  });
});

// ─── POST /api/auth/signup ───────────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  const ip = requestIP(req);
  if (isThrottled("signup", ip, 10)) {
    return jsonError(res, "ثبت‌نام‌های پشت سر هم زیاد است. چند دقیقه بعد دوباره امتحان کنید.");
  }
  recordAttempt("signup", ip);

  const body = req.body ?? {};
  const username = String(body.username ?? "").trim().slice(0, 100);
  const password = String(body.password ?? "");
  const firstName = cleanPersonName(body.first_name ?? "");
  const lastName = cleanPersonName(body.last_name ?? "");
  const phone = normalizePhone(body.phone ?? "");
  const email = normalizeEmail(body.email ?? "");

  if (!firstName || !lastName) {
    return jsonError(res, "نام و نام خانوادگی را وارد کنید.");
  }
  if (!phone) {
    return jsonError(res, "شماره موبایل معتبر وارد کنید (مثل 09123456789).");
  }
  if (email === null) {
    return jsonError(res, "ایمیل معتبر وارد کنید تا کد تایید برایتان ارسال شود.");
  }
  if (!email) {
    return jsonError(res, "ایمیل معتبر وارد کنید تا کد تایید برایتان ارسال شود.");
  }
  if (!username || !password) {
    return jsonError(res, "نام کاربری و رمز عبور الزامی است.");
  }
  if (username.length < 2) {
    return jsonError(res, "نام کاربری خیلی کوتاه است.");
  }
  const pwError = passwordStrengthError(password);
  if (pwError) return jsonError(res, pwError);

  const usernameUser = getUserByUsername(username);
  const emailUser = getUserByEmail(email);

  if (usernameUser) {
    if (!Number(usernameUser.email_verified)) {
      const extra = await sendVerificationCode(usernameUser).catch(() => ({ dev_code: null }));
      return jsonError(
        res,
        "این نام کاربری قبلاً ثبت شده ولی ایمیلش هنوز تایید نشده است. کد تایید را وارد کنید یا ایمیل را تغییر دهید.",
        409,
        { need_verification: true, email: usernameUser.email, ...extra }
      );
    }
    return jsonError(res, "این نام کاربری قبلاً وجود دارد.");
  }
  if (emailUser) {
    if (!Number(emailUser.email_verified)) {
      const extra = await sendVerificationCode(emailUser).catch(() => ({ dev_code: null }));
      return jsonError(
        res,
        "این ایمیل قبلاً برای یک ثبت‌نام تاییدنشده استفاده شده است. کد تایید را وارد کنید یا ایمیل را تغییر دهید.",
        409,
        { need_verification: true, email: emailUser.email, ...extra }
      );
    }
    return jsonError(res, "این ایمیل قبلاً ثبت شده است.");
  }

  // نام‌های رزروشده‌ی مدیر فقط با کلید راه‌اندازی ساخته می‌شوند
  const isAdminAccount = adminUsernames().has(username.toLowerCase());
  if (isAdminAccount) {
    const setupToken = (process.env.ADMIN_SETUP_TOKEN ?? "").trim();
    const givenToken = String(body.admin_token ?? "").trim();
    const ok =
      setupToken &&
      givenToken &&
      crypto.timingSafeEqual(Buffer.from(givenToken), Buffer.from(setupToken));
    if (!ok) {
      return jsonError(res, "این نام کاربری رزرو شده است و قابل ثبت‌نام نیست.");
    }
  }

  const info = run(
    `INSERT INTO users (username, password_hash, first_name, last_name, phone, email,
                        email_verified, is_licensed, license_type, is_admin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    username,
    hashPassword(password),
    firstName,
    lastName,
    phone,
    email,
    isAdminAccount ? 1 : 0,
    isAdminAccount ? 1 : 0,
    isAdminAccount ? "UNLIMITED" : "free",
    isAdminAccount ? 1 : 0
  );

  if (isAdminAccount) {
    const user = getUserById(Number(info.lastInsertRowid));
    setSessionCookie(res, user.id);
    return res.json({
      success: true,
      user: userPayload(user),
      limits: getUserLimits(user),
      session_token: createSessionToken(user.id),
    });
  }

  const user = getUserById(Number(info.lastInsertRowid));
  let extra = {};
  try {
    extra = await sendVerificationCode(user);
  } catch (err) {
    console.error("ارسال ایمیل تایید ناموفق بود:", err);
    return jsonError(
      res,
      "حساب ساخته شد اما ارسال ایمیل تایید ناموفق بود. تنظیمات SMTP سرور را بررسی کنید و سپس ارسال مجدد را بزنید.",
      500,
      { need_verification: true, email: user.email }
    );
  }
  res.json({
    success: true,
    need_verification: true,
    email: user.email,
    message: "کد تایید ۶ رقمی به ایمیل شما ارسال شد.",
    ...extra,
  });
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post("/login", (req, res) => {
  const ip = requestIP(req);
  if (isThrottled("login", ip)) {
    return jsonError(res, "تلاش‌های ورود زیاد است. چند دقیقه بعد دوباره امتحان کنید.");
  }
  const body = req.body ?? {};
  const username = String(body.username ?? "").trim().slice(0, 100);
  const password = String(body.password ?? "");
  const user = getUserByUsername(username);

  if (user && verifyPasswordHash(user.password_hash, password)) {
    clearAttempts("login", ip);
    // نام‌های رزروشده مدیر در اولین ورود ارتقا می‌یابند (رفتار نسخه‌ی اصلی)
    if (adminUsernames().has(user.username.toLowerCase())) {
      run(
        `UPDATE users SET is_admin = 1, is_licensed = 1, license_type = 'UNLIMITED',
                          email_verified = 1 WHERE id = ?`,
        user.id
      );
      user.is_admin = 1;
      user.is_licensed = 1;
      user.license_type = "UNLIMITED";
      user.email_verified = 1;
    }
    if (user.email && !Number(user.email_verified)) {
      return res.json({
        success: false,
        need_verification: true,
        email: user.email,
        message: "ایمیل شما هنوز تأیید نشده است. کد تأیید ارسال‌شده را وارد کنید.",
      });
    }
    setSessionCookie(res, user.id);
    return res.json({
      success: true,
      user: userPayload(user),
      limits: getUserLimits(user),
      message: "خوش آمدید 👋",
      session_token: createSessionToken(user.id),
    });
  }

  recordAttempt("login", ip);
  return jsonError(res, "نام کاربری یا رمز عبور اشتباه است.");
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  clearClientTokenCookie(res);
  res.json({ success: true, message: "با موفقیت خارج شدید." });
});

// ─── POST /api/auth/verify-email ─────────────────────────────────────────────
router.post("/verify-email", async (req, res) => {
  const body = req.body ?? {};
  const code = String(body.code ?? "").trim();
  const email = normalizeEmail(body.email ?? "");

  let user = null;
  if (email) user = getUserByEmail(email);
  if (!user) return jsonError(res, "حساب مربوط به این ایمیل پیدا نشد.", 404);
  if (Number(user.email_verified)) {
    return jsonError(res, "این ایمیل قبلاً تأیید شده است. وارد شوید.");
  }
  if (!user.email_code_hash || !user.email_code_expires_at) {
    return jsonError(res, "کدی برای این حساب ارسال نشده است. ارسال مجدد را بزنید.");
  }
  if ((parseUtc(user.email_code_expires_at)?.getTime() ?? 0) < Date.now()) {
    return jsonError(res, "کد تأیید منقضی شده است. ارسال مجدد را بزنید.");
  }
  if (!code || hashCode(code) !== user.email_code_hash) {
    return jsonError(res, "کد تأیید درست نیست.");
  }

  run(
    `UPDATE users SET email_verified = 1, email_code_hash = NULL,
                      email_code_sent_at = NULL, email_code_expires_at = NULL
      WHERE id = ?`,
    user.id
  );
  const fresh = getUserById(user.id);
  setSessionCookie(res, fresh.id);
  res.json({
    success: true,
    message: "✓ ایمیل شما تأیید شد. خوش آمدید!",
    user: userPayload(fresh),
    limits: getUserLimits(fresh),
    session_token: createSessionToken(fresh.id),
  });
});

// ─── POST /api/auth/resend-verification ──────────────────────────────────────
router.post("/resend-verification", async (req, res) => {
  const email = normalizeEmail((req.body ?? {}).email ?? "");
  const user = email ? getUserByEmail(email) : null;
  if (!user) return jsonError(res, "حساب مربوط به این ایمیل پیدا نشد.", 404);
  if (Number(user.email_verified)) {
    return jsonError(res, "این ایمیل قبلاً تأیید شده است.");
  }
  if (user.email_code_sent_at) {
    const sentAt = parseUtc(user.email_code_sent_at)?.getTime() ?? 0;
    if (Date.now() - sentAt < 60_000) {
      return jsonError(res, "برای ارسال مجدد کمی صبر کنید (حداکثر یک بار در دقیقه).");
    }
  }
  const extra = await sendVerificationCode(user).catch((err) => {
    console.error("ارسال مجدد ناموفق:", err);
    return null;
  });
  if (!extra) {
    return jsonError(res, "ارسال ایمیل ناموفق بود. بعداً دوباره تلاش کنید.", 500);
  }
  res.json({ success: true, message: "کد تایید ۶ رقمی دوباره ارسال شد.", ...extra });
});

// ─── POST /api/auth/change-verification-email ────────────────────────────────
router.post("/change-verification-email", async (req, res) => {
  const body = req.body ?? {};
  const currentEmail = normalizeEmail(body.current_email ?? "");
  const newEmail = normalizeEmail(body.new_email ?? "");
  if (!newEmail) return jsonError(res, "ایمیل جدید معتبر نیست.");

  const user = currentEmail ? getUserByEmail(currentEmail) : null;
  if (!user) return jsonError(res, "حساب مربوط به این ایمیل پیدا نشد.", 404);
  if (Number(user.email_verified)) {
    return jsonError(res, "این حساب قبلاً تأیید شده است؛ وارد شوید.");
  }
  const other = getUserByEmail(newEmail);
  if (other && other.id !== user.id) {
    if (Number(other.email_verified)) {
      return jsonError(res, "این ایمیل قبلاً برای کاربر دیگری ثبت شده است.");
    }
  }

  run("UPDATE users SET email = ? WHERE id = ?", newEmail, user.id);
  const fresh = getUserById(user.id);
  const extra = await sendVerificationCode(fresh).catch(() => ({ dev_code: null }));
  res.json({
    success: true,
    message: "ایمیل تغییر کرد و کد تایید جدید ارسال شد.",
    email: newEmail,
    ...extra,
  });
});

export default router;

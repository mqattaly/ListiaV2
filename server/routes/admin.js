// ─── پنل مدیریت: کاربران، لایسنس‌ها، تولید کلید ──────────────────────────────
import { Router } from "express";
import { all, get, run, getUserByUsername } from "../lib/db.js";
import { hashPassword } from "../lib/auth.js";
import {
  cleanPersonName,
  normalizePhone,
  normalizeEmail,
  passwordStrengthError,
  shamsiLabel,
  compareSupplierNames,
  parseUtc,
} from "../lib/utils.js";
import {
  generateKey,
  generateMasterKey,
  normalizeDuration,
  getUserCode,
  adminUsernames,
} from "../lib/licensing.js";
import { isAdminUser } from "../lib/queries.js";
import { adminUserPayload } from "../lib/serialize.js";

const router = Router();

function jsonError(res, message, status = 400, extra = null) {
  return res.status(status).json({ success: false, message, ...(extra ?? {}) });
}

function requireAdmin(req, res, next) {
  if (!isAdminUser(req.user)) {
    return jsonError(res, "دسترسی به این بخش فقط برای مدیر نرم‌افزار مجاز است.", 403);
  }
  next();
}

router.use(requireAdmin);

function targetUser(req, res) {
  const user = get("SELECT * FROM users WHERE id = ?", Number(req.params.user_id));
  if (!user) {
    jsonError(res, "کاربر پیدا نشد.", 404);
    return null;
  }
  return user;
}

function refreshLicenseKey(user) {
  if (!Number(user.is_licensed)) return null;
  let periodCode = "LIFE";
  if (user.license_expires_at) {
    const expires = parseUtc(user.license_expires_at);
    const days = Math.max(1, Math.ceil((expires.getTime() - Date.now()) / 86400000));
    [periodCode] = normalizeDuration(String(days));
  }
  const key = generateKey(user.username, user.license_type || "PRO", periodCode);
  run("UPDATE users SET license_key = ? WHERE id = ?", key, user.id);
  return key;
}

// ─── GET /api/admin/users ────────────────────────────────────────────────────
router.get("/users", (req, res) => {
  const users = all("SELECT * FROM users ORDER BY id DESC");
  const supplierCounts = Object.fromEntries(
    all("SELECT owner_id, COUNT(*) AS n FROM suppliers GROUP BY owner_id").map((r) => [r.owner_id, r.n])
  );
  const productCounts = Object.fromEntries(
    all("SELECT owner_id, COUNT(*) AS n FROM products GROUP BY owner_id").map((r) => [r.owner_id, r.n])
  );
  res.json({
    success: true,
    users: users
      .map((u) =>
        adminUserPayload(u, supplierCounts[u.id] ?? 0, productCounts[u.id] ?? 0)
      )
      .sort((a, b) => compareSupplierNames(a.username, b.username) || b.id - a.id),
  });
});

// ─── POST /api/admin/users/:id/update ────────────────────────────────────────
router.post("/users/:user_id/update", (req, res) => {
  const user = targetUser(req, res);
  if (!user) return;
  const body = req.body ?? {};

  const username = String(body.username ?? "").trim().slice(0, 100);
  const newPassword = String(body.new_password ?? "");
  const adminFlag = body.is_admin;
  const changes = [];

  if (username && username !== user.username) {
    if (username.length < 2) return jsonError(res, "نام کاربری خیلی کوتاه است.");
    const exists = getUserByUsername(username);
    if (exists && exists.id !== user.id) {
      return jsonError(res, "این نام کاربری قبلاً وجود دارد.");
    }
    if (adminUsernames().has(username.toLowerCase())) {
      return jsonError(res, "این نام کاربری رزرو شده است و قابل انتساب نیست.");
    }
    const oldUsername = user.username;
    run("UPDATE users SET username = ? WHERE id = ?", username, user.id);
    user.username = username;
    refreshLicenseKey(user);
    changes.push(`نام کاربری از «${oldUsername}» به «${username}» تغییر کرد`);
  }

  if (["first_name", "last_name", "phone", "email"].some((k) => k in body)) {
    const firstName = cleanPersonName(body.first_name ?? "");
    const lastName = cleanPersonName(body.last_name ?? "");
    const phone = normalizePhone(body.phone ?? "");
    const email = normalizeEmail(body.email ?? "");
    if (!firstName || !lastName) {
      return jsonError(res, "نام و نام خانوادگی را کامل وارد کنید.");
    }
    if (!email) return jsonError(res, "ایمیل معتبر وارد کنید.");
    if (!phone) return jsonError(res, "شماره موبایل معتبر وارد کنید (مثل 09123456789).");
    const emailOwner = get(
      "SELECT * FROM users WHERE lower(email) = lower(?) AND id != ?",
      email,
      user.id
    );
    if (emailOwner) {
      return jsonError(res, "این ایمیل قبلاً برای کاربر دیگری ثبت شده است.");
    }
    const emailChanged = (user.email ?? "") !== email;
    run(
      `UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?,
                        email_verified = ?, email_code_hash = NULL,
                        email_code_sent_at = NULL, email_code_expires_at = NULL
        WHERE id = ?`,
      firstName,
      lastName,
      email,
      phone,
      emailChanged ? 1 : user.email_verified,
      user.id
    );
    changes.push("مشخصات کاربر به‌روز شد");
  }

  if (newPassword) {
    const pwError = passwordStrengthError(newPassword);
    if (pwError) return jsonError(res, pwError);
    run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(newPassword), user.id);
    changes.push("رمز عبور بازنشانی شد");
  }

  if (adminFlag !== undefined && adminFlag !== null && adminFlag !== "") {
    const wantsAdmin = ["1", 1, true, "true", "on"].includes(adminFlag);
    if (!wantsAdmin && user.id === req.user.id) {
      return jsonError(res, "دسترسی مدیریت حساب خودتان را نمی‌توانید بردارید.");
    }
    if (!wantsAdmin && adminUsernames().has(user.username.toLowerCase())) {
      return jsonError(res, "این حساب مدیر اصلی سامانه است و قابل تغییر نیست.");
    }
    if (Boolean(Number(user.is_admin)) !== wantsAdmin) {
      run("UPDATE users SET is_admin = ? WHERE id = ?", wantsAdmin ? 1 : 0, user.id);
      if (wantsAdmin) run("UPDATE users SET is_licensed = 1 WHERE id = ?", user.id);
      user.is_admin = wantsAdmin ? 1 : 0;
      changes.push("دسترسی مدیریت " + (wantsAdmin ? "داده شد" : "برداشته شد"));
    }
  }

  if (!changes.length) return jsonError(res, "تغییری برای ذخیره وجود ندارد.");

  const fresh = get("SELECT * FROM users WHERE id = ?", user.id);
  res.json({
    success: true,
    message: "✓ " + changes.join("، "),
    user: adminUserPayload(fresh),
  });
});

// ─── POST /api/admin/users/:id/license — اعطا/حذف لایسنس ─────────────────────
router.post("/users/:user_id/license", (req, res) => {
  const user = targetUser(req, res);
  if (!user) return;
  const body = req.body ?? {};
  const action = String(body.action ?? "grant").trim().toLowerCase();

  if (["revoke", "delete", "remove"].includes(action)) {
    if (adminUsernames().has(user.username.toLowerCase())) {
      return jsonError(res, "لایسنس حساب مدیر اصلی قابل حذف نیست.");
    }
    run(
      `UPDATE users SET is_licensed = 0, license_key = NULL, licensed_at = NULL,
                        license_expires_at = NULL, license_type = 'free' WHERE id = ?`,
      user.id
    );
    if (user.id !== req.user.id) {
      const keepAdmin = Number(user.is_admin) === 1 && adminUsernames().has(user.username.toLowerCase());
      if (!keepAdmin) run("UPDATE users SET is_admin = 0 WHERE id = ?", user.id);
    }
    const fresh = get("SELECT * FROM users WHERE id = ?", user.id);
    return res.json({
      success: true,
      message: `لایسنس «${user.username}» حذف شد و حساب به نسخه آزمایشی برگشت.`,
      user: adminUserPayload(fresh),
    });
  }

  const tier = String(body.tier ?? "PRO").trim().toUpperCase() || "PRO";
  let duration = String(body.duration ?? "LIFE").trim();
  const expiresAtRaw = String(body.expires_at ?? "").trim();

  if (duration.toUpperCase() === "CUSTOM") {
    duration = String(body.custom_days ?? "").trim() || "LIFE";
  }

  let expiresAt = null;
  let [periodCode, days, durationLabel] = normalizeDuration(duration);

  if (expiresAtRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAtRaw)) {
      return jsonError(res, "تاریخ انقضا معتبر نیست.");
    }
    const target = new Date(`${expiresAtRaw}T23:59:00Z`);
    const dayDiff = Math.ceil((target.getTime() - Date.now()) / 86400000);
    if (dayDiff <= 0) return jsonError(res, "تاریخ انقضا باید بعد از امروز باشد.");
    [periodCode, days, durationLabel] = normalizeDuration(String(dayDiff));
    expiresAt = target.toISOString();
  } else if (days) {
    expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  }

  const nowISO = new Date().toISOString().replace("T", " ").slice(0, 19);
  const licensedAt = user.licensed_at || nowISO;
  const key = generateKey(user.username, tier, periodCode);
  run(
    `UPDATE users SET is_licensed = 1, license_type = ?, licensed_at = ?,
                      license_expires_at = ?, license_key = ? WHERE id = ?`,
    tier,
    licensedAt,
    expiresAt,
    key,
    user.id
  );

  const validity = expiresAt === null ? "مادام‌العمر (دائمی)" : `تا ${shamsiLabel(expiresAt.slice(0, 10))}`;
  const fresh = get("SELECT * FROM users WHERE id = ?", user.id);
  res.json({
    success: true,
    message: `لایسنس «${user.username}» به‌روزرسانی شد — ${durationLabel} (${validity}).`,
    license_key: key,
    user: adminUserPayload(fresh),
  });
});

// ─── POST /api/admin/users/:id/delete ────────────────────────────────────────
router.post("/users/:user_id/delete", (req, res) => {
  const user = targetUser(req, res);
  if (!user) return;
  if (user.id === req.user.id) return jsonError(res, "حساب خودتان را نمی‌توانید حذف کنید.");
  if (adminUsernames().has(user.username.toLowerCase())) {
    return jsonError(res, "حساب مدیر اصلی سامانه قابل حذف نیست.");
  }
  run("DELETE FROM shared_access WHERE owner_id = ? OR shared_with_id = ?", user.id, user.id);
  run("DELETE FROM products WHERE owner_id = ?", user.id);
  run("DELETE FROM suppliers WHERE owner_id = ?", user.id);
  run("DELETE FROM users WHERE id = ?", user.id);
  res.json({ success: true, message: `کاربر «${user.username}» و همه داده‌هایش حذف شد.` });
});

// ─── POST /api/admin/generate-license — تولید کلید لایسنس ────────────────────
router.post("/generate-license", (req, res) => {
  const body = req.body ?? {};
  const ident = String(body.identifier ?? "").trim();
  const tier = String(body.tier ?? "PRO").trim().toUpperCase();
  const duration = String(body.duration ?? "LIFE").trim();
  const isMaster = ["true", "1", "on"].includes(String(body.is_master ?? ""));

  const [periodCode, days, durationLabel] = normalizeDuration(duration);
  const validityDesc = days === null ? "مادام‌العمر (دائمی)" : `${days} روز پس از فعال‌سازی`;

  let key;
  let identDisplay;
  let codeDisplay;
  if (isMaster) {
    key = generateMasterKey(tier, periodCode);
    identDisplay = "کلید سراسری (Universal Master Key)";
    codeDisplay = "همه دستگاه‌ها و حساب‌ها";
  } else {
    if (!ident) {
      return jsonError(res, "نام کاربری یا شناسه فعال‌سازی مشتری را وارد کنید.");
    }
    key = generateKey(ident, tier, periodCode);
    identDisplay = ident;
    codeDisplay = getUserCode(ident);
  }

  const customerMsg =
    `با سلام، لایسنس نسخه نامحدود «لیستیا» (${durationLabel}) برای شما صادر شد:\n\n` +
    `🔑 کلید لایسنس شما:\n${key}\n\n` +
    `⏳ مدت اعتبار: ${validityDesc}\n` +
    `روش فعال‌سازی: وارد نرم‌افزار شوید، به صفحه «حساب کاربری» بروید و کلید بالا را در بخش لایسنس وارد نمایید.\n` +
    `با آرزوی موفقیت · لیستیا`;

  res.json({
    success: true,
    license_key: key,
    identifier: identDisplay,
    user_code: codeDisplay,
    tier,
    duration: periodCode,
    duration_label: durationLabel,
    validity_desc: validityDesc,
    customer_message: customerMsg,
  });
});

export default router;

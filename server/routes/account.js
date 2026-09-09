// ─── مسیرهای حساب کاربری: پروفایل، رمز، لایسنس، کلید API، اشتراک‌گذاری ───────
import { Router } from "express";
import {
  get,
  all,
  run,
  getUserByUsername,
  getUserById,
} from "../lib/db.js";
import {
  hashPassword,
  verifyPasswordHash,
} from "../lib/auth.js";
import {
  cleanPersonName,
  shamsiLabel,
  normalizePhone,
  normalizeEmail,
  shamsiDatetimeLabel,
  randomToken,
  passwordStrengthError,
} from "../lib/utils.js";
import { verifyKey } from "../lib/licensing.js";
import { getUserLimits } from "../lib/queries.js";
import { userPayload } from "../lib/serialize.js";

const router = Router();

function jsonError(res, message, status = 400, extra = null) {
  return res.status(status).json({ success: false, message, ...(extra ?? {}) });
}

// ─── GET /api/account ────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  const userId = req.user.id;
  const user = getUserById(userId);
  const counts = get(
    `SELECT
       (SELECT COUNT(*) FROM suppliers WHERE owner_id = ?) AS supplier_count,
       (SELECT COUNT(*) FROM products WHERE owner_id = ? AND (ordered = 0 OR ordered IS NULL)) AS active_count,
       (SELECT COUNT(*) FROM products WHERE owner_id = ? AND ordered = 1) AS archived_count`,
    userId,
    userId,
    userId
  );

  let token = user.api_token;
  if (!token) {
    token = randomToken(24);
    run("UPDATE users SET api_token = ? WHERE id = ?", token, userId);
  }

  const sharedList = all(
    `SELECT sa.id AS share_id, u.id AS user_id, u.username, u.first_name, u.last_name, sa.created_at
       FROM shared_access sa JOIN users u ON u.id = sa.shared_with_id
      WHERE sa.owner_id = ? ORDER BY sa.id DESC`,
    userId
  ).map((row) => ({
    share_id: row.share_id,
    user_id: row.user_id,
    username: row.username,
    full_name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || row.username,
    created_at_label: shamsiDatetimeLabel(row.created_at),
  }));

  const sharedWithMe = all(
    `SELECT u.id AS user_id, u.username, u.first_name, u.last_name
       FROM shared_access sa JOIN users u ON u.id = sa.owner_id
      WHERE sa.shared_with_id = ? ORDER BY u.username`,
    userId
  ).map((row) => ({
    user_id: row.user_id,
    username: row.username,
    full_name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || row.username,
  }));

  res.json({
    success: true,
    user: userPayload(user),
    limits: getUserLimits(user),
    counts: {
      supplier_count: Number(counts.supplier_count),
      active_count: Number(counts.active_count),
      archived_count: Number(counts.archived_count),
    },
    api_token: token,
    shared_list: sharedList,
    shared_with_me: sharedWithMe,
  });
});

// ─── POST /api/account/profile ───────────────────────────────────────────────
router.post("/profile", (req, res) => {
  const body = req.body ?? {};
  const firstName = cleanPersonName(body.first_name ?? "");
  const lastName = cleanPersonName(body.last_name ?? "");
  const phone = normalizePhone(body.phone ?? "");
  if (!firstName || !lastName) {
    return jsonError(res, "نام و نام خانوادگی را کامل وارد کنید.");
  }
  if (!phone) return jsonError(res, "شماره موبایل معتبر وارد کنید (مثل 09123456789).");
  run("UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?", [
    firstName,
    lastName,
    phone,
    req.user.id,
  ]);
  res.json({
    success: true,
    message: "✓ مشخصات ذخیره شد.",
    full_name: `${firstName} ${lastName}`.trim(),
    phone,
  });
});

// ─── POST /api/account/password ──────────────────────────────────────────────
router.post("/password", (req, res) => {
  const body = req.body ?? {};
  const currentPassword = String(body.current_password ?? "");
  const newPassword = String(body.new_password ?? "");
  const confirmPassword = String(body.confirm_password ?? "");
  const user = getUserById(req.user.id);

  if (!verifyPasswordHash(user.password_hash, currentPassword)) {
    return jsonError(res, "رمز عبور فعلی درست نیست.");
  }
  if (newPassword.length < 6) {
    return jsonError(res, "رمز عبور جدید حداقل ۶ کاراکتر باشد.");
  }
  if (newPassword !== confirmPassword) {
    return jsonError(res, "تکرار رمز عبور جدید یکسان نیست.");
  }
  if (newPassword === currentPassword) {
    return jsonError(res, "رمز جدید با رمز فعلی فرقی ندارد.");
  }
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(newPassword), user.id);
  res.json({ success: true, message: "رمز عبور عوض شد." });
});

// ─── POST /api/account/token — کلید شخصی برای ثبت از بیرون اپ ────────────────
router.post("/token", (req, res) => {
  const token = randomToken(24);
  run("UPDATE users SET api_token = ? WHERE id = ?", token, req.user.id);
  res.json({ success: true, message: "کلید جدید ساخته شد.", token });
});

// ─── POST /api/account/license — فعال‌سازی لایسنس ────────────────────────────
router.post("/license", (req, res) => {
  const key = String((req.body ?? {}).license_key ?? "").trim();
  if (!key) return jsonError(res, "لطفاً کلید لایسنس را وارد کنید.");

  const [isValid, tier, days, message] = verifyKey(req.user.username, key);
  if (!isValid) return jsonError(res, message, 400);

  const now = new Date();
  let expiresAt = null;
  let validityText;
  if (days) {
    expiresAt = new Date(now.getTime() + days * 86400000);
    validityText = `اعتبار به مدت ${days} روز (تا ${shamsiLabel(expiresAt.toISOString().slice(0, 10))})`;
  } else {
    validityText = "اعتبار مادام‌العمر (دائمی)";
  }

  run(
    `UPDATE users SET is_licensed = 1, license_key = ?, licensed_at = ?,
                      license_type = ?, license_expires_at = ? WHERE id = ?`,
    key.trim().toUpperCase(),
    now.toISOString().replace("T", " ").slice(0, 19),
    tier || "pro",
    expiresAt ? expiresAt.toISOString() : null,
    req.user.id
  );

  res.json({
    success: true,
    message: `✓ لایسنس با موفقیت فعال شد! ${validityText}`,
    license_type: tier || "pro",
    is_licensed: true,
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    validity_text: validityText,
  });
});

// ─── GET /api/license-status ─────────────────────────────────────────────────
router.get("/license-status", (req, res) => {
  res.json({ success: true, limits: getUserLimits(req.user) });
});

// ─── GET /api/users/search — جستجوی دقیق نام کاربری برای اشتراک ─────────────
router.get("/users/search", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ results: [] });
  const users = all(
    "SELECT * FROM users WHERE id != ? AND lower(username) = lower(?) LIMIT 1",
    req.user.id,
    q
  );
  res.json({
    results: users.map((u) => ({
      id: u.id,
      username: u.username,
      full_name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.username,
    })),
  });
});

// ─── POST /api/account/share — افزودن همکار به اشتراک ────────────────────────
router.post("/share", (req, res) => {
  const targetUsername = String((req.body ?? {}).username ?? (req.body ?? {}).user ?? "")
    .trim()
    .slice(0, 100);
  if (!targetUsername) return jsonError(res, "نام کاربری را وارد کنید.");
  if (targetUsername.toLowerCase() === req.user.username.toLowerCase()) {
    return jsonError(res, "نمی‌توانید حساب خودتان را اضافه کنید.");
  }
  const target = getUserByUsername(targetUsername);
  if (!target) {
    return jsonError(
      res,
      `کاربر با نام کاربری «${targetUsername}» پیدا نشد. از او بخواهید ابتدا در لیستیا ثبت‌نام کند.`
    );
  }
  const existing = get(
    "SELECT id FROM shared_access WHERE owner_id = ? AND shared_with_id = ?",
    req.user.id,
    target.id
  );
  if (existing) {
    return jsonError(res, "این کاربر قبلاً به لیست اشتراک شما اضافه شده است.");
  }
  const count = get("SELECT COUNT(*) AS n FROM shared_access WHERE owner_id = ?", req.user.id);
  if (Number(count.n) >= 20) {
    return jsonError(res, "حداکثر ۲۰ کاربر می‌توانید به اشتراک اضافه کنید.");
  }
  const info = run(
    "INSERT INTO shared_access (owner_id, shared_with_id) VALUES (?, ?)",
    req.user.id,
    target.id
  );
  res.json({
    success: true,
    message: `دسترسی داده‌های شما به «${target.username}» داده شد. حالا او می‌تواند بعد از ورود، اطلاعات شما را ببیند و مدیریت کند.`,
    shared_user: {
      share_id: Number(info.lastInsertRowid),
      user_id: target.id,
      username: target.username,
      full_name: `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() || target.username,
    },
  });
});

// ─── POST /api/account/share/:id/delete ──────────────────────────────────────
router.post("/share/:id/delete", (req, res) => {
  const shareId = Number(req.params.id);
  let share = get(
    "SELECT * FROM shared_access WHERE id = ? AND owner_id = ?",
    shareId,
    req.user.id
  );
  if (!share) {
    share = get(
      "SELECT * FROM shared_access WHERE owner_id = ? AND shared_with_id = ?",
      req.user.id,
      shareId
    );
  }
  if (!share) return jsonError(res, "اشتراک پیدا نشد.", 404);
  run("DELETE FROM shared_access WHERE id = ?", share.id);
  res.json({ success: true, message: "دسترسی حذف شد." });
});

// ─── POST /api/account/share/leave/:ownerId ─────────────────────────────────
router.post("/share/leave/:ownerId", (req, res) => {
  const share = get(
    "SELECT * FROM shared_access WHERE owner_id = ? AND shared_with_id = ?",
    Number(req.params.ownerId),
    req.user.id
  );
  if (!share) return jsonError(res, "اشتراک پیدا نشد.", 404);
  run("DELETE FROM shared_access WHERE id = ?", share.id);
  res.json({ success: true, message: "از لیست اشتراک خارج شدید." });
});

export default router;

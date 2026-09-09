// ─── سریالایز کاربر برای پاسخ‌های API ───────────────────────────────────────
import { getUserLimits, isAdminUser } from "./queries.js";
import { adminUsernames } from "./licensing.js";
import { shamsiDatetimeLabel } from "./utils.js";

export function userPayload(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    full_name: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.username,
    phone: user.phone ?? "",
    email: user.email ?? "",
    email_verified: Number(user.email_verified) === 1,
    is_admin: isAdminUser(user),
    is_licensed: Number(user.is_licensed) === 1 || isAdminUser(user),
    license_type: user.license_type ?? "free",
    estimate_budget: user.estimate_budget ?? "",
    created_at_label: shamsiDatetimeLabel(user.created_at),
  };
}

/** اطلاعات کاربر برای جدول پنل مدیریت (با شمارش یک‌جای سهمیه‌ها). */
export function adminUserPayload(user, sCount = null, pCount = null) {
  const limits = getUserLimits(user, sCount, pCount);
  const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  const protectedNames = adminUsernames();
  return {
    id: user.id,
    username: user.username,
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    full_name: fullName || user.username,
    phone: user.phone ?? "",
    email: user.email ?? "",
    email_verified: Number(user.email_verified) === 1,
    user_code: limits.user_code,
    is_licensed: limits.is_licensed,
    is_expired: limits.is_expired,
    is_lifetime: limits.is_lifetime,
    remaining_days: limits.remaining_days,
    expires_at_label: limits.expires_at_label,
    expires_at_iso: user.license_expires_at ? String(user.license_expires_at).slice(0, 10) : "",
    supplier_count: limits.supplier_count,
    product_count: limits.product_count,
    license_type: user.license_type || "free",
    license_key: user.license_key ?? "",
    is_admin: isAdminUser(user),
    is_protected: protectedNames.has(String(user.username ?? "").toLowerCase()),
    created_at_label: shamsiDatetimeLabel(user.created_at),
  };
}

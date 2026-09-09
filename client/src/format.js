export const APP_VERSION = "2.1.0";

// قالب‌بندی اعداد و تاریخ در سمت کلاینت

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export function toFa(input) {
  return String(input ?? "").replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** مبلغ با جداکننده‌ی هزارگان — مثل نسخه‌ی اصلی با ارقام لاتین */
export function fmtAmount(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (Math.abs(num - Math.round(num)) < 1e-9) {
    return Math.round(num).toLocaleString("en-US");
  }
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** خلاصه‌سازی مبلغ برای نمایش فشرده */
export function fmtShort(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  if (Math.abs(num) >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + " میلیارد";
  if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + " میلیون";
  if (Math.abs(num) >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + " هزار";
  return String(num);
}

export function initials(user) {
  if (!user) return "؟";
  const first = (user.first_name || user.username || "؟").trim();
  return first.slice(0, 1);
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "شب بخیر";
  if (hour < 12) return "صبح بخیر";
  if (hour < 17) return "وقت بخیر";
  if (hour < 20) return "عصر بخیر";
  return "شب بخیر";
}

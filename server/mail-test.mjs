// ─── تست زنده‌ی تنظیمات SMTP ───────────────────────────────────────────────
// اجرا:
//   node server/mail-test.mjs                 # تست اتصال+احراز و ارسال به خود حساب SMTP
//   node server/mail-test.mjs kasi@example.com # ارسال ایمیل آزمایشی به آدرس دیگر
//
// تنظیمات از متغیرهای محیطی یا فایل .env ریشه‌ی پروژه خوانده می‌شود:
//   SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM, SMTP_USE_SSL
import "./lib/load-env.js";
import { smtpConfigured, verifySmtp, sendEmail } from "./lib/mailer.js";

const to = process.argv[2] || process.env.SMTP_USERNAME;

if (!smtpConfigured()) {
  console.error("✗ SMTP_HOST / SMTP_USERNAME / SMTP_PASSWORD تنظیم نشده‌اند.");
  console.error("  آن‌ها را در فایل .env یا متغیرهای محیطی پنل هاست ست کنید.");
  process.exit(1);
}
if (!to) {
  console.error("✓ گیرنده‌ای مشخص نشده و SMTP_USERNAME هم خالی است.");
  process.exit(1);
}

console.log(
  `پیکربندی: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 465} ` +
    `کاربر=${process.env.SMTP_USERNAME} SSL=${process.env.SMTP_USE_SSL || "auto"}`
);

console.log("۱) تست اتصال و احراز هویت …");
try {
  await verifySmtp();
  console.log("   ✓ سرور ایمیل در دسترس است و رمز پذیرفته شد.");
} catch (err) {
  console.error("   ✗ اتصال/احراز ناموفق بود:", err.message);
  console.error(
    "   علت‌های رایج: پورت اشتباه (۴۶۵=SSL، ۵۸۷=STARTTLS)، رمز نادرست،\n" +
      "   یا بسته‌بودن دسترسی خروجی SMTP در فایروال/پنل هاست."
  );
  process.exit(2);
}

console.log(`۲) ارسال ایمیل آزمایشی به ${to} …`);
try {
  await sendEmail(
    to,
    "تست ایمیل لیستیا",
    "سلام،\n\nاین یک ایمیل آزمایشی از سامانه لیستیا است. اگر این پیام را می‌بینید یعنی SMTP درست کار می‌کند.\n\n— لیستیا"
  );
  console.log("   ✓ ایمیل ارسال شد. صندوق ورودی (و هرزنامه/Spam) را بررسی کنید.");
} catch (err) {
  console.error("   ✗ ارسال ناموفق بود:", err.message);
  process.exit(3);
}

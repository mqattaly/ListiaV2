// ─── ارسال ایمیل تأیید (SMTP اختیاری) ───────────────────────────────────────
// اگر SMTP در محیط تنظیم نشده باشد، حالت توسعه فعال می‌شود: کد در پاسخ API
// (فیلد dev_code) و کنسول سرور برگردانده می‌شود تا جریان ثبت‌نام کامل باشد.

export function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USERNAME?.trim() &&
      process.env.SMTP_PASSWORD
  );
}

export async function sendEmail(toEmail, subject, body) {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const username = (process.env.SMTP_USERNAME ?? "").trim();
  const password = process.env.SMTP_PASSWORD ?? "";
  if (!host || !username || !password) {
    throw new Error("SMTP تنظیم نشده است.");
  }
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const useSsl =
    ["1", "true", "yes", "on"].includes(
      (process.env.SMTP_USE_SSL ?? "").trim().toLowerCase()
    ) || port === 465;
  const fromEmail = (process.env.SMTP_FROM ?? username).trim() || username;

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: useSsl,
    auth: { user: username, pass: password },
  });
  await transporter.sendMail({
    from: fromEmail,
    to: toEmail,
    subject,
    text: body,
    html: `<div dir="rtl" style="font-family:Tahoma,sans-serif;line-height:1.9;white-space:pre-wrap">${body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</div>`,
  });
}

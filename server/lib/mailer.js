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

function truthy(v) {
  return ["1", "true", "yes", "on"].includes((v ?? "").trim().toLowerCase());
}

function settings() {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const username = (process.env.SMTP_USERNAME ?? "").trim();
  const password = process.env.SMTP_PASSWORD ?? "";
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  // پورت ۴۶۵ = SSL از ابتدای اتصال؛ پورت ۵۸۷/۲۵ = STARTTLS (ارتقا پس از سلام)
  const useSsl = truthy(process.env.SMTP_USE_SSL) || port === 465;
  const fromEmail = (process.env.SMTP_FROM ?? "").trim() || username;
  // فقط برای سرورهای داخلی با گواهی self-signed؛ در حالت عادی نباید ۱ باشد
  const allowSelfSigned = truthy(process.env.SMTP_TLS_INSECURE);
  return { host, username, password, port, useSsl, fromEmail, allowSelfSigned };
}

// اتصال یک‌بار ساخته و بازاستفاده می‌شود (به‌جای ساخت برای هر ایمیل)
let cached = null;
async function getTransport() {
  if (cached) return cached;
  const { host, username, password, port, useSsl, allowSelfSigned } = settings();
  if (!host || !username || !password) {
    throw new Error("SMTP تنظیم نشده است.");
  }
  const nodemailer = await import("nodemailer");
  cached = nodemailer.createTransport({
    host,
    port,
    secure: useSsl,
    requireTLS: !useSsl, // روی ۵۸۷ اگر STARTTLS ممکن نباشد، رمز روی متن خام نرود
    ...(allowSelfSigned ? { tls: { rejectUnauthorized: false } } : {}),
    auth: { user: username, pass: password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    pool: true,
    maxConnections: 3,
    // بدون این، هنگام فیلتر بودن SMTP نودمیلر تا ۵ بار تلاش می‌کرد و پاسخ
    // ثبت‌نام تا بیش از ۶۰ ثانیه بدون هیچ واکنشی می‌ماند
    retries: 1,
  });
  return cached;
}

export async function sendEmail(toEmail, subject, body) {
  const { fromEmail } = settings();
  if (!smtpConfigured()) throw new Error("SMTP تنظیم نشده است.");
  const transporter = await getTransport();
  // سقف سخت‌گیرانه‌ی کل زمان ارسال: بعضی فایروال‌ها/پروکسی‌ها سوکت را بدون
  // هیچ پاسخ SMTP می‌بندند و در آن حالت پرامیس sendMail ممکن است معلق بماند؛
  // نباید اجازه دهیم درخواست ثبت‌نام کاربر بی‌پاسخ هنگ کند.
  const timeoutMs = Number(process.env.SMTP_TIMEOUT_MS || "20000");
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `زمان ارسال ایمیل تمام شد (${Math.round(timeoutMs / 1000)} ثانیه)؛ ` +
              "در دسترس‌بودن سرور SMTP و پورت خروجی را بررسی کنید."
          )
        ),
      timeoutMs
    );
    timer.unref?.();
  });
  try {
    await Promise.race([
      transporter.sendMail({
        from: { name: "لیستیا", address: fromEmail },
        to: toEmail,
        subject,
        text: body,
        html: `<div dir="rtl" style="font-family:Tahoma,sans-serif;line-height:1.9;white-space:pre-wrap">${body
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</div>`,
      }),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// تست زنده‌ی تنظیمات (احراز هویت + دسترس‌پذیری سرور) — برای ابزار تشخیصی
export async function verifySmtp() {
  const transporter = await getTransport();
  const timeoutMs = Number(process.env.SMTP_TIMEOUT_MS || "20000");
  let timer;
  try {
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`زمان اتصال به سرور ایمیل تمام شد (${Math.round(timeoutMs / 1000)} ثانیه)`)),
          timeoutMs
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

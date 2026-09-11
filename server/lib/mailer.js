// ─── ارسال ایمیل (SMTP اختیاری) ─────────────────────────────────────────────
// اگر SMTP در محیط تنظیم نشده باشد، حالت توسعه فعال می‌شود: کد در پاسخ API
// (فیلد dev_code) و کنسول سرور برگردانده می‌شود تا جریان ثبت‌نام کامل باشد.
//
// برای نرفتن به پوشه‌ی هرزنامه، رعایت این موارد روی دامنه ضروری است (سمت سرور ایمیل):
//   ۱) رکورد SPF برای دامنه‌ی فرستنده که IP/سرور ایمیل چابوکان را مجاز کند
//   ۲) امضای DKIM فعال و رکورد عمومی آن در DNS
//   ۳) رکورد DMARC (حداقل p=none با آدرس گزارش)
//   ۴) نشانی From حتماً همان حساب احرازشونده (info@دامنه) باشد

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

export function smtpMode() {
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const useSsl = truthy(process.env.SMTP_USE_SSL) || port === 465;
  return useSsl ? "SSL" : "STARTTLS";
}

function settings() {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const username = (process.env.SMTP_USERNAME ?? "").trim();
  const password = process.env.SMTP_PASSWORD ?? "";
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  // پورت ۴۶۵ = SSL از ابتدای اتصال؛ پورت ۵۸۷/۲۵ = STARTTLS (ارتقا پس از سلام)
  const useSsl = truthy(process.env.SMTP_USE_SSL) || port === 465;
  const fromEmail = (process.env.SMTP_FROM ?? "").trim() || username;
  const replyTo = (process.env.SMTP_REPLY_TO ?? "").trim() || fromEmail;
  const fromName = (process.env.SMTP_FROM_NAME ?? "").trim() || "لیستیا";
  // فقط برای سرورهای داخلی با گواهی self-signed؛ در حالت عادی نباید ۱ باشد
  const allowSelfSigned = truthy(process.env.SMTP_TLS_INSECURE);
  return { host, username, password, port, useSsl, fromEmail, replyTo, fromName, allowSelfSigned };
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
    greetingTimeout: 8000,
    socketTimeout: 15000,
    pool: true,
    maxConnections: 2,
    // اتصال‌های بیکار بعد از ۱۵ ثانیه بسته می‌شوند تا اتصال مرده مدت‌ها در pool
    // باقی نماند و ارسال بعدی روی سوکت بسته معطل نشود.
    poolTimeout: 15000,
    // بدون این، هنگام فیلتر بودن SMTP نودمیلر تا ۵ بار تلاش می‌کرد و پاسخ
    // ثبت‌نام تا بیش از ۶۰ ثانیه بدون هیچ واکنشی می‌ماند
    retries: 1,
  });
  return cached;
}

function escapeText(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");
}

/**
 * ارسال ایمیل.
 *   sendEmail(to, subject, "متن ساده")
 *   sendEmail(to, subject, { text, html, headers, listUnsubscribe })
 */
export async function sendEmail(toEmail, subject, content, options = {}) {
  const { fromName, fromEmail, replyTo } = settings();
  if (!smtpConfigured()) throw new Error("SMTP تنظیم نشده است.");

  let text;
  let html;
  if (typeof content === "string") {
    text = content;
    html = `<div dir="rtl" style="font-family:Tahoma,sans-serif;font-size:14px;line-height:1.9;white-space:pre-wrap">${escapeText(
      content
    )}</div>`;
  } else {
    text = content?.text ?? "";
    html = content?.html ?? "";
  }

  const message = {
    from: { name: fromName, address: fromEmail },
    replyTo,
    to: toEmail,
    subject,
    text,
    html,
    // هدرهای اعتمادپذیری/استاندارد
    headers: {
      "X-Auto-Response-Suppress": "OOF, AutoReply",
      ...(options.headers ?? {}),
    },
  };
  // ایمیل‌های غیرتراکنشی (مثل خوش‌آمد) لینک لغو دریافت می‌گیرند؛ جیمیل این را
  // یکی از معیارهای «ایمیل معتبر» می‌داند.
  if (options.listUnsubscribe) {
    // جیمیل وجود این هدر را یکی از معیارهای اعتبار فرستنده‌ی ایمیل انبوه می‌داند
    message.headers["List-Unsubscribe"] = `<mailto:${replyTo}?subject=unsubscribe>`;
  }

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
    const transporter = await getTransport();
    await Promise.race([transporter.sendMail(message), deadline]);
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

// ─── صف ارسال پس‌زمینه‌ای ───────────────────────────────────────────────────
// هیچ پاسخ API نباید منتظر SMTP بماند: کندی، تایم‌اوت یا بسته‌شدن اتصال توسط
// سرور ایمیل نباید دکمه‌های احراز هویت را بی‌واکنش کند. ایمیل‌ها پشت سر هم
// (یک اتصال هم‌زمان، تا اتصال‌های موازی باعث بلاک‌شدن IP از سمت سرور ایمیل
// نشوند) و با چند بار تلاش مجدد ارسال می‌شوند.
const RETRY_DELAYS_MS = [0, 5_000, 25_000];

let chain = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ایمیل را در پس‌زمینه و پشت صف قرار می‌دهد و بلافاصله برمی‌گردد.
 * خطا فقط لاگ می‌شود (و تلاش مجدد می‌گیرد)؛ پاسخ درخواست معطل نمی‌ماند.
 */
export function queueEmail(toEmail, subject, content, options = {}) {
  const job = chain.then(async () => {
    let lastErr;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt]);
      try {
        await sendEmail(toEmail, subject, content, options);
        if (attempt > 0) {
          console.log(`📧 ارسال مجدد ایمیل برای ${toEmail} در تلاش ${attempt + 1} موفق بود.`);
        }
        return;
      } catch (err) {
        lastErr = err;
        console.warn(
          `📧 تلاش ${attempt + 1}/${RETRY_DELAYS_MS.length} برای ارسال ایمیل به ${toEmail} ناموفق:`,
          err?.message || err
        );
      }
    }
    console.error(`📧 ❌ ارسال ایمیل به ${toEmail} پس از ${RETRY_DELAYS_MS.length} تلاش ناموفق بود:`, lastErr?.message || lastErr);
  });
  // خرابی یک کار، زنجیره‌ی کارهای بعدی را نمی‌شکند
  chain = job.catch(() => {});
  return job;
}

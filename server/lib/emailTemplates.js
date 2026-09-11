// ─── قالب‌های HTML ایمیل لیستیا (RTL، جدول‌محور برای سازگاری با همه‌ی کلاینت‌ها)
import { LICENSE_PLANS } from "./licensing.js";

const BRAND = {
  name: "لیستیا",
  appUrl: "https://app.listia.ir",
  supportEmail: "info@listia.ir",
  instagram: "https://instagram.com/listia.ir",
  instagramHandle: "@listia.ir",
};

const faNum = (n) =>
  String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

const faPrice = (n) => faNum(Number(n).toLocaleString("en-US"));

// اسکلت مشترک ایمیل — جداول به‌جای flex/grid (جی‌میل و اوت‌لوک قدیمی)
function layout({ title, preheader, body }) {
  const tpl = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f7;direction:rtl;font-family:Tahoma,'Segoe UI',Arial,sans-serif;color:#1c2434;">
<span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 28px rgba(20,40,90,.10);">

  <!-- هدر -->
  <tr><td style="background:linear-gradient(135deg,#0b2a6b 0%,#1457c4 55%,#1f8fec 100%);background-color:#1457c4;padding:30px 32px;text-align:center;">
    <div style="font-size:30px;font-weight:800;color:#ffffff;letter-spacing:.5px;">🛒 لیستیا</div>
    <div style="margin-top:6px;font-size:13px;color:#cfe0ff;">مدیریت هوشمند لیست خرید، تأمین‌کننده‌ها و هزینه‌ها</div>
  </td></tr>

  <!-- بدنه -->
  <tr><td style="padding:32px 34px 8px;">
${body}
  </td></tr>

  <!-- فوتر -->
  <tr><td style="padding:24px 34px 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="border-top:1px solid #e6eaf2;padding-top:18px;font-size:12px;line-height:2;color:#8a93a6;text-align:center;">
        این ایمیل از طرف <b style="color:#5a6478;">${BRAND.name}</b> برای شما ارسال شده است.<br>
        پشتیبانی: <a href="mailto:${BRAND.supportEmail}" style="color:#1457c4;text-decoration:none;">${BRAND.supportEmail}</a>
        &nbsp;|&nbsp; <a href="${BRAND.appUrl}" style="color:#1457c4;text-decoration:none;">${BRAND.appUrl.replace("https://", "")}</a><br>
        اگر این ایمیل را درخواست نکرده‌اید، لازم نیست کاری انجام دهید؛ آن را نادیده بگیرید.
      </td>
    </tr></table>
  </td></tr>

</table>
<div style="max-width:600px;margin:12px auto 0;font-size:11px;color:#aab2c2;text-align:center;">لیستیا — خرید هوشمندانه، بدون فراموشی</div>
</td></tr>
</table>
</body>
</html>`;
  return tpl;
}

// ─── ایمیل کد تأیید ─────────────────────────────────────────────────────────
export function verificationEmail({ code, firstName } = {}) {
  const safeCode = faNum(String(code ?? "").padStart(6, "0").slice(0, 6));
  const name = firstName ? `${firstName} عزیز` : "کاربر گرامی";
  const html = layout({
    title: "کد تأیید ایمیل لیستیا",
    preheader: `کد تأیید شما: ${safeCode}`,
    body: `
    <h1 style="margin:0 0 14px;font-size:20px;color:#13203a;">تأیید نشانی ایمیل</h1>
    <p style="margin:0 0 10px;font-size:14px;line-height:2.2;color:#3b455b;">سلام ${name}،</p>
    <p style="margin:0 0 22px;font-size:14px;line-height:2.2;color:#3b455b;">
      برای تکمیل ثبت‌نام در لیستیا، کد تأیید زیر را در برنامه وارد کنید:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="background:#f2f6ff;border:1px dashed #9db8ef;border-radius:14px;padding:22px;">
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#1457c4;font-family:Consolas,Tahoma,monospace;direction:ltr;">${safeCode}</div>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:13px;line-height:2.1;color:#7a8499;">
      ⏱ این کد فقط <b style="color:#d97706;">۱۰ دقیقه</b> اعتبار دارد و یک‌بارمصرف است.<br>
      🔒 هرگز این کد را در اختیار کسی قرار ندهید؛ تیم لیستیا آن را از شما نمی‌خواهد.
    </p>`,
  });

  const text =
    `لیستیا — کد تأیید ایمیل\n\n` +
    `سلام ${name}،\n\nکد تأیید شما: ${safeCode}\nاین کد ۱۰ دقیقه اعتبار دارد.\n` +
    `اگر این درخواست از طرف شما نبوده، این ایمیل را نادیده بگیرید.\n\nپشتیبانی: ${BRAND.supportEmail}`;

  return { subject: "کد تأیید ایمیل لیستیا", html, text };
}

// ─── ایمیل خوش‌آمد پس از تأیید ──────────────────────────────────────────────
export function welcomeEmail({ firstName, username } = {}) {
  const name = firstName ? `${firstName} عزیز` : "کاربر گرامی";
  const rows = LICENSE_PLANS.map((p) => {
    const popular = p.code === "365D";
    const cell = (txt, opts = {}) =>
      `<td style="padding:13px 16px;font-size:13.5px;border-bottom:1px solid #edf0f6;${opts.style ?? ""}">${txt}</td>`;
    return `<tr>
      ${cell(`${popular ? "⭐ " : ""}${p.label}${p.days ? ` (${faNum(p.days)} روز)` : ""}`, { style: "font-weight:700;color:#13203a;" })}
      ${cell(`${faPrice(p.price)} تومان`, { style: "direction:ltr;text-align:left;white-space:nowrap;color:#1457c4;font-weight:700;" })}
    </tr>`;
  }).join("");

  const html = layout({
    title: "خوش آمدید به لیستیا 🎉",
    preheader: "حساب شما فعال شد. با لایسنس لیستیا، نامحدود خرید و هزینه‌ها را مدیریت کنید.",
    body: `
    <h1 style="margin:0 0 14px;font-size:20px;color:#13203a;">🎉 به لیستیا خوش آمدید!</h1>
    <p style="margin:0 0 12px;font-size:14px;line-height:2.2;color:#3b455b;">سلام ${name}،</p>
    <p style="margin:0 0 12px;font-size:14px;line-height:2.2;color:#3b455b;">
      ایمیل شما با موفقیت تأیید شد و حساب لیستیا فعال است.
      لیستیا به شما کمک می‌کند خریدها را سازماندهی کنید، قیمت چند تأمین‌کننده را کنار هم بگذارید،
      بودجه‌ی خرید را برآورد بزنید و دیگر هیچ قلمی را فراموش نکنید.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;">
      <tr><td style="background:#f8fafc;border:1px solid #e6eaf2;border-radius:14px;padding:18px 20px;">
        <div style="font-size:14px;font-weight:700;color:#13203a;margin-bottom:8px;">✨ در نسخه‌ی آزمایشی (دمو) دارید:</div>
        <ul style="margin:0;padding:0 22px 0 0;font-size:13px;line-height:2.3;color:#3b455b;">
          <li>تا <b>۱ تأمین‌کننده</b> و <b>۵ محصول</b> برای امتحان کامل امکانات</li>
          <li>جستجوی لیست، برآورد بودجه و مقایسه‌ی قیمت‌ها</li>
        </ul>
        <div style="margin-top:10px;font-size:13px;line-height:2.2;color:#3b455b;">
          با تهیه‌ی لایسنس، همه‌ی محدودیت‌ها برداشته می‌شود:
          <b style="color:#1457c4;">تأمین‌کننده و محصول نامحدود، اشتراک‌گذاری با همکاران،
          جستجوی قیمت زنده، ایمپورت اکسل و کلید API میانبر.</b>
        </div>
      </td></tr>
    </table>

    <div style="font-size:15px;font-weight:800;color:#13203a;margin:0 0 10px;">💎 تعرفه‌ی لایسنس‌ها</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e6eaf2;border-radius:14px;overflow:hidden;margin-bottom:22px;">
      <tr>
        <th style="padding:12px 16px;background:#1457c4;color:#fff;font-size:13px;text-align:right;">پلن</th>
        <th style="padding:12px 16px;background:#1457c4;color:#fff;font-size:13px;text-align:left;">قیمت (تومان)</th>
      </tr>
      ${rows}
    </table>

    <div style="font-size:15px;font-weight:800;color:#13203a;margin:0 0 8px;">چطور لایسنس بگیرم؟</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
      <tr><td style="font-size:13.5px;line-height:2.3;color:#3b455b;">
        ۱️⃣ داخل برنامه وارد بخش <b>«لایسنس»</b> شوید (دکمه‌ی «لایسنس فعال» پایین صفحه) و
        <b>شناسه‌ی فعال‌سازی</b> خود را بردارید و پلن موردنظر را انتخاب کنید.<br>
        ۲️⃣ در اینستاگرام به پیج <b>${BRAND.instagramHandle}</b> دایرکت بدهید و شناسه را
        بفرستید تا برای خرید و پرداخت راهنمایی‌تان کنیم.<br>
        ۳️⃣ پس از پرداخت، کلید فعال‌سازی برایتان ارسال می‌شود؛ همان‌جا در برنامه وارد کنید تا
        حساب نامحدود شود.
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;"><tr><td align="center">
      <a href="${BRAND.instagram}" target="_blank"
         style="display:inline-block;background:linear-gradient(45deg,#f09433,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888);background-color:#cc2366;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:11px 26px;border-radius:12px;">
        📩 دایرکت به ${BRAND.instagramHandle} در اینستاگرام
      </a>
    </td></tr></table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${BRAND.appUrl}" target="_blank"
         style="display:inline-block;background:linear-gradient(135deg,#1457c4,#1f8fec);background-color:#1457c4;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 34px;border-radius:12px;">
        ورود به لیستیا
      </a>
    </td></tr></table>
    <p style="margin:18px 0 0;font-size:13px;line-height:2.2;color:#7a8499;">
      اگر سؤالی دارید، کافی است در اینستاگرام به{" "}
      <a href="${BRAND.instagram}" style="color:#1457c4;text-decoration:none;">${BRAND.instagramHandle}</a>{" "}
      دایرکت بدهید یا به ${BRAND.supportEmail} ایمیل بزنید تا راهنمایی‌تان کنیم.
    </p>`,
  });

  const plansText = LICENSE_PLANS.map(
    (p) => `• ${p.label}: ${Number(p.price).toLocaleString("en-US")} تومان`
  ).join("\n");

  const text =
    `به لیستیا خوش آمدید، ${name}!\n\n` +
    `ایمیل شما تأیید شد و حساب فعال است.\n\n` +
    `نسخه‌ی آزمایشی (دمو): تا ۱ تأمین‌کننده و ۵ محصول.\n` +
    `با لایسنس، همه‌چیز نامحدود می‌شود: تأمین‌کننده و محصول نامحدود، اشتراک‌گذاری،\n` +
    `جستجوی قیمت زنده، ایمپورت اکسل و کلید API.\n\n` +
    `تعرفه‌ی لایسنس‌ها (تومان):\n${plansText}\n\n` +
    `نحوه‌ی خرید: داخل برنامه بخش «لایسنس»، پلن را انتخاب کنید و شناسه‌ی فعال‌سازی را\n` +
    `بردارید، سپس در اینستاگرام به پیج ${BRAND.instagramHandle} دایرکت بدهید تا برای پرداخت\n` +
    `راهنمایی‌تان کنیم و کلید فعال‌سازی برایتان ارسال شود.\n` +
    `اینستاگرام: ${BRAND.instagram}\n\n` +
    `برنامه: ${BRAND.appUrl}\nپشتیبانی: ${BRAND.supportEmail}\n\n` +
    `با احترام، تیم لیستیا`;

  return { subject: "🎉 به لیستیا خوش آمدید — راهنمای فعال‌سازی و تعرفه‌ی لایسنس", html, text };
}

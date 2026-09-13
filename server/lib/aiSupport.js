// ─── پشتیبانی هوش مصنوعی (درگاه چابکان، سازگار با OpenAI) ──────────────────
// کلید فقط سمت سرور می‌ماند؛ کلاینت هرگز آن را نمی‌بیند. متغیرها:
//   CHABOKAN_AI_API_KEY     کلید sk-chbk-... (الزامی برای فعال‌شدن ربات)
//   CHABOKAN_AI_MODEL       شناسه مدل اصلی (پیش‌فرض chabok/free؛ رایگان)
//   CHABOKAN_AI_MODEL_FALLBACK مدلی که اگر اصلی خطا داد خودکار جایگزین می‌شود
//   CHABOKAN_AI_BASE_URL    پیش‌فرض https://ai.chabokan.net/v1
const DEFAULT_BASE_URL = "https://ai.chabokan.net/v1";
// مدل رایگان رسمی چابکان به‌عنوان اصلی؛ gpt-oss-20b (تقریباً رایگان و فارسی خوب)
// به‌عنوان مدل پشتیبان خودکار تنظیم شده است.
const DEFAULT_MODEL = "chabok/free";
const DEFAULT_FALLBACK_MODEL = "openai/gpt-oss-20b-free";

export function aiConfigured() {
  return Boolean(process.env.CHABOKAN_AI_API_KEY?.trim());
}

export function aiModel() {
  return (process.env.CHABOKAN_AI_MODEL || DEFAULT_MODEL).trim();
}

// فهرست مدل‌ها به‌ترتیب اولویت (اصلی + پشتیبان). می‌توان با CHABOKAN_AI_MODELS
// (با کاما) هم چند مدل دلخواه داد.
export function aiModels() {
  const raw = process.env.CHABOKAN_AI_MODELS?.trim();
  if (raw) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const primary = aiModel();
  const fallback = (process.env.CHABOKAN_AI_MODEL_FALLBACK || DEFAULT_FALLBACK_MODEL).trim();
  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}

// ─── دانش‌نامه‌ی رسمی لیستیا (تنها مرجع پاسخ دستیار) ────────────────────────
const KNOWLEDGE = `
# معرفی لیستیا
لیستیا یک نرم‌افزار فارسی (وب‌اپ PWA) برای «مدیریت هوشمند خرید، تأمین‌کننده‌ها و هزینه‌ها»ست؛
برای فروشگاه‌ها، رستوران‌ها، کافه‌ها و کسب‌وکارهایی که خرید دوره‌ای از چند تأمین‌کننده دارند.
با مرورگر موبایل/کامپیوتر کار می‌کند، تم تیره و روشن دارد و رابط کاملاً فارسی و راست‌به‌چپ است.
نشانی برنامه: https://app.listia.ir

## بخش‌های اصلی برنامه
- داشبورد: نگاه کلی به خریدهای فعال، تعداد تأمین‌کننده/محصول و جمع هزینه‌ها.
- خریدهای فعال: فهرست اقلام موردنیاز به تفکیک تأمین‌کننده با تعداد، واحد و قیمت.
- تأمین‌کننده‌ها: ساخت تأمین‌کننده و ثبت محصول/کالا زیرمجموعه‌ی هر کدام.
- برآورد قیمت (تخمین قیمت): برای هر محصول قیمت واحد و «تعداد در واحد» (مثلاً در کارتن/بسته چندتاست)
  ثبت می‌شود؛ می‌توان سقف بودجه گذاشت و نوار پیشرفت بودجه را دید، اقلام را به «خرید بعدی» فرستاد
  یا با دکمه‌ی «برش لیست تا سقف بودجه» خودکار لیست را طوری کوتاه کرد که جمع خرید داخل بودجه بنشیند.
- جستجوی قیمت زنده با هوش مصنوعی: از داخل صفحه‌ی برآورد، روی دکمه‌ی ذره‌بین هر محصول می‌توان
  قیمت آنلاین را جستجو کرد؛ هوش مصنوعی خودش در اینترنت جستجو می‌کند، قیمت‌های زنده از چند
  فروشگاه/سایت مناسب را می‌آورد و با یک کلیک قیمت و لینک ثبت می‌شود. با هاور روی عکس نتایج
  (هر جا که عکسی بود)، عکس بزرگ نمایش داده می‌شود. این جستجو ممکن است ۱۰ تا ۶۰ ثانیه طول بکشد.
- جستجوی قیمت بر اساس شغل: در پنجره‌ی جستجوی قیمت می‌توان شغل/حرفه را وارد کرد؛ هوش مصنوعی
  بر اساس همان شغل سایت‌های مناسب را انتخاب می‌کند و گونه‌ی حرفه‌ای/صنعتیِ کالا را جستجو می‌کند
  (مثلاً برای شغل خدمات نظافت، «تی حوله‌ای» را به‌عنوان «تی حوله‌ای صنعتی/شور» در سایت‌های مناسب می‌جود).
- جستجوی سراسری (کلید میانبر Ctrl+K یا دکمه جستجو در منو): یافتن سریع محصول و تأمین‌کننده.
- ایمپورت اکسل/CSV: ورود گروهی تأمین‌کننده و محصول از فایل اکسل در بخش «ایمپورت اکسل»
  (فایل نمونه داخل همان صفحه هست؛ خطاهای هر ردیف جداگانه گزارش می‌شود).
- بایگانی: خریدهای انجام‌شده بر اساس تاریخ شمسی گروه‌بندی و بایگانی می‌شوند و قابل بازگردانی‌اند.
- حساب کاربری: ویرایش مشخصات و موبایل، تغییر رمز عبور، کلید API و «اشتراک‌گذاری داده با همکاران».
- لایسنس: صفحه‌ی جداگانه‌ی «لایسنس» (از منوی کناری یا چیپ پایین صفحه) برای دیدن وضعیت و مدت اعتبار،
  خرید و فعال‌سازی کلید.
- پنل مدیریت فقط برای کاربر ادمین.

## ثبت‌نام و ورود
- ثبت‌نام با نام، نام خانوادگی، نام کاربری، رمز عبور، ایمیل و شماره موبایل انجام می‌شود.
- رمز باید حداقل ۹ کاراکتر و شامل حرف کوچک، حرف بزرگ و عدد باشد.
- پس از ثبت‌نام یک کد ۶ رقمی به ایمیل فرستاده می‌شود که ۱۰ دقیقه اعتبار دارد.
- اگر ایمیل نیامد: اول پوشه‌ی هرزنامه/Spam را بگرد و ایمیل را «Not Spam» کن؛ دکمه‌ی «ارسال مجدد کد»
  حداکثر یک بار در دقیقه کار می‌کند و شمارش معکوس دارد؛ با «تغییر ایمیل» می‌توان نشانی را عوض کرد.
- ارقام کد را می‌توان فارسی یا انگلیسی وارد کرد.
- در حین ساخت حساب، صندوق ورودی را در همان مرورگر باز نگه دار.

## نسخه آزمایشی (دمو) و لایسنس
- نسخه رایگان فقط تا ۱ تأمین‌کننده و ۵ محصول اجازه می‌دهد.
- با لایسنس: تأمین‌کننده و محصول نامحدود، اشتراک‌گذاری داده با همکاران، جستجوی قیمت زنده،
  ایمپورت اکسل و کلید API برای ثبت از بیرون برنامه.
- پلن‌ها و قیمت‌های قطعی (تومان):
  • یک ماهه (۳۰ روز): ۹۹٬۰۰۰
  • شش ماهه (۱۸۰ روز): ۴۹۹٬۰۰۰
  • یکساله (۳۶۵ روز): ۸۹۹٬۰۰۰ — پیشنهاد ویژه
  • مادام‌العمر: ۱٬۸۹۹٬۰۰۰
  پلن ۹۰ روزه فروخته نمی‌شود.
- نحوه‌ی خرید: در صفحه‌ی «لایسنس»، پلن را انتخاب کن و «شناسه‌ی فعال‌سازی» (با فرمت LST-XXXX-XXXX)
  را بردار؛ سپس در اینستاگرام به پیج @listia.ir دایرکت بده تا راهنمایی خرید/پرداخت شوی.
  پس از پرداخت، کلید لایسنس (با پیشوند LST-) دریافت می‌شود که باید در کادر «فعال‌سازی با کلید»
  همان صفحه وارد شود؛ فعال‌سازی فوری است.
- در صفحه لایسنس تاریخ فعال‌سازی، تاریخ انقضای شمسی، تعداد روز باقی‌مانده و نوار پیشرفت اعتبار دیده می‌شود.

## کلید API و ثبت سریع از بیرون برنامه
- کاربران لایسنس‌دار می‌توانند از صفحه‌ی حساب یک کلید API بسازند و با آن از ابزارهای بیرونی
  (مثل شورتکات آیفون) محصول را با POST به آدرس /api/quick-add ثبت کنند.

## اشتراک‌گذاری داده با همکاران
- در صفحه‌ی حساب می‌توان کاربر دیگری را دعوت کرد تا در داده‌های تأمین‌کننده و خرید شریک شود؛
  داده‌ی یک تأمین‌کننده بین صاحب و کاربر دعوت‌شده مشترک است.

## نصب روی موبایل و دسکتاپ (PWA)
- لیستیا وب‌اپ است. روی آیفون در Safari و روی اندروید در منوی مرورگر گزینه‌ی «افزودن به صفحه اصلی»
  را بزن تا مثل یک اپ معمولی با آیکون مستقل باز شود. روی ویندوز نسخه نصبی (Electron) و برای اندروید
  فایل APK هم موجود است.

## مشکلات رایج و راه‌حل
- دکمه تأیید/ارسال ایمیل واکنش نمی‌دهد: ارسال ایمیل در پس‌زمینه انجام می‌شود؛ پاسخ فوری است ولی
  رسیدن ایمیل بسته به سرور ایمیل چند ثانیه تا چند دقیقه طول می‌کشد؛ Spam را چک کن.
- قیمت جستجوی آنلاین پیدا نشد: عبارت را کوتاه‌تر و رایج‌تر بنویس و چند ثانیه بعد دوباره جستجو
  کن (جستجو با هوش مصنوعی است و ممکن است گاهی طول بکشد یا نتایج کمتری بدهد).
- رمز عبور را فراموش کرده‌ام یا نیاز به پیگیری خرید/لایسنس/بازگشت وجه: باید توسط پشتیبانی انسانی
  پیگیری شود.

## پشتیبانی انسانی
- اینستاگرام: @listia.ir (https://instagram.com/listia.ir) — توصیه‌شده برای راهنمایی خرید و فعال‌سازی
- ایمیل: info@listia.ir
برای پیگیری سفارش، رسید پرداخت، فعال‌نشدن کلید، بازگشت وجه یا مشکل حساب، کاربر را به دایرکت
اینستاگرام هدایت کن.

## قواعد پاسخگویی
- فقط و فقط درباره‌ی لیستیا و همین موضوعات پاسخ بده؛ به پرسش‌های نامرتبط (سیاست، سرگرمی، برنامه‌نویسی
  نامرتبط و …) مؤدبانه بگو دستیار پشتیبانی لیستیا و فقط در همین زمینه کمک می‌کنی.
- هیچ قیمتی، پلنی یا قابلیتی غیر از مقادیر بالا اختراع نکن؛ اگر چیزی در این مستندات نیست، بگو
  «اطمینان ندارم؛ لطفاً در اینستاگرام @listia.ir دایرکت بدهید تا دقیق راهنمایی شوی».
- پاسخ‌ها فارسی، کوتاه، گام‌به‌گام و قابل‌فهم برای کاربر غیرفنی باشد.
- می‌توانی با Markdown ساده (عنوان، بولد، فهرست عددی) پاسخ را مرتب کنی؛ در صورت تناسب حداکثر
  ۴ تا ۸ خط بنویس.
- ادعا نکن که به حساب کاربر یا داده‌های کاربر دسترسی داری؛ برای کارهای حساب‌محور مسیر منو را راهنمایی کن.
`;

export function systemPrompt() {
  return (
    "تو «لیا»، دستیار هوشمند پشتیبانی رسمی محصول «لیستیا» هستی. " +
    "به فارسی روان و دوستانه پاسخ می‌دهی و فقط از دانش زیر استفاده می‌کنی:\n\n" +
    KNOWLEDGE
  );
}

// تاریخچه‌ی سمت کلاینت قابل اعتماد نیست؛ نقش‌ها و طول را اینجا محدود می‌کنیم
const MAX_TURNS = 8; // حداکثر ۸ پیام آخرِ کاربر
const MAX_USER_CHARS = 1500;

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const clean = [];
  for (const m of history) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : null;
    if (!role) continue;
    const content = String(m.content ?? "").trim().slice(0, MAX_USER_CHARS);
    if (!content) continue;
    clean.push({ role, content });
  }
  // فقط آخرین نوبت‌ها و با شروع از user
  const tail = clean.slice(-MAX_TURNS * 2);
  while (tail.length && tail[0].role !== "user") tail.shift();
  return tail;
}

/**
 * گفتگوی خام با درگاه چابکان (سازگار با OpenAI) با مدل اصلی و fallback خودکار.
 * هر کاربرد هوش مصنوعی دیگری در اپ از همین تابع استفاده می‌کند.
 *
 * اگر `opts.model` داده شود، فقط همان مدل صدا زده می‌شود و زنجیره‌ی
 * fallback اجرا نمی‌شود.
 *
 * `opts.webSearch` (پس‌بندهای سازگار با OpenAI/OpenRouter، از جمله درگاه
 * چابکان): با مقدار true، پلاگین جستجوی اینترنت (`plugins: [{id:"web"}]`)
 * به درخواست اضافه می‌شود تا مدل نتایج زنده‌ی وب را در پاسخ بکار بگیرد.
 *
 * @param {Array<{role:string, content:string}>} messages
 * @param {{maxTokens?:number, temperature?:number, timeoutMs?:number, label?:string, maxChars?:number, model?:string, webSearch?:boolean}} [opts]
 * @returns {Promise<{reply:string, model:string, annotations:Array}>}
 */
export async function aiChatComplete(messages, opts = {}) {
  if (!aiConfigured()) {
    const err = new Error("سرویس هوش مصنوعی در حال حاضر فعال نیست.");
    err.status = 503;
    throw err;
  }
  const label = opts.label || "AI";
  const maxTokens = Number(opts.maxTokens ?? 1000);
  const temperature = Number(opts.temperature ?? Number(process.env.CHABOKAN_AI_TEMPERATURE || "0.3"));
  const timeoutMs = Number(opts.timeoutMs ?? (process.env.CHABOKAN_AI_TIMEOUT_MS || "30000"));
  const maxChars = Number(opts.maxChars ?? 4000);
  const webSearch = Boolean(opts.webSearch);
  const baseUrl = (process.env.CHABOKAN_AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const pinned = String(opts.model ?? "").trim();
  const models = pinned ? [pinned] : aiModels();

  const callOnce = async (model) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      const body = { model, messages, temperature, max_tokens: maxTokens };
      if (/gpt-oss/i.test(model)) body.reasoning_effort = "low";
      // فعال‌سازی جستجوی اینترنت (مستندات درگاه سازگار با OpenAI / OpenRouter):
      // پلاگین «web» نتایج زنده‌ی وب را به مدل می‌دهد تا قیمت‌ها به‌روز باشند.
      // max_results مودبانه محدود است تا context و زمان پاسخ فربه نشود.
      if (webSearch) body.plugins = [{ id: "web", max_results: 6 }];
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${process.env.CHABOKAN_AI_API_KEY.trim()}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      clearTimeout(timer);
      const e = new Error(
        err?.name === "AbortError"
          ? "پاسخ هوش مصنوعی طول کشید؛ دوباره تلاش کنید."
          : "ارتباط با سرویس هوش مصنوعی برقرار نشد؛ کمی بعد دوباره تلاش کنید."
      );
      e.status = err?.name === "AbortError" ? 504 : 502;
      e.retryable = true;
      throw e;
    }
    clearTimeout(timer);

    if (!res.ok) {
      let detail = "";
      try {
        const b = await res.json();
        detail = b?.error?.message || b?.message || "";
      } catch {
        /* پاسخ غیر JSON */
      }
      console.error(
        `${label}: خطای ${res.status} از درگاه چابکان (مدل ${model})`,
        detail ? `→ ${String(detail).slice(0, 200)}` : ""
      );
      const clientErr = res.status >= 400 && res.status < 500;
      const e = new Error(
        res.status === 401 || res.status === 403
          ? "کلید هوش مصنوعی پذیرفته نشد؛ لطفاً تنظیمات سرور را بررسی کنید."
          : clientErr
            ? `درگاه هوش مصنوعی درخواست را نپذیرفت (${res.status})؛ شناسه‌ی مدل و تنظیمات سرور را بررسی کنید.`
            : "سرویس هوش مصنوعی موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید."
      );
      // خطاهای ۴xx وضعیت واقعی را نگه می‌دارند (تا لایه‌های بالاتر بتوانند
      // تشخیص دهند مشکل از پارامتر/مدل است نه از دسترس‌نبودی سرویس)
      e.status = clientErr ? res.status : 502;
      e.retryable = !clientErr || res.status === 429;
      throw e;
    }

    const b = await res.json().catch(() => null);
    const choice = b?.choices?.[0] ?? {};
    const message = choice.message ?? {};
    const reply = message.content?.toString().trim();
    if (!reply) {
      // پاسخ خالی: معمولاً finish_reason=length یعنی مدل سقف توکن را در
      // «تفکر»/جستجوی وب خرج کرده و به متن نرسیده (برای دیباگ در کنسول)
      console.error(
        `${label}: پاسخ خالی از مدل ${model} → finish_reason=${choice.finish_reason ?? "?"} ` +
          `usage=${JSON.stringify(b?.usage ?? {})} model_usage=${JSON.stringify(b?.usage?.completion_tokens_details ?? "")}`
      );
      const e = new Error("پاسخی از هوش مصنوعی دریافت نشد؛ دوباره تلاش کنید.");
      e.status = 502;
      e.retryable = true;
      e.finishReason = choice.finish_reason ?? null;
      throw e;
    }
    // وقتی جستجوی اینترنت فعال است، لینک‌های واقعی‌ای که مدل از نتایج وب
    // استفاده کرده در annotations (نوع url_citation) برمی‌گردد.
    const annotations = (Array.isArray(message.annotations) ? message.annotations : [])
      .filter((a) => a?.type === "url_citation" && a?.url_citation?.url)
      .map((a) => ({
        url: String(a.url_citation.url),
        title: String(a.url_citation.title ?? ""),
      }));
    return { reply: reply.slice(0, maxChars), model, annotations };
  };

  // مدل اصلی و در صورت خطای موقت، مدل(های) پشتیبان
  let lastErr;
  for (let i = 0; i < models.length; i++) {
    try {
      const out = await callOnce(models[i]);
      if (i > 0) console.log(`${label}: مدل پشتیبان ${models[i]} پاسخ داد.`);
      return out;
    } catch (err) {
      lastErr = err;
      if (!err.retryable) break;
    }
  }
  throw lastErr;
}

/**
 * گفتگو با دستیار پشتیبانی.
 * @param {{message?:string, history?:Array}} input
 * @returns {Promise<{reply:string}>}
 */
export async function supportChat({ message = "", history = [] } = {}) {
  if (!aiConfigured()) {
    const err = new Error("پشتیبانی هوشمند در حال حاضر فعال نیست.");
    err.status = 503;
    throw err;
  }
  const userMessage = String(message ?? "").trim().slice(0, MAX_USER_CHARS);
  if (!userMessage) {
    const err = new Error("متن پرسش را بنویسید.");
    err.status = 400;
    throw err;
  }

  const messages = [
    { role: "system", content: systemPrompt() },
    ...sanitizeHistory(history),
    { role: "user", content: userMessage },
  ];

  const { reply } = await aiChatComplete(messages, {
    maxTokens: 1000,
    temperature: Number(process.env.CHABOKAN_AI_TEMPERATURE || "0.3"),
    label: "پشتیبانی AI",
  });
  return { reply };
}

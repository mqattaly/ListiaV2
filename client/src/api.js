// کلاینت API — همه‌ی درخواست‌ها نسبت به same-origin (در توسعه از طریق پروکسی Vite)
//
// احراز هویت دو لایه دارد:
//   ۱) کوکی‌ی نشست (در حالت عادی)
//   ۲) توکن Bearer — برای وقتی مرورگر کوکی/ذخیره‌سازی داخل iframe را بلاک کند.
//
// توکن در اولین محلِ در دسترس ذخیره می‌شود (localStorage → sessionStorage →
// حافظه‌ی صفحه) تا در هر محیطی — حتی iframe‌های با storage بسته — کار کند.

const TOKEN_KEY = "listia-session-token";
const COOKIE_KEY = "listia_token";

// لایه‌ی حافظه: حتی وقتی همه‌ی ذخیره‌سازی‌ها بلاک/خطا باشند هم توکنِ این
// نشستِ صفحه در درخواست‌ها ارسال می‌شود.
let memoryToken = null;

// کوکی سمت مرورگر (Partitioned/CHIPS) — برای ماندگاری بعد از رفرشِ صفحه
// در iframeهایی که localStorage را بلاک می‌کنند.
function writeCookieToken(token) {
  try {
    if (token) {
      document.cookie =
        `${COOKIE_KEY}=${encodeURIComponent(token)}; path=/; max-age=2592000; SameSite=None; Secure; Partitioned;`;
    } else {
      // حذف باید دقیقاً با همان ویژگی‌ها انجام شود؛ وگرنه کوکی‌ی Partitioned
      // سر جایش می‌ماند و کاربر عملاً خارج نمی‌شود. هر سه گونه را پاک می‌کنیم.
      document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; SameSite=None; Secure; Partitioned;`;
      document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; SameSite=None; Secure;`;
      document.cookie = `${COOKIE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;`;
    }
  } catch {
    /* کوکی قابل نوشتن نیست */
  }
}

function readCookieToken() {
  try {
    const prefix = `${COOKIE_KEY}=`;
    for (const part of document.cookie.split(";")) {
      const trimmed = part.trim();
      if (trimmed.startsWith(prefix)) {
        return decodeURIComponent(trimmed.slice(prefix.length)) || null;
      }
    }
  } catch {
    /* کوکی قابل خواندن نیست */
  }
  return null;
}

function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveSessionToken(token) {
  memoryToken = token ?? null;
  writeCookieToken(token);
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* ذخیره‌سازی در دسترس نیست — لایه‌های دیگر کافی‌اند */
  }
}

export function getSessionToken() {
  return memoryToken ?? readStoredToken() ?? readCookieToken();
}

async function request(path, { method = "GET", body, formData, timeout } = {}) {
  const options = {
    method,
    credentials: "same-origin",
    headers: {},
  };
  // تایم‌اوت سمت کلاینت: آپلود تا ۲ دقیقه، بقیه درخواست‌ها ۳۰ ثانیه
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutMs = timeout ?? (formData ? 120_000 : 30_000);
  const timer = controller
    ? setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : null;
  if (controller) options.signal = controller.signal;

  const token = getSessionToken();
  let url = path;
  if (token) {
    // توکن در هدر Bearer و هدر اختصاصی ارسال می‌شود؛ دیگر در URL گذاشته
    // نمی‌شود تا در لاگ‌ها/تاریخچه/Referer نشت نکند. مسیر کوکی پابرجاست و
    // فقط به‌عنوان لایه‌ی پشتیبان باقی می‌ماند.
    options.headers.Authorization = `Bearer ${token}`;
    options.headers["X-Listia-Auth"] = token;
  }
  if (formData) {
    options.body = formData;
  } else if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("درخواست بیش از حد طول کشید؛ اتصال اینترنت یا سرور را بررسی کنید.");
    }
    throw new Error("ارتباط با سرور برقرار نشد؛ اتصال اینترنت را بررسی کنید.");
  } finally {
    if (timer) clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { success: false, message: "پاسخ نامعتبر از سرور." };
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      // نشست واقعاً باطل است — به اپ بگو کاربر را به صفحه‌ی ورود ببرد
      saveSessionToken(null);
      window.dispatchEvent(new CustomEvent("listia-unauth"));
    }
    const err = new Error(data?.message || `خطای ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  // اگر سرور نشست تازه‌ای صادر کرد (مثلاً بعد از تغییر رمز)، خودکار ذخیره شود
  if (data?.session_token) saveSessionToken(data.session_token);
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: body ?? {} }),
  upload: (path, formData) => request(path, { method: "POST", formData }),
};

/** فراخوانی با مدیریت خطای بی‌صدا (برای رفرش‌های پس‌زمینه) */
export async function tryApi(promise) {
  try {
    return await promise;
  } catch {
    return null;
  }
}

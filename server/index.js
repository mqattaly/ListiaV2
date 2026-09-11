// ─── سرور لیستیا — Express + SQLite (node:sqlite) ───────────────────────────
import express from "express";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { attachUser, requireAuth, hashPassword } from "./lib/auth.js";
import { get, run, checkpoint, closeDb } from "./lib/db.js";

import authRoutes from "./routes/auth.js";
import appRoutes from "./routes/app.js";
import accountRoutes from "./routes/account.js";
import adminRoutes from "./routes/admin.js";
import tokenRoutes from "./routes/token.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);
const COOKIE_INSECURE = process.env.COOKIE_INSECURE === "1";

app.disable("x-powered-by");

// ─── تشخیص درست IP پشت پراکسی معکوس ────────────────────────────────────────
// تعداد لایه‌های پراکسی مورد اعتماد (۱ برای اکثر هاست‌ها؛ برای CDN+هاست عدد ۲
// یا عبارتی مثل "loopback" بگذارید). بدون این، محدودیت نرخ بی‌اثر/کور می‌شود.
const trustEnv = process.env.TRUST_PROXY ?? "1";
app.set("trust proxy", /^\d+$/.test(trustEnv) ? Number(trustEnv) : trustEnv);

// ─── هدرهای امنیتی ──────────────────────────────────────────────────────────
// اگر اپ داخل iframe دامنه‌ی دیگری اجرا می‌شود، دامنه‌ها را در FRAME_ANCESTORS
// با فاصله‌ی کاما بگذارید (مثل: https://app.example.com)
const frameAncestors = process.env.FRAME_ANCESTORS
  ? process.env.FRAME_ANCESTORS.split(",").map((s) => s.trim()).filter(Boolean)
  : ["'self'"];
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'", "blob:", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors,
        upgradeInsecureRequests: COOKIE_INSECURE ? null : [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: COOKIE_INSECURE ? false : undefined,
  })
);

// ─── فشرده‌سازی پاسخ‌ها (gzip/deflate) ──────────────────────────────────────
app.use(compression());

// توجه: parser بدنه‌ی urlencoded عمداً حذف شده است — کلاینت فقط JSON می‌فرستد و
// حذف آن یکی از مسیرهای حمله‌ی CSRF با فرم بین‌دامنه‌ای را می‌بندد.
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ─── محافظ CSRF: مبدأ درخواست‌های تغییر‌دهنده باید مجاز باشد ────────────────
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) {
    // مرورگرهای مدرن برای فرم/fetch بین‌دامنه‌ای Origin می‌فرستند؛ نبودِ آن
    // معمولاً یعنی کلاینت غیرمرورگری (Shortcuts/اپ موبایل/curl).
    return req.headers["sec-fetch-site"] !== "cross-site";
  }
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const host = String(req.headers.host || "").split(",")[0].trim();
  if (parsed.host === host) return true;
  return (
    ALLOWED_ORIGINS.has(parsed.origin.toLowerCase()) ||
    ALLOWED_ORIGINS.has(`${parsed.protocol}//${parsed.host}`.toLowerCase())
  );
}
app.use((req, res, next) => {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();
  if (!originAllowed(req)) {
    return res
      .status(403)
      .json({ success: false, message: "درخواست از مبدأ غیرمجاز ارسال شده است." });
  }
  next();
});

app.use(attachUser);

// ─── سلامت سرویس ────────────────────────────────────────────────────────────
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "listia", version: "2.0.0" });
});

// ─── فایل نمونه‌ی ایمپورت عمومی است (لینک دانلود مستقیم مرورگر) ────────────
app.get("/api/import/template", (_req, res) => {
  res.download(
    path.join(__dirname, "assets", "sample_import.xlsx"),
    "نمونه_ایمپورت_لیستیا.xlsx"
  );
});

// ─── API کلیددار (بدون نشست) ────────────────────────────────────────────────
app.use("/api", tokenRoutes);

// ─── API اصلی ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api", requireAuth, appRoutes);
app.use("/api/account", requireAuth, accountRoutes);
app.use("/api/admin", requireAuth, adminRoutes);

// ─── ساخت اولین مدیر در اجرای اول (اگر هیچ کاربری نبود) ────────────────────
async function bootstrapAdmin() {
  if (process.env.ADMIN_AUTOBOOT === "0") return;
  const count = get("SELECT COUNT(*) AS n FROM users")?.n ?? 0;
  if (Number(count) > 0) return;
  const username = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "admin123456";
  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) {
    console.warn(
      "⚠️  ADMIN_PASSWORD در پروداکشن ست نشده است؛ ساخت ادمین اولیه با رمز ضعیف پیش‌فرض متوقف شد.\n" +
        "   یک رمز قوی در ADMIN_PASSWORD بگذارید و سرور را ری‌استارت کنید (یا ADMIN_AUTOBOOT=0)."
    );
    return;
  }
  run(
    `INSERT INTO users (username, password_hash, first_name, last_name, phone, email,
                        email_verified, is_licensed, license_type, is_admin)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'UNLIMITED', 1)`,
    username,
    await hashPassword(password),
    "مدیر",
    "لیستیا",
    "09120000000",
    `${username}@listia.local`
  );
  console.log(`\n👑 حساب مدیر اولیه ساخته شد → نام کاربری: «${username}» رمز: «${password}»`);
  console.log("   (با متغیرهای ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_AUTOBOOT قابل تغییر است)\n");
}
await bootstrapAdmin();

// ─── سرو کردن نسخه‌ی ساخته‌شده‌ی React در پروداکشن ───────────────────────────
const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  // سرویس‌ورکر نباید کش شود تا به‌روزرسانی وب‌اپ فوری باشد
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.type("application/javascript");
    res.sendFile(path.join(clientDist, "sw.js"));
  });
  // فایل‌های هش‌دار assets را می‌توان برای همیشه کش کرد (با هر بیلد نامشان عوض می‌شود)
  app.use(
    "/assets",
    express.static(path.join(clientDist, "assets"), {
      maxAge: "1y",
      immutable: true,
      fallthrough: true,
    })
  );
  app.use(express.static(clientDist, { maxAge: "1h", index: false }));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    // index.html نباید کش شود تا تغییرات نسخه‌ی جدید بلافاصله به مرورگر برسد
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// ─── خطاها ───────────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("خطای سرور:", err);
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "حجم درخواست بیش از حد بزرگ است." });
  }
  if (err?.name === "MulterError") {
    const map = {
      LIMIT_FILE_SIZE: "حجم فایل بیش از سقف مجاز (۸ مگابایت) است.",
      LIMIT_UNEXPECTED_FILE: "فیلد فایل نادرست است.",
    };
    return res.status(400).json({ success: false, message: map[err.code] || "خطا در بارگذاری فایل." });
  }
  res.status(500).json({ success: false, message: "خطای داخلی سرور." });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  console.log(`🚀 سرور لیستیا روی پورت ${PORT} بالا آمد (${mode}, http://0.0.0.0:${PORT})`);
});

// ─── خاموشی نرم: پایان پذیرش اتصال جدید، سپس چک‌پوینت و بستن دیتابیس ───────
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n⏻ ${signal} دریافت شد؛ در حال توقف نرم…`);
  const forceTimer = setTimeout(() => process.exit(1), 10_000).unref?.();
  server.close(() => {
    clearTimeout(forceTimer);
    try {
      checkpoint();
    } finally {
      closeDb();
      process.exit(0);
    }
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { app, server };

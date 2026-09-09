// ─── سرور لیستیا — Express + SQLite (node:sqlite) ───────────────────────────
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { attachUser, requireAuth } from "./lib/auth.js";
import { getUserLimits, isAdminUser } from "./lib/queries.js";
import { userPayload } from "./lib/serialize.js";
import { getUserByUsername, get, run } from "./lib/db.js";
import { adminUsernames } from "./lib/licensing.js";
import { hashPassword } from "./lib/auth.js";

import authRoutes from "./routes/auth.js";
import appRoutes from "./routes/app.js";
import accountRoutes from "./routes/account.js";
import adminRoutes from "./routes/admin.js";
import tokenRoutes from "./routes/token.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
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
function bootstrapAdmin() {
  if (process.env.ADMIN_AUTOBOOT === "0") return;
  const count = get("SELECT COUNT(*) AS n FROM users")?.n ?? 0;
  if (Number(count) > 0) return;
  const username = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "admin123456";
  run(
    `INSERT INTO users (username, password_hash, first_name, last_name, phone, email,
                        email_verified, is_licensed, license_type, is_admin)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'UNLIMITED', 1)`,
    username,
    hashPassword(password),
    "مدیر",
    "لیستیا",
    "09120000000",
    `${username}@listia.local`
  );
  console.log(`\n👑 حساب مدیر اولیه ساخته شد → نام کاربری: «${username}» رمز: «${password}»`);
  console.log("   (با متغیرهای ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_AUTOBOOT قابل تغییر است)\n");
}
bootstrapAdmin();

// ─── سرو کردن نسخه‌ی ساخته‌شده‌ی React در پروداکشن ───────────────────────────
const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  // سرویس‌ورکر نباید کش شود تا به‌روزرسانی وب‌اپ فوری باشد
  // (باید «قبل از» express.static ثبت شود وگرنه static با کش یک‌ساعته جواب می‌دهد)
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.type("application/javascript");
    res.sendFile(path.join(clientDist, "sw.js"));
  });
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
  res.status(500).json({ success: false, message: "خطای داخلی سرور." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 سرور لیستیا روی پورت ${PORT} بالا آمد (http://0.0.0.0:${PORT})`);
});

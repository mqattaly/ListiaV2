// ─── اجرای چندپردازشی لیستیا (یک ورکر روی هر هسته) ──────────────────────────
// هر ورکر یک نمونه‌ی کامل Express روی همان پورت است؛ لودبالانس به‌صورت round
// robin داخلی انجام می‌شود. دیتابیس SQLite در حالت WAL هم‌خوانی هم‌زمان چند
// ورکر را پشتیبانی می‌کند و برای نوشتن با busy_timeout صف می‌کشد.
//
// تعداد ورکرها: متغیر WORKERS (پیش‌فرض = تعداد هسته‌ها). برای تک‌پردازشی:
// WORKERS=1 یا مستقیماً server/index.js را اجرا کنید (نسخه‌ی دسکتاپ همین کار را می‌کند).
import "./lib/load-env.js"; // بارگذاری .env پیش از خواندن متغیرها در ورکرها
import cluster from "node:cluster";
import { availableParallelism } from "node:os";

const WORKERS = Math.max(
  1,
  Number(process.env.WORKERS) || availableParallelism()
);

// پیش‌فرض Node فقط ۴ ترد در استخر libuv است؛ scrypt احراز هویت غیرمسدودکننده
// است ولی زیر هجوم لاگین پشت همین ۴ ترد صف می‌بست. ۸ ترد توازن بهتری می‌دهد
// (با متغیر محیطی قابل بازنویسی است و باید پیش از fork ورکرها ست شود).
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = "8";
}

if (cluster.isPrimary) {
  console.log(`👷 ارباب cluster (pid ${process.pid}) — ${WORKERS} ورکر روی پورت ${process.env.PORT || 3001}`);

  let stopping = false;
  const forkAll = () => {
    for (let i = 0; i < WORKERS; i++) cluster.fork();
  };
  forkAll();

  cluster.on("exit", (worker, code, signal) => {
    if (stopping) return;
    console.warn(`⚠️  ورکر ${worker.process.pid} خارج شد (${signal || code})؛ ورکر جدید ساخته می‌شود.`);
    cluster.fork();
  });

  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log("⏻ ارباب: سیگنال توقف به ورکرها…");
    for (const id of Object.keys(cluster.workers)) {
      cluster.workers[id]?.kill("SIGTERM");
    }
    setTimeout(() => process.exit(0), 12_000).unref?.();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
} else {
  await import("./index.js");
}

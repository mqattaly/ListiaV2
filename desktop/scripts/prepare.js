// آماده‌سازی فایل‌های سرور و فرانت‌اند برای نسخه‌ی دسکتاپ
// کپی: ../server → ./server-app   و   ../client/dist → ./client
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const serverSrc = path.join(root, "server");
const clientDistSrc = path.join(root, "client", "dist");

const serverDst = path.join(__dirname, "..", "server-app");
const clientDst = path.join(__dirname, "..", "client", "dist");

function copyDir(src, dst, filter) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (filter && filter(entry, srcPath)) continue;
    if (entry.isDirectory()) copyDir(srcPath, dstPath, filter);
    else fs.copyFileSync(srcPath, dstPath);
  }
}

// ۱) کد سرور (بدون node_modules و دیتابیس محلی)
fs.rmSync(serverDst, { recursive: true, force: true });
copyDir(serverSrc, serverDst, (entry) => {
  if (entry.name === "node_modules" || entry.name === "data") return true;
  return false;
});
console.log("✓ کد سرور در server-app کپی شد");

// ۲) فرانت‌اند ساخته‌شده
if (!fs.existsSync(clientDistSrc)) {
  console.error(
    "✗ نسخه‌ی ساخته‌شده‌ی فرانت‌اند پیدا نشد.\n" +
      "  ابتدا در ریشه‌ی پروژه اجرا کنید:  npm install && npm run build"
  );
  process.exit(1);
}
fs.rmSync(path.join(__dirname, "..", "client"), { recursive: true, force: true });
fs.mkdirSync(path.dirname(clientDst), { recursive: true });
copyDir(clientDistSrc, clientDst);
console.log("✓ فرانت‌اند در desktop/client/dist کپی شد");
console.log("آماده — حالا: npm start (اجرا) یا npm run dist:win (ساخت نصبی)");

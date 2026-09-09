// دسکتاپ لیستیا — پوسته‌ی Electron با سرور Node داخلی
//
// دو حالت دارد:
//   ۱) حالت محلی (پیش‌فرض): سرور Express به‌صورت فرزند اجرا می‌شود و
//      دیتابیس SQLite در پوشه‌ی داده‌ی برنامه ذخیره می‌شود — کاملاً آفلاین.
//   ۲) حالت ریموت: اگر متغیر LISTIA_REMOTE_URL ست شده باشد، مستقیم همان
//      آدرس (مثلاً نسخه‌ی چابکان) باز می‌شود و سرور داخلی اجرا نمی‌شود.
const {
  app,
  BrowserWindow,
  dialog,
  Menu,
  shell,
} = require("electron");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const PORT = parseInt(process.env.LISTIA_PORT || "34567", 10);
const REMOTE_URL = (process.env.LISTIA_REMOTE_URL || "").trim();

let win = null;
let serverProcess = null;
let quitting = false;

// ─── سرور داخلی ─────────────────────────────────────────────────────────────
function startLocalServer() {
  const serverEntry = path.join(__dirname, "server-app", "index.js");
  if (!fs.existsSync(serverEntry)) {
    dialog.showErrorBox(
      "لیستیا",
      "فایل‌های سرور آماده نیست. ابتدا در پوشه‌ی desktop دستور «npm run prepare:server» را اجرا کنید."
    );
    app.quit();
    return;
  }

  // دیتابیس در پوشه‌ی داده‌ی کاربر (در ویندوز: %APPDATA%/لیستیا)
  const dbPath =
    process.env.LISTIA_DB || path.join(app.getPath("userData"), "data", "listia.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  serverProcess = fork(serverEntry, [], {
    env: {
      ...process.env,
      PORT: String(PORT),
      LISTIA_DB: dbPath,
      NODE_ENV: "production",
      // پرچم‌های اختصاصی دسکتاپ
      DEV_MODE_CODES: process.env.DEV_MODE_CODES || "0",
    },
    execArgv: ["--no-warnings"],
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (chunk) => console.log(`[api] ${chunk}`));
  serverProcess.stderr.on("data", (chunk) => console.error(`[api] ${chunk}`));
  serverProcess.on("exit", (code) => {
    serverProcess = null;
    if (!quitting) {
      dialog.showErrorBox(
        "خطای سرور داخلی لیستیا",
        `سرور داخلی بسته شد (کد ${code}).\n\n` +
          "اگر خطای «node:sqlite» دیدید، نسخه‌ی Electron را به آخرین نسخه به‌روز کنید یا از حالت ریموت استفاده کنید."
      );
      app.quit();
    }
  });
}

function waitForServer(retries = 60) {
  return new Promise((resolve) => {
    const attempt = (left) => {
      const req = http.get(`http://127.0.0.1:${PORT}/healthz`, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => {
        if (left <= 0) resolve(false);
        else setTimeout(() => attempt(left - 1), 300);
      });
    };
    attempt(retries);
  });
}

// ─── پنجره ──────────────────────────────────────────────────────────────────
async function createWindow() {
  win = new BrowserWindow({
    width: 1300,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#05070f",
    title: "لیستیا",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  // لینک‌های بیرونی در مرورگر سیستم باز شوند
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  if (REMOTE_URL) {
    await win.loadURL(REMOTE_URL);
    return;
  }

  const ready = await waitForServer();
  if (!ready) {
    dialog.showErrorBox("لیستیا", "سرور داخلی بالا نیامد. لاگ را در کنسول ببینید.");
    app.quit();
    return;
  }
  await win.loadURL(`http://127.0.0.1:${PORT}`);
}

// ─── چرخه‌ی عمر ─────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    if (!REMOTE_URL) startLocalServer();
    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    quitting = true;
    if (serverProcess) serverProcess.kill();
  });
}

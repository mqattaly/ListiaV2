import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AppProvider } from "./context/AppContext.jsx";
import "./styles/index.css";

// کمک‌ابزار تست «ناحیه‌ی امن» برای مرورگرهایی که env() نمی‌دهند:
//   ?safetest=1        → مقادیر معمولِ یک گوشی اندروید (بالا ۴۷ / پایین ۲۴)
//   ?safetest=44,30    → مقدار دلخواه (بالا، پایین)
// در حالت نصب‌شده (PWA/اپ اندروید) خودِ سیستم محیط امن را می‌دهد و این لازم نیست.
const safeTest = new URLSearchParams(window.location.search).get("safetest");
if (safeTest !== null) {
  const [top, bottom] =
    safeTest === "" || safeTest === "1" ? ["47", "24"] : safeTest.split(",");
  const root = document.documentElement.style;
  if (Number(top)) root.setProperty("--safe-top", `${Number(top)}px`);
  if (Number(bottom)) root.setProperty("--safe-bottom", `${Number(bottom)}px`);
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// ثبت سرویس‌ورکر برای وب‌اپ (iOS/اندروید) — فقط در نسخه‌ی ساخته‌شده
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ثبت نشد — اپ همچنان آنلاین کار می‌کند */
    });
  });
}

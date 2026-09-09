/* سرویس‌ورکر لیستیا — وب‌اپ iOS/اندروید
   پوسته‌ی اپ کش می‌شود تا آفلاین باز شود؛ APIها همیشه زنده‌اند. */
const CACHE = "listia-shell-v2.1.0";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.png", "/logo-192.png", "/logo-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // فقط همان‌مبدأ؛ API و healthz هیچ‌وقت کش نمی‌شوند
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname === "/healthz" || url.pathname.startsWith("/sw.js")) {
    return;
  }

  // ناوبری صفحه: شبکه اول، در آفلاین → پوسته‌ی کش‌شده
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy)).catch(() => null);
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached ?? Response.error()))
    );
    return;
  }

  // فایل‌های استاتیک (js/css/فونت/آیکون): کش اول، شبکه پشتیبان
  if (request.method === "GET") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // در پس‌زمینه به‌روزرسانی کن
          fetch(request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE).then((cache) => cache.put(request, response)).catch(() => null);
              }
            })
            .catch(() => null);
          return cached;
        }
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => null);
            }
            return response;
          })
          .catch(() => cached ?? Response.error());
      })
    );
  }
});

# ─── لیستیا — ایمیج پروداکشن برای چابکان (یا هر هاست داکری) ────────────────
# مرحله ۱: ساخت فرانت‌اند (React/Vite)
FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --no-audit --no-fund
COPY client client
RUN npm run build -w client

# مرحله ۲: فقط وابستگی‌های اجرا (بدون ابزارهای توسعه)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev --no-audit --no-fund

# مرحله ۳: ایمیج نهایی
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY server ./server
COPY tools ./tools
COPY --from=web /app/client/dist ./client/dist
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# اگر LISTIA_DB روی دیسک مانا ست شده باشد، پوشه‌اش ساخته می‌شود
CMD ["sh", "-c", "mkdir -p \"$(dirname \"$LISTIA_DB\")\" 2>/dev/null; exec node --no-warnings server/index.js"]

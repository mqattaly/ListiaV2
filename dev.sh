#!/usr/bin/env bash
# اجرای توسعه‌ی لیستیا — با ترمیم خودکار
#
# محیطِ پیش‌نمایش بین ری‌استارت‌ها node_modules و دیتابیسِ محلی را نگه
# نمی‌دارد؛ این اسکریپت قبل از بالا آمدن، وابستگی‌ها و داده‌ی نمونه را
# در صورت نبود از نو می‌سازد تا پیش‌نمایش همیشه سالم باشد.
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules/express ] || [ ! -d node_modules/vite ]; then
  echo "📦 نصب وابستگی‌ها…"
  npm install --no-audit --no-fund
fi

if [ ! -f server/data/listia.db ]; then
  echo "🌱 ساخت دیتابیس و داده‌ی نمونه…"
  node --no-warnings server/seed.js
fi

echo "🚀 اجرای لیستیا (API:3001 · Web:5173)"
exec npm run dev

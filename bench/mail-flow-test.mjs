// تست جریان کامل: ثبت‌نام → ایمیل کد (قالب جدید) → تأیید → ایمیل خوش‌آمد
import fs from "node:fs";

const BASE = "http://127.0.0.1:3002";
const EMAIL = "flowtest@example.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function lastMessage() {
  return fs.readFileSync("/tmp/smtp-tls-messages.txt", "utf8").split("\n=====\n").filter(Boolean).pop();
}
function extractText(raw) {
  const blocks = raw.split(/Content-Type: text\/plain; charset=utf-8\s*\r?\nContent-Transfer-Encoding: base64\s*\r?\n/);
  if (blocks.length < 2) return null;
  const b64 = blocks[1].split("\r\n----")[0].replace(/\s+/g, "");
  return Buffer.from(b64, "base64").toString("utf8");
}
const faToEn = (s) => s.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));

console.log("۱) ثبت‌نام …");
const r1 = await fetch(BASE + "/api/auth/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    username: "flowtest", password: "Bench123456", first_name: "سارا",
    last_name: "احمدی", phone: "09127778899", email: EMAIL,
  }),
});
const j1 = await r1.json();
console.log("   پاسخ:", r1.status, j1.message, "| dev_code:", j1.dev_code);
if (!r1.ok) process.exit(1);

await sleep(600);
const mail1 = lastMessage();
if (!mail1) { console.log("✗ ایمیل کد دریافت نشد"); process.exit(1); }
const text1 = extractText(mail1);
const code = faToEn((text1.match(/[۰-۹]{6}/) || [])[0] || "");
console.log("۲) ایمیل کد دریافت شد. کد استخراج‌شده:", code || "؟");
if (!/^\d{6}$/.test(code)) { console.log("متن ایمیل:\n", text1); process.exit(1); }
console.log("   موضوع:", mail1.match(/Subject: [^\r\n]*/)?.[0].slice(0, 80));
console.log("   از:", mail1.match(/From: [^\r\n]*/)?.[0]);

console.log("۳) تأیید ایمیل …");
const r2 = await fetch(BASE + "/api/auth/verify-email", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, code }),
});
const j2 = await r2.json();
console.log("   پاسخ:", r2.status, j2.message, "| توکن:", j2.session_token ? "✓" : "✗");
if (!r2.ok) process.exit(1);

await sleep(600);
const mails = fs.readFileSync("/tmp/smtp-tls-messages.txt", "utf8").split("\n=====\n").filter(Boolean);
const mail2 = mails[mails.length - 1];
const text2 = extractText(mail2);
console.log("۴) ایمیل خوش‌آمد:", mail2.match(/Subject: [^\r\n]*=\?utf-8\?B\?([^\r\n]+)/i) ? "(موضوع کدگذاری‌شده‌ی UTF-8 ✓)" : mail2.match(/Subject: [^\r\n]*/)?.[0]);
for (const must of ["به لیستیا خوش آمدید", "آزمایشی", "99,000", "499,000", "899,000", "1,899,000", "info@listia.ir"]) {
  console.log(`   شامل «${must}»:`, text2.includes(must) ? "✓" : "✗");
}
console.log("\n--- متن خوش‌آمد (نمونه) ---\n" + text2.slice(0, 700));

// بررسی هدر List-Unsubscribe در ایمیل خوش‌آمد
console.log("\nList-Unsubscribe در ایمیل خوش‌آمد:", /List-Unsubscribe:/i.test(mail2) ? "✓" : "✗");
console.log("List-Unsubscribe در ایمیل کد (نباید باشد):", /List-Unsubscribe:/i.test(mail1) ? "هست ✗" : "ندارد ✓");
process.exit(0);

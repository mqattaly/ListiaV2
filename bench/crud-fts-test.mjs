// تست رگرسیون: درج/ویرایش/حذف محصول باید ایندکس FTS را درست به‌روزرسانی کند
const BASE = process.env.BENCH_BASE || "http://127.0.0.1:3001";

const lr = await fetch(BASE + "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "user0001", password: "bench123456" }),
});
const lj = await lr.json();
const T = lj.session_token;
console.log("login:", lr.status, "token:", T ? "✓" : "✗");
const H = () => ({ "content-type": "application/json", authorization: "Bearer " + T });

let r = await fetch(BASE + "/api/suppliers", { method: "POST", headers: H(), body: JSON.stringify({ name: "تأمین‌کننده رگرسیون FTS 9727" }) }).then((x) => x.json());
const sid = r.id ?? r.supplier?.id;
console.log("supplier id:", sid);

r = await fetch(BASE + "/api/products", { method: "POST", headers: H(), body: JSON.stringify({
  supplier_id: sid, product_name: "شیر پرچرب رگرسیون", quantity: "10", unit: "عدد",
}) }).then((x) => x.json());
const pid = r.id ?? r.product?.id;
console.log("product id:", pid);

async function search(q) {
  const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}`, { headers: { authorization: "Bearer " + T } });
  const j = await res.json();
  return j.results?.filter((x) => x.product_name?.includes("رگرسیون")).length;
}
console.log("جستجوی «شیر پرچرب» پس از درج (باید ۱):", await search("شیر پرچرب"));

await fetch(`${BASE}/api/products/${pid}/edit`, { method: "POST", headers: H(), body: JSON.stringify({
  supplier_id: sid, product_name: "ماست پرچرب رگرسیون", quantity: "10", unit: "عدد",
}) });
console.log("جستجوی نام قدیمی «شیر پرچرب» پس از ویرایش (باید ۰):", await search("شیر پرچرب"));
console.log("جستجوی نام جدید «ماست پرچرب» پس از ویرایش (باید ۱):", await search("ماست پرچرب"));

const del = await fetch(`${BASE}/api/products/${pid}/delete`, { method: "POST", headers: { authorization: "Bearer " + T } });
console.log("delete status:", del.status);
console.log("جستجوی «ماست پرچرب» پس از حذف (باید ۰):", await search("ماست پرچرب"));

// حذف تأمین‌کننده (آبشاری روی محصولات)
await fetch(`${BASE}/api/suppliers/${sid}/delete`, { method: "POST", headers: { authorization: "Bearer " + T } });
console.log("✅ تست رگرسیون FTS تمام شد");

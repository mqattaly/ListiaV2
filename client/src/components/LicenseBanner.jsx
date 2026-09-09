// بنر ارتقای لایسنس
import React from "react";
import { Link } from "react-router-dom";
import { Gem, ArrowLeft } from "lucide-react";
import { useApp } from "../context/AppContext.jsx";

export default function LicenseBanner({ message }) {
  const { limits } = useApp();
  const text =
    message ??
    (limits?.is_expired
      ? "مدت لایسنس شما به پایان رسیده است. برای ادامه‌ی ثبت اطلاعات، لایسنس خود را تمدید کنید."
      : `در نسخه‌ی آزمایشی سقف ${limits?.max_suppliers ?? 1} تأمین‌کننده و ${limits?.max_products ?? 5} محصول دارید (${limits?.supplier_count ?? 0} تأمین‌کننده و ${limits?.product_count ?? 0} محصول ثبت شده). با تهیه‌ی لایسنس، بدون محدودیت ثبت کنید.`);
  return (
    <div className="license-banner">
      <span className="lb-icon">
        <Gem size={20} />
      </span>
      <p>{text}</p>
      <Link to="/account" className="btn btn-primary btn-sm">
        فعال‌سازی لایسنس <ArrowLeft size={14} />
      </Link>
    </div>
  );
}

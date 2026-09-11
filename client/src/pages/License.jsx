// صفحه‌ی لایسنس — فقط اطلاعات لایسنس و خرید/فعال‌سازی (بدون اطلاعات شخصی حساب)
import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Crown,
  Gem,
  KeyRound,
  Copy,
  BadgeCheck,
  CalendarClock,
  Infinity as InfinityIcon,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import { BtnSpinner } from "../components/bits.jsx";
import LicensePlans from "../components/LicensePlans.jsx";

const faNum = (n) => String(n ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

export default function License() {
  const { limits, refresh, toast } = useApp();
  const [licenseKey, setLicenseKey] = useState("");
  const [busy, setBusy] = useState(false);

  if (!limits) {
    return (
      <div className="page">
        <h2 className="page-title">لایسنس</h2>
        <div className="card" style={{ minHeight: 180 }} />
      </div>
    );
  }

  const licensed = limits.is_licensed;
  const lifetime = limits.is_lifetime;
  const expired = limits.is_expired;
  const totalDays = limits.period_days ?? null;
  const elapsed =
    totalDays && Number.isFinite(Number(limits.remaining_days))
      ? Math.min(100, Math.max(4, ((totalDays - limits.remaining_days) / totalDays) * 100))
      : null;

  const activate = async (e) => {
    e.preventDefault();
    const key = licenseKey.trim();
    if (!key) return;
    setBusy(true);
    try {
      const res = await api.post("/api/account/license", { license_key: key });
      toast(res.message || "لایسنس فعال شد 🎉", "success", 6000);
      setLicenseKey("");
      await refresh();
    } catch (err) {
      toast(err.message, "error", 7000);
    } finally {
      setBusy(false);
    }
  };

  const copy = (text, label = "کپی شد") => {
    navigator.clipboard?.writeText(text).catch(() => {});
    toast(label, "info", 1500);
  };

  return (
    <div className="page license-page">
      <h2 className="page-title">
        <Crown size={22} style={{ verticalAlign: -4, marginLeft: 6 }} />
        لایسنس لیستیا
      </h2>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
        className={`lic-hero ${licensed ? "lic-active" : expired ? "lic-expired" : "lic-free"}`}
      >
        <div className="lic-glow" aria-hidden="true" />
        <div className="lic-hero-head">
          <span className="lic-hero-icon">
            {licensed ? <Crown size={30} /> : expired ? <AlertTriangle size={28} /> : <Gem size={28} />}
          </span>
          <div>
            <div className="lic-status">
              {licensed ? "لایسنس فعال" : expired ? "لایسنس منقضی شده" : "نسخه‌ی آزمایشی (دمو)"}
            </div>
            <div className="lic-type">
              {licensed
                ? lifetime
                  ? "اشتراک مادام‌العمر"
                  : `اشتراک ${limits.license_type === "UNLIMITED" ? "نامحدود" : "پرو"}`
                : "برای دسترسی کامل، لایسنس تهیه کنید"}
            </div>
          </div>
          {licensed && (
            <span className="lic-badge-ok">
              <BadgeCheck size={15} /> فعال
            </span>
          )}
        </div>

        {licensed && (
          <div className="lic-meta">
            {lifetime ? (
              <div className="lic-meta-row">
                <InfinityIcon size={17} />
                <span>اعتبار شما <b>مادام‌العمر</b> است؛ بدون نیاز به تمدید.</span>
              </div>
            ) : (
              <>
                <div className="lic-meta-row">
                  <CalendarClock size={17} />
                  <span>
                    {expired ? "تاریخ انقضا:" : "تا تاریخ:"}{" "}
                    <b>{limits.expires_at_label || "—"}</b>
                    {!expired && Number.isFinite(Number(limits.remaining_days)) && (
                      <>
                        {" · "}
                        <b className={limits.remaining_days <= 7 ? "lic-warn" : ""}>
                          {faNum(limits.remaining_days)} روز باقی‌مانده
                        </b>
                      </>
                    )}
                  </span>
                </div>
                {elapsed !== null && (
                  <div className="lic-progress">
                    <span style={{ width: `${elapsed}%` }} />
                  </div>
                )}
              </>
            )}
            {limits.licensed_at_label && (
              <div className="lic-meta-row lic-muted">
                <ShieldCheck size={15} />
                <span>تاریخ فعال‌سازی: {limits.licensed_at_label}</span>
              </div>
            )}
          </div>
        )}

        {expired && (
          <p className="lic-expired-note">
            برای ادامه‌ی ثبت خرید و دسترسی به امکانات، یکی از پلن‌های زیر را تمدید کنید.
          </p>
        )}

        {!licensed && !expired && (
          <div className="lic-free-note">
            در نسخه‌ی آزمایشی تا <b>۱ تأمین‌کننده</b> و <b>۵ محصول</b> می‌توانید ثبت کنید.
            با لایسنس: تأمین‌کننده و محصول نامحدود، اشتراک‌گذاری با همکاران، جستجوی قیمت زنده،
            ایمپورت اکسل و کلید API.
          </div>
        )}
      </motion.div>

      {licensed && limits.license_key && (
        <div className="card lic-key-card">
          <div className="section-title">
            <span className="stt-icon"><KeyRound size={16} /></span>
            کلید لایسنس فعال
          </div>
          <div className="token-box" style={{ justifyContent: "space-between" }}>
            <span style={{ wordBreak: "break-all" }}>{limits.license_key}</span>
            <Copy size={14} style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => copy(limits.license_key, "کلید کپی شد")} />
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-title">
          <span className="stt-icon" style={{ background: "var(--accent-grad)", color: "#fff" }}>
            <Gem size={16} />
          </span>
          {licensed ? "تمدید یا ارتقای لایسنس" : "خرید لایسنس"}
        </div>
        <LicensePlans userCode={limits.user_code} />
      </div>

      <div className="card">
        <div className="section-title">
          <span className="stt-icon"><KeyRound size={16} /></span>
          فعال‌سازی با کلید
        </div>
        <p style={{ fontSize: 13, lineHeight: 2, color: "var(--text-2)", margin: "0 0 12px" }}>
          اگر کلید لایسنس را دریافت کرده‌اید، اینجا وارد کنید تا حساب فوراً فعال شود.
        </p>
        <form className="flex gap-8" onSubmit={activate}>
          <input
            className="input mono"
            style={{ direction: "ltr", textAlign: "left", flex: 1 }}
            placeholder="LST-…"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
          />
          <button className="btn btn-primary" disabled={busy || !licenseKey.trim()}>
            {busy ? <BtnSpinner /> : "فعال‌سازی"}
          </button>
        </form>
        <div className="token-box" style={{ justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>شناسه‌ی فعال‌سازی شما (هنگام خرید لازم است):</span>
          <b className="mono">{limits.user_code}</b>
          <Copy size={13} style={{ cursor: "pointer" }} onClick={() => copy(limits.user_code, "شناسه کپی شد")} />
        </div>
      </div>
    </div>
  );
}

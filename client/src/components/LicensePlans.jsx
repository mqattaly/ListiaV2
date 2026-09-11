// جدول تعرفه و راهنمای خرید لایسنس (داده‌ی پلن‌ها از سرور خوانده می‌شود)
import React, { useEffect, useState } from "react";
import { Gem, Copy, BadgeCheck, Infinity as InfinityIcon, CalendarClock, Instagram, Send } from "lucide-react";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";

const faPrice = (n) => new Intl.NumberFormat("fa-IR").format(n);
const faNum = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

const PLAN_HIGHLIGHT = new Set(["365D"]); // پلن پیشنهادی
const PLAN_ORDER = ["30D", "180D", "365D", "LIFE"];

export default function LicensePlans({ userCode, compact = false }) {
  const { toast } = useApp();
  const [plans, setPlans] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .get("/api/auth/plans")
      .then((d) => {
        if (!alive || !d?.plans) return;
        const sorted = [...d.plans].sort(
          (a, b) => PLAN_ORDER.indexOf(a.code) - PLAN_ORDER.indexOf(b.code)
        );
        setPlans(sorted);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!plans) return null;

  const copyCode = () => {
    if (!userCode) return;
    navigator.clipboard?.writeText(userCode).catch(() => {});
    toast("شناسه‌ی فعال‌سازی کپی شد", "info", 1800);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="license-plans">
        {plans.map((p) => {
          const hot = PLAN_HIGHLIGHT.has(p.code);
          return (
            <div key={p.code} className={`lp-card${hot ? " lp-hot" : ""}`}>
              {hot && <span className="lp-tag">⭐ پیشنهاد ویژه</span>}
              <div className="lp-name">
                {p.days === null ? <InfinityIcon size={15} /> : <CalendarClock size={15} />}
                {p.label}
              </div>
              {p.days !== null && <div className="lp-days">{faNum(p.days)} روز</div>}
              <div className="lp-price">
                {faPrice(p.price)} <span className="lp-unit">تومان</span>
              </div>
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="lp-howto">
          <div className="lp-howto-title">
            <Gem size={15} /> نحوه‌ی خرید و فعال‌سازی
          </div>
          <ol>
            <li>
              پلن موردنظر خود را از کارت‌های بالا <b>انتخاب کنید</b>.
            </li>
            <li>
              در اینستاگرام به پیج{" "}
              <a
                href="https://instagram.com/listia.ir"
                target="_blank"
                rel="noreferrer"
                className="lp-insta-handle"
              >
                <Instagram size={14} /> listia.ir
              </a>{" "}
              <b>دایرکت</b> بدهید و <b>شناسه‌ی فعال‌سازی</b> زیر را هم بفرستید تا برای
              خرید و پرداخت راهنمایی‌تان کنیم:
            </li>
          </ol>
          <div className="token-box" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>شناسه‌ی فعال‌سازی شما:</span>
            <b className="mono">{userCode || "—"}</b>
            {userCode && (
              <Copy size={13} style={{ cursor: "pointer" }} onClick={copyCode} />
            )}
          </div>
          <a
            href="https://instagram.com/listia.ir"
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary lp-insta-btn"
          >
            <Send size={15} />
            ارسال دایرکت به <b style={{ marginInlineStart: 4 }}>@listia.ir</b>
          </a>
          <ol start={3} style={{ marginTop: 10 }}>
            <li>پس از پرداخت، کلید لایسنس (با پیشوند <span className="mono">LST-</span>) برایتان ارسال می‌شود.</li>
            <li>کلید را در کادر «فعال‌سازی با کلید» همین صفحه وارد کنید تا حساب نامحدود شود.</li>
          </ol>
          <p className="hint-text" style={{ marginTop: 10 }}>
            <BadgeCheck size={13} /> با لایسنس: تأمین‌کننده و محصول نامحدود، اشتراک‌گذاری با
            همکاران، جستجوی قیمت زنده، ایمپورت اکسل و کلید API میانبر.
          </p>
        </div>
      )}
    </div>
  );
}

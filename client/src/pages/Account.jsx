// حساب کاربری: پروفایل، لایسنس، رمز، کلید API، اشتراک‌گذاری
import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserRound,
  Crown,
  Gem,
  KeyRound,
  Lock,
  Webhook,
  Users,
  Plus,
  Trash2,
  LogOut,
  Copy,
  RefreshCw,
  BadgeCheck,
  Crown as CrownIcon,
} from "lucide-react";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import { fmtAmount } from "../format.js";
import { SkeletonRows } from "../components/bits.jsx";

export default function Account() {
  const { toast, confirm, refresh } = useApp();
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState({ first_name: "", last_name: "", phone: "" });
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [licenseKey, setLicenseKey] = useState("");
  const [shareUsername, setShareUsername] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const d = await api.get("/api/account").catch(() => null);
    if (d) {
      setData(d);
      setProfile({
        first_name: d.user.first_name,
        last_name: d.user.last_name,
        phone: d.user.phone,
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const action = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const res = await fn();
      toast(res?.message || okMsg, "success", 5200);
      await load();
      refresh();
    } catch (err) {
      toast(err.message, "error", 5500);
    } finally {
      setBusy("");
    }
  };

  if (!data) return <SkeletonRows rows={4} height={120} />;

  const { user, limits, counts, api_token, shared_list, shared_with_me } = data;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>
            <UserRound size={21} className="text-gradient" /> حساب کاربری
          </h2>
          <p className="page-sub">مشخصات، لایسنس، کلید API و اشتراک‌گذاری داده با همکاران</p>
        </div>
      </div>

      <div className="account-grid">
        {/* ─── پروفایل ─── */}
        <div className="card">
          <div className="section-title">
            <span className="stt-icon"><UserRound size={17} /></span>
            مشخصات فردی
          </div>
          <form
            style={{ display: "flex", flexDirection: "column", gap: 13 }}
            onSubmit={(e) => {
              e.preventDefault();
              action("profile", () => api.post("/api/account/profile", profile));
            }}
          >
            <div className="field">
              <label>نام و نام خانوادگی</label>
              <div className="flex gap-8">
                <input className="input" value={profile.first_name} onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))} />
                <input className="input" value={profile.last_name} onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))} />
              </div>
            </div>
            <div className="field">
              <label>شماره موبایل</label>
              <input className="input mono" style={{ direction: "ltr", textAlign: "left" }} value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="field">
              <label>نام کاربری (غیرقابل تغییر توسط شما)</label>
              <input className="input" value={user.username} disabled style={{ opacity: 0.6 }} />
            </div>
            <button className="btn btn-primary" disabled={busy === "profile"}>
              {busy === "profile" ? "…" : "ذخیره‌ی مشخصات"}
            </button>
          </form>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 16 }}>
            {[
              { n: counts.supplier_count, l: "تأمین‌کننده" },
              { n: counts.active_count, l: "خرید فعال" },
              { n: counts.archived_count, l: "بایگانی" },
            ].map((s, i) => (
              <div key={i} className="uc-stat" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 10, textAlign: "center" }}>
                <b className="mono" style={{ fontSize: 16 }}>{s.n}</b>
                <span style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700 }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── لایسنس ─── */}
        <div className="card">
          <div className="section-title">
            <span className="stt-icon" style={limits.is_licensed ? { background: "var(--accent-grad)", color: "#fff" } : undefined}>
              {limits.is_licensed ? <Crown size={17} /> : <Gem size={17} />}
            </span>
            لایسنس لیستیا
          </div>

          {limits.is_licensed ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="flex gap-8 wrap">
                <span className="badge badge-success"><BadgeCheck size={13} /> فعال</span>
                <span className="badge">{limits.license_type}</span>
                {limits.is_lifetime ? (
                  <span className="badge badge-accent">مادام‌العمر</span>
                ) : (
                  <span className={`badge ${limits.is_expired ? "badge-danger" : ""}`}>
                    {limits.is_expired ? "منقضی شده" : `${limits.remaining_days} روز مانده`}
                    {limits.expires_at_label ? ` · ${limits.expires_at_label}` : ""}
                  </span>
                )}
              </div>
              <div className="token-box">
                <KeyRound size={14} style={{ flexShrink: 0 }} />
                {limits.license_key || "—"}
              </div>
              <p className="hint-text">
                شناسه‌ی فعال‌سازی شما (برای پشتیبانی): <b className="mono">{limits.user_code}</b>
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 13, lineHeight: 2, color: "var(--text-2)" }}>
                نسخه‌ی آزمایشی: {limits.supplier_count}/{limits.max_suppliers} تأمین‌کننده و{" "}
                {limits.product_count}/{limits.max_products} محصول. برای نامحدود‌شدن، کلید لایسنس را
                وارد کنید.
              </p>
              <div className="token-box" style={{ justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>شناسه‌ی شما:</span>
                <b>{limits.user_code}</b>
                <Copy size={13} style={{ cursor: "pointer" }} onClick={() => { navigator.clipboard?.writeText(limits.user_code); toast("کپی شد", "info", 1600); }} />
              </div>
              <form
                className="flex gap-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  action("license", () => api.post("/api/account/license", { license_key: licenseKey }));
                  setLicenseKey("");
                }}
              >
                <input
                  className="input mono"
                  style={{ direction: "ltr", textAlign: "left" }}
                  placeholder="LST-…"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                />
                <button className="btn btn-primary" disabled={busy === "license" || !licenseKey.trim()}>
                  فعال‌سازی
                </button>
              </form>
            </div>
          )}
        </div>

        {/* ─── تغییر رمز ─── */}
        <div className="card">
          <div className="section-title">
            <span className="stt-icon"><Lock size={17} /></span>
            تغییر رمز عبور
          </div>
          <form
            style={{ display: "flex", flexDirection: "column", gap: 13 }}
            onSubmit={(e) => {
              e.preventDefault();
              action("password", async () => {
                const res = await api.post("/api/account/password", passwords);
                setPasswords({ current_password: "", new_password: "", confirm_password: "" });
                return res;
              });
            }}
          >
            <div className="field">
              <label>رمز فعلی</label>
              <input type="password" className="input" style={{ direction: "ltr" }} value={passwords.current_password} onChange={(e) => setPasswords((p) => ({ ...p, current_password: e.target.value }))} />
            </div>
            <div className="field">
              <label>رمز جدید</label>
              <input type="password" className="input" style={{ direction: "ltr" }} value={passwords.new_password} onChange={(e) => setPasswords((p) => ({ ...p, new_password: e.target.value }))} />
            </div>
            <div className="field">
              <label>تکرار رمز جدید</label>
              <input type="password" className="input" style={{ direction: "ltr" }} value={passwords.confirm_password} onChange={(e) => setPasswords((p) => ({ ...p, confirm_password: e.target.value }))} />
            </div>
            <button className="btn" disabled={busy === "password"}>
              {busy === "password" ? "…" : "تغییر رمز"}
            </button>
          </form>
        </div>

        {/* ─── کلید API ─── */}
        <div className="card">
          <div className="section-title">
            <span className="stt-icon"><Webhook size={17} /></span>
            کلید شخصی (API)
          </div>
          <p style={{ fontSize: 12.5, lineHeight: 2, color: "var(--text-2)", marginBottom: 12 }}>
            با این کلید می‌توانید بدون باز کردن اپ، از میانبرها (مثل Shortcuts آیفون) خرید ثبت کنید:
          </p>
          <div className="token-box">
            <span style={{ flex: 1 }}>{api_token}</span>
            <Copy size={13} style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => { navigator.clipboard?.writeText(api_token); toast("کلید کپی شد", "info", 1800); }} />
          </div>
          <pre className="mono" style={{ fontSize: 11, lineHeight: 1.9, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginTop: 12, overflowX: "auto", direction: "ltr", textAlign: "left", color: "var(--text-2)" }}>{`POST /api/quick-add
X-API-Key: ${api_token}

{ "product": "شیر", "quantity": "2", "unit": "عدد" }`}</pre>
          <button
            className="btn mt-12"
            disabled={busy === "token"}
            onClick={async () => {
              const ok = await confirm({
                title: "ساخت کلید جدید",
                message: "کلید قبلی بی‌اعتبار می‌شود و میانبرهای متصل باید از نو تنظیم شوند.",
                confirmLabel: "بساز",
              });
              if (ok) action("token", () => api.post("/api/account/token"));
            }}
          >
            <RefreshCw size={15} /> ساخت کلید جدید
          </button>
        </div>

        {/* ─── اشتراک‌گذاری ─── */}
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="section-title">
            <span className="stt-icon"><Users size={17} /></span>
            اشتراک‌گذاری داده با همکاران
          </div>
          <div className="account-grid">
            <div>
              <b style={{ fontSize: 13.5 }}>داده‌ی من را با این کاربران به اشتراک گذاشته‌ام</b>
              <form
                className="flex gap-8 mt-12 mb-16"
                onSubmit={(e) => {
                  e.preventDefault();
                  action("share", async () => {
                    const res = await api.post("/api/account/share", { username: shareUsername });
                    setShareUsername("");
                    return res;
                  });
                }}
              >
                <input className="input" placeholder="نام کاربری همکار…" value={shareUsername} onChange={(e) => setShareUsername(e.target.value)} />
                <button className="btn btn-primary" disabled={!shareUsername.trim() || busy === "share"}>
                  <Plus size={15} /> افزودن
                </button>
              </form>
              <AnimatePresence>
                {shared_list.length === 0 ? (
                  <motion.p key="empty" className="hint-text">هنوز با کسی به اشتراک نگذاشته‌اید.</motion.p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {shared_list.map((s) => (
                      <motion.div
                        key={s.share_id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 24 }}
                        className="product-row"
                      >
                        <span className="avatar" style={{ width: 34, height: 34 }}>{s.username.slice(0, 1)}</span>
                        <div style={{ flex: 1 }}>
                          <div className="pr-name" style={{ fontSize: 13.5 }}>{s.full_name}</div>
                          <div className="pr-desc">@{s.username} · از {s.created_at_label}</div>
                        </div>
                        <button
                          className="btn btn-sm btn-ghost"
                          style={{ color: "var(--danger)" }}
                          onClick={() =>
                            action("unshare", () => api.post(`/api/account/share/${s.share_id}/delete`))
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </div>
            <div>
              <b style={{ fontSize: 13.5 }}>داده‌های اشتراکی که به من نشان داده می‌شود</b>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {shared_with_me.length === 0 ? (
                  <p className="hint-text">اشتراکی از کسی ندارید.</p>
                ) : (
                  shared_with_me.map((s) => (
                    <motion.div key={s.user_id} layout className="product-row">
                      <span className="avatar" style={{ width: 34, height: 34, background: "linear-gradient(135deg,#22d3ee,#34d399)" }}>
                        {s.username.slice(0, 1)}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div className="pr-name" style={{ fontSize: 13.5 }}>{s.full_name}</div>
                        <div className="pr-desc">@{s.username}</div>
                      </div>
                      <button
                        className="btn btn-sm"
                        onClick={() => action("leave", () => api.post(`/api/account/share/leave/${s.user_id}`))}
                      >
                        <LogOut size={14} /> خروج
                      </button>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

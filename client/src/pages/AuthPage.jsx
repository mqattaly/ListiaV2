// صفحه‌ی ورود / ثبت‌نام / تأیید ایمیل — با انیمیشن‌های کامل
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShoppingBasket,
  LogIn,
  UserPlus,
  ShieldCheck,
  ArrowRight,
  MailCheck,
  Sparkles,
  BarChart3,
  Users,
  Wallet,
} from "lucide-react";
import { api, getSessionToken, saveSessionToken } from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import { APP_VERSION } from "../format.js";

const MODES = { login: 0, signup: 1, verify: 2 };

export default function AuthPage() {
  const { applyAuth, toast, refresh } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    // نشستِ ذخیره‌شده از قبل (توکن) → دوباره بررسی کن؛ کاربرِ واردشده
    // نباید در صفحه‌ی ورود بماند.
    if (getSessionToken()) refresh();
  }, [refresh]);
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    username: "",
    password: "",
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "login") {
        const data = await api.post("/api/auth/login", {
          username: form.username,
          password: form.password,
        });
        if (data.need_verification) {
          setMode("verify");
          setNotice(data.message);
          return;
        }
        applyAuth(data);
        // ── راستی‌آزمایی نشست قبل از ورود ──
        // اگر توکن/کوکی در این مرورگر کار نکند (مثلاً صفحه‌ی قدیمیِ کش‌شده
        // در حال اجراست)، همین‌جا مشخص می‌شود و پیام روشن می‌دهیم؛ نه اینکه
        // کاربر وارد صفحه‌ای شود که هیچ درخواستی‌اش قبول نمی‌شود.
        const me = await api.get("/api/auth/me").catch(() => null);
        if (!me?.user) {
          saveSessionToken(null);
          setError(
            "ورود در سرور انجام شد ولی نشست در این صفحه برقرار نشد. صفحه احتمالاً نسخه‌ی قدیمیِ کش‌شده را اجرا می‌کند — لطفاً یک‌بار با Ctrl+Shift+R (یا Cmd+Shift+R) کامل رفرش کنید و دوباره وارد شوید."
          );
          toast("نشست برقرار نشد — رفرش کامل صفحه لازم است", "error", 7000);
          return;
        }
        toast(`${data.message} ${data.user?.full_name ?? ""}`, "success");
        navigate("/", { replace: true });
      } else if (mode === "signup") {
        const data = await api.post("/api/auth/signup", form);
        if (data.need_verification) {
          setMode("verify");
          setNotice(data.message);
          if (data.dev_code) setDevCode(data.dev_code);
          return;
        }
        applyAuth(data);
        toast("خوش آمدید 👋", "success");
        navigate("/", { replace: true });
      }
    } catch (err) {
      const data = err.data ?? {};
      if (data.need_verification) {
        setMode("verify");
        setForm((f) => ({ ...f, email: data.email || f.email }));
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="aurora-bg" aria-hidden="true">
        <div className="aurora-blob b1" />
        <div className="aurora-blob b2" />
        <div className="aurora-blob b3" />
      </div>
      <div className="auth-wrap">
        <AuthHero />
        <div className="auth-form-col">
          <motion.div
            className="auth-card"
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.1 }}
          >
            <div className="auth-logo-row">
              <motion.span
                className="brand-logo"
                whileHover={{ rotate: -8, scale: 1.08 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <ShoppingBasket size={26} strokeWidth={2.2} />
              </motion.span>
              <div>
                <h3>لیستیا</h3>
                <div className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
                  مدیریت هوشمند خرید و تأمین‌کننده‌ها
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: mode === "login" ? -22 : 22 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: mode === "login" ? 22 : -22 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {mode === "verify" ? (
                  <VerifyPanel
                    form={form}
                    setForm={setForm}
                    notice={notice}
                    setNotice={setNotice}
                    setError={setError}
                    devCode={devCode}
                    setDevCode={setDevCode}
                    onDone={(data) => {
                      applyAuth(data);
                      toast("خوش آمدید 👋", "success");
                      navigate("/", { replace: true });
                    }}
                  />
                ) : (
                  <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                    <h3>{mode === "login" ? "ورود به حساب" : "ساخت حساب جدید"}</h3>
                    <p className="auth-sub">
                      {mode === "login"
                        ? "برای مدیریت لیست خرید و تأمین‌کننده‌هایتان وارد شوید."
                        : "در کمتر از یک دقیقه حساب بسازید و شروع کنید."}
                    </p>

                    {error && (
                      <motion.div
                        className="auth-alert err"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {error}
                      </motion.div>
                    )}
                    {notice && <div className="auth-alert ok">{notice}</div>}

                    {mode === "signup" && (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div className="field">
                            <label>نام</label>
                            <input className="input" value={form.first_name} onChange={set("first_name")} placeholder="نام" />
                          </div>
                          <div className="field">
                            <label>نام خانوادگی</label>
                            <input className="input" value={form.last_name} onChange={set("last_name")} placeholder="نام خانوادگی" />
                          </div>
                        </div>
                        <div className="field">
                          <label>شماره موبایل</label>
                          <input
                            className="input mono"
                            value={form.phone}
                            onChange={set("phone")}
                            placeholder="09123456789"
                            style={{ direction: "ltr", textAlign: "left" }}
                          />
                        </div>
                        <div className="field">
                          <label>ایمیل</label>
                          <input
                            className="input"
                            type="email"
                            value={form.email}
                            onChange={set("email")}
                            placeholder="you@example.com"
                            style={{ direction: "ltr", textAlign: "left" }}
                          />
                        </div>
                      </>
                    )}

                    <div className="field">
                      <label>نام کاربری</label>
                      <input
                        className="input"
                        value={form.username}
                        onChange={set("username")}
                        placeholder="username"
                        style={{ direction: "ltr", textAlign: "left" }}
                        autoComplete="username"
                      />
                    </div>
                    <div className="field">
                      <label>رمز عبور</label>
                      <input
                        className="input"
                        type="password"
                        value={form.password}
                        onChange={set("password")}
                        placeholder="••••••••"
                        style={{ direction: "ltr", textAlign: "left" }}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                      />
                      {mode === "signup" && (
                        <span className="hint-text">
                          حداقل ۹ کاراکتر؛ شامل حرف کوچک، بزرگ و عدد
                        </span>
                      )}
                    </div>

                    <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
                      {busy
                        ? "لطفاً صبر کنید…"
                        : mode === "login"
                          ? <>
                              <LogIn size={18} /> ورود
                            </>
                          : <>
                              <UserPlus size={18} /> ساخت حساب
                            </>}
                    </button>

                    <div className="auth-switch">
                      {mode === "login" ? (
                        <>
                          حساب ندارید؟{" "}
                          <button type="button" onClick={() => { setMode("signup"); setError(""); }}>
                            ثبت‌نام کنید
                          </button>
                        </>
                      ) : (
                        <>
                          قبلاً ثبت‌نام کرده‌اید؟{" "}
                          <button type="button" onClick={() => { setMode("login"); setError(""); }}>
                            وارد شوید
                          </button>
                        </>
                      )}
                    </div>
                  </form>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
          <div
            style={{
              textAlign: "center",
              marginTop: 18,
              fontSize: 10.5,
              color: "var(--text-3)",
              fontWeight: 700,
              direction: "ltr",
            }}
          >
            Listia v{APP_VERSION}
          </div>
        </div>
      </div>
    </>
  );
}

function AuthHero() {
  const features = [
    { icon: BarChart3, text: "داشبورد زنده از وضعیت خریدها" },
    { icon: Users, text: "مدیریت تأمین‌کننده‌ها و همکاران" },
    { icon: Wallet, text: "برآورد قیمت و سقف بودجه هوشمند" },
  ];
  return (
    <div className="auth-hero">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
      >
        <span className="badge badge-accent" style={{ marginBottom: 18, display: "inline-flex" }}>
          <Sparkles size={13} /> نسخه‌ی ۲.۰ — بازطراحی کامل
        </span>
        <h2>
          لیست خریدِتان، <span className="text-gradient">مرتب و زنده</span>
          <br />
          مثل ذهنِ شماست.
        </h2>
        <p>
          لیستیا لیست خرید، تأمین‌کننده‌ها، بایگانی سفارش‌ها و برآورد هزینه‌ی شما را یک‌جا
          جمع می‌کند — با اشتراک‌گذاری با همکاران و دسترسی از هرجا.
        </p>
        <div className="hero-badges">
          {features.map((f, i) => (
            <motion.span
              key={i}
              className="badge"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.12 }}
              style={{ padding: "8px 14px", fontSize: 12.5 }}
            >
              <f.icon size={14} style={{ color: "#a5b4fc" }} />
              {f.text}
            </motion.span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function VerifyPanel({ form, setForm, notice, onDone, devCode, setDevCode, setError, setNotice }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [changeEmail, setChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const refs = useRef([]);

  useEffect(() => {
    setTimeout(() => refs.current[0]?.focus(), 400);
  }, []);

  const setDigit = (i) => (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(-1);
    setDigits((d) => {
      const next = [...d];
      next[i] = value;
      return next;
    });
    if (value && i < 5) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i) => (e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const onPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    setDigits(text.padEnd(6, "").split("").slice(0, 6));
    refs.current[Math.min(text.length, 5)]?.focus();
  };

  const verify = async (e) => {
    e?.preventDefault();
    const code = digits.join("");
    if (code.length !== 6) {
      setError("کد ۶ رقمی را کامل وارد کنید.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const data = await api.post("/api/auth/verify-email", { code, email: form.email });
      onDone(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError("");
    try {
      const data = await api.post("/api/auth/resend-verification", { email: form.email });
      setNotice(data.message);
      setDevCode(data.dev_code || "");
    } catch (err) {
      setError(err.message);
    }
  };

  const changeEmailAddress = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const data = await api.post("/api/auth/change-verification-email", {
        current_email: form.email,
        new_email: newEmail,
      });
      setForm((f) => ({ ...f, email: data.email }));
      setChangeEmail(false);
      setNotice(data.message);
      setDevCode(data.dev_code || "");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h3>تأیید ایمیل</h3>
      <p className="auth-sub">
        کد ۶ رقمی ارسال‌شده به <b style={{ direction: "ltr", unicodeBidi: "embed" }}>{form.email}</b> را
        وارد کنید.
      </p>
      {notice && <div className="auth-alert ok">{notice}</div>}
      {devCode && (
        <div className="auth-alert info">
          حالت توسعه (SMTP تنظیم نیست) — کد شما:{" "}
          <b className="mono" style={{ fontSize: 15 }}>{devCode}</b>
        </div>
      )}
      <form onSubmit={verify}>
        <div className="otp-row" onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              value={d}
              onChange={setDigit(i)}
              onKeyDown={onKeyDown(i)}
              inputMode="numeric"
              maxLength={1}
            />
          ))}
        </div>
        <button type="submit" className="btn btn-primary btn-lg full" disabled={busy} style={{ marginTop: 16 }}>
          {busy ? "در حال بررسی…" : <><MailCheck size={18} /> تأیید و ورود</>}
        </button>
      </form>
      <div className="auth-switch">
        کد نرسید؟ <button onClick={resend}>ارسال مجدد</button>
        {" · "}
        <button onClick={() => setChangeEmail((v) => !v)}>تغییر ایمیل</button>
      </div>
      <AnimatePresence>
        {changeEmail && (
          <motion.form
            onSubmit={changeEmailAddress}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", display: "flex", gap: 8 }}
          >
            <input
              className="input"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="ایمیل جدید"
              style={{ direction: "ltr" }}
            />
            <button className="btn" type="submit">
              <ArrowRight size={16} /> ثبت
            </button>
          </motion.form>
        )}
      </AnimatePresence>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-3)", fontSize: 11.5, fontWeight: 600 }}>
        <ShieldCheck size={14} /> اطلاعات شما محرمانه می‌ماند و فقط برای تأیید حساب استفاده می‌شود.
      </div>
    </div>
  );
}

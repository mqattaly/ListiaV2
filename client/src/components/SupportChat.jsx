// دستیار پشتیبانی هوشمند لیستیا (چت‌بات چابکان) — حباب شناور + پنل گفتگو
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Headset,
  X,
  Send,
  Sparkles,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Instagram,
  Mail,
} from "lucide-react";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";

const SUGGESTIONS = [
  "قیمت پلن‌های لایسنس چقدر است؟",
  "لایسنس را چطور بخرم و فعال کنم؟",
  "کد تأیید ایمیل نیامده؛ چه کنم؟",
  "چطور از فایل اکسل محصول وارد کنم؟",
  "جستجوی قیمت زنده چطور کار می‌کند؟",
  "تفاوت نسخه آزمایشی و لایسنس چیست؟",
];

const WELCOME =
  "سلام! 👋 من «لیا»، دستیار پشتیبانی لیستیا هستم.\n" +
  "می‌توانید درباره‌ی کار با برنامه، لایسنس و خرید، تأیید ایمیل، ایمپورت اکسل، جستجوی قیمت و… بپرسید.\n" +
  "یکی از پرسش‌های پرتکرار زیر را انتخاب کنید یا سؤالتان را بنویسید:";

// رندرر بسیار سبک Markdown: فقط بولد، خطوط و فهرست ساده
function FormattedText({ text }) {
  const lines = String(text).split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
        const isHeading = /^#{1,4}\s/.test(line);
        const bullet = /^\s*(?:[-*•]|\d+[.)])\s+/.test(line);
        const content = line.replace(/^#{1,4}\s*/, "").replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "");
        if (!content.trim()) return <div key={i} style={{ height: 6 }} />;
        return (
          <div
            key={i}
            style={{
              fontWeight: isHeading ? 800 : 400,
              fontSize: isHeading ? 13.5 : undefined,
              marginBottom: 3,
              paddingInlineStart: bullet ? 14 : 0,
              position: "relative",
            }}
          >
            {bullet && <span style={{ position: "absolute", insetInlineStart: 0 }}>•</span>}
            {parts.map((p, j) =>
              p.startsWith("**") && p.endsWith("**") ? (
                <b key={j}>{p.slice(2, -2)}</b>
              ) : (
                <React.Fragment key={j}>{p}</React.Fragment>
              )
            )}
          </div>
        );
      })}
    </>
  );
}

export default function SupportChat() {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(null); // null = هنوز چک نشده
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shownText, setShownText] = useState(""); // متن در حال تایپ تدریجی
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const typeTimer = useRef(null);
  const lastQuestion = useRef("");

  const storageKey = useMemo(() => `listia-support-${user?.id ?? "guest"}`, [user?.id]);

  // بارگذاری گفتگوی ذخیره‌شده
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) {
          setMessages(saved);
          return;
        }
      }
    } catch {
      /* خراب بودن کش — نادیده */
    }
    setMessages([{ id: "welcome", role: "bot", text: WELCOME }]);
  }, [storageKey]);

  useEffect(() => {
    if (messages.length) localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40)));
  }, [messages, storageKey]);

  // وضعیت فعال‌بودن ربات را هنگام اولین باز شدن پنل بپرس
  useEffect(() => {
    if (!open || enabled !== null) return;
    api
      .get("/api/support/status")
      .then((d) => setEnabled(Boolean(d.enabled)))
      .catch(() => setEnabled(false));
  }, [open, enabled]);

  // اسکرول خودکار به پایین
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, shownText, busy, open]);

  useEffect(() => () => clearInterval(typeTimer.current), []);

  const typeOut = (fullText, onDone) => {
    setShownText("");
    let i = 0;
    const step = Math.max(2, Math.round(fullText.length / 140)); // حدود ۱ تا ۲ ثانیه
    clearInterval(typeTimer.current);
    typeTimer.current = setInterval(() => {
      i += step;
      if (i >= fullText.length) {
        clearInterval(typeTimer.current);
        setShownText("");
        onDone();
      } else {
        setShownText(fullText.slice(0, i));
      }
    }, 16);
  };

  const ask = async (question) => {
    const q = String(question ?? input).trim();
    if (!q || busy) return;
    setError("");
    lastQuestion.current = q;
    setInput("");
    const userMsg = { id: `u${Date.now()}`, role: "user", text: q };
    const history = messages
      .filter((m) => m.id !== "welcome")
      .slice(-12)
      .map((m) => ({ role: m.role === "bot" ? "assistant" : "user", content: m.text }));
    setMessages((m) => [...m, userMsg]);
    setBusy(true);
    try {
      const data = await api.post("/api/support/chat", { message: q, history });
      const reply = data.reply;
      typeOut(reply, () =>
        setMessages((m) => [...m, { id: `b${Date.now()}`, role: "bot", text: reply }])
      );
    } catch (err) {
      setError(err.message || "خطایی رخ داد.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const retry = () => ask(lastQuestion.current);

  const clearChat = () => {
    setMessages([{ id: "welcome", role: "bot", text: WELCOME }]);
    setError("");
    setShownText("");
    clearInterval(typeTimer.current);
  };

  const typingOrBusy = busy || shownText;

  return (
    <>
      {/* ─── حباب شناور ─── */}
      <motion.button
        type="button"
        className="support-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label="پشتیبانی"
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.4 }}
        whileHover={{ scale: 1.07 }}
        whileTap={{ scale: 0.94 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X size={24} />
            </motion.span>
          ) : (
            <motion.span key="h" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <Headset size={24} />
            </motion.span>
          )}
        </AnimatePresence>
        {!open && <span className="support-fab-dot" />}
      </motion.button>

      {/* ─── پنل گفتگو ─── */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="support-panel"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <div className="sp-head">
              <span className="sp-avatar"><Sparkles size={18} /></span>
              <div style={{ flex: 1 }}>
                <div className="sp-title">پشتیبانی هوشمند لیستیا</div>
                <div className="sp-status">
                  <span className={`sp-dot ${enabled === false ? "off" : ""}`} />
                  {enabled === null ? "در حال اتصال…" : enabled ? "آنلاین" : "پشتیبانی انسانی"}
                </div>
              </div>
              <button type="button" className="sp-icon-btn" title="گفتگوی تازه" onClick={clearChat}>
                <RotateCcw size={16} />
              </button>
              <button type="button" className="sp-icon-btn" title="بستن" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {enabled === false ? (
              <div className="sp-offline">
                <AlertTriangle size={30} />
                <b>دستیار هوشمند موقتاً فعال نیست</b>
                <p>می‌توانید از راه‌های زیر پاسخ بگیرید:</p>
                <a href="https://instagram.com/listia.ir" target="_blank" rel="noreferrer" className="btn btn-primary sp-contact">
                  <Instagram size={16} /> دایرکت به @listia.ir
                </a>
                <a href="mailto:info@listia.ir" className="btn sp-contact">
                  <Mail size={16} /> ایمیل info@listia.ir
                </a>
              </div>
            ) : (
              <>
                <div className="sp-body" ref={bodyRef}>
                  {messages.map((m) => (
                    <div key={m.id} className={`sp-msg ${m.role === "user" ? "me" : "bot"}`}>
                      {m.role === "bot" && <span className="sp-msg-ico"><Sparkles size={13} /></span>}
                      <div className="sp-bubble">
                        <FormattedText text={m.text} />
                      </div>
                    </div>
                  ))}

                  {shownText && (
                    <div className="sp-msg bot">
                      <span className="sp-msg-ico"><Sparkles size={13} /></span>
                      <div className="sp-bubble">
                        <FormattedText text={shownText} />
                      </div>
                    </div>
                  )}

                  {busy && !shownText && (
                    <div className="sp-msg bot">
                      <span className="sp-msg-ico"><Sparkles size={13} /></span>
                      <div className="sp-bubble sp-typing">
                        <span /><span /><span />
                      </div>
                    </div>
                  )}

                  {error && !busy && (
                    <div className="sp-error">
                      <AlertTriangle size={15} />
                      <span style={{ flex: 1 }}>{error}</span>
                      <button type="button" className="btn btn-sm" onClick={retry}>
                        <RotateCcw size={13} /> تلاش مجدد
                      </button>
                    </div>
                  )}
                </div>

                {messages.filter((m) => m.id !== "welcome").length === 0 && !busy && (
                  <div className="sp-suggestions">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => ask(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <form
                  className="sp-input-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask();
                  }}
                >
                  <input
                    ref={inputRef}
                    className="input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="سؤالتان را بنویسید…"
                    maxLength={1500}
                  />
                  <button type="submit" className="btn btn-primary sp-send" disabled={busy || !input.trim()}>
                    <Send size={17} />
                  </button>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

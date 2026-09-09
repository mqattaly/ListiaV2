// کانتکست سراسری: کاربر جاری، سهمیه‌ها، توست‌ها و دیالوگ تأیید
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  AlertOctagon,
} from "lucide-react";
import { api, saveSessionToken } from "../api.js";

const Ctx = createContext(null);

const TOAST_STYLE = {
  success: { icon: <CheckCircle2 size={19} />, },
  error: { icon: <AlertOctagon size={19} /> },
  info: { icon: <Info size={19} /> },
};

let toastSeq = 0;

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [limits, setLimits] = useState(null);
  const [activeCount, setActiveCount] = useState(0);
  const [booting, setBooting] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("listia-theme") || "dark");
  const timers = useRef(new Map());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("listia-theme", theme);
  }, [theme]);

  // نوبتِ آخرین refresh/applyAuth — پاسخِ درخواستِ قدیمی‌تر نباید وضعیتِ
  // جدیدتر را بازنویسی کند (مسابقه: کاربر وسطِ درخواستِ اولیه وارد می‌شود
  // و پاسخِ دیرهنگامِ «کاربر: null» او را بیرون می‌انداخت).
  const refreshSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    try {
      const data = await api.get("/api/auth/me");
      if (seq === refreshSeq.current) {
        setUser(data.user);
        setLimits(data.limits);
      }
      return data;
    } catch {
      if (seq === refreshSeq.current) {
        setUser(null);
        setLimits(null);
      }
      return null;
    } finally {
      if (seq === refreshSeq.current) setBooting(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauth = () => {
      setUser(null);
      setLimits(null);
      setActiveCount(0);
    };
    // وقتی سرور ۴۰۱ داد (توکن/کوکی باطل)، کاربر به صفحه‌ی ورود برمی‌گردد
    window.addEventListener("listia-unauth", onUnauth);
    return () => {
      window.removeEventListener("listia-unauth", onUnauth);
      for (const t of timers.current.values()) clearTimeout(t);
    };
  }, [refresh]);

  const toast = useCallback((message, type = "info", ttl = 4200) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, ttl);
    timers.current.set(id, timer);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setConfirmState({ ...options, resolve });
      }),
    []
  );

  const settleConfirm = useCallback((value) => {
    setConfirmState((current) => {
      current?.resolve?.(value);
      return null;
    });
  }, []);

  const applyAuth = useCallback((data) => {
    // توکن نشست را ذخیره می‌کنیم تا حتی اگر مرورگر کوکی بلاک کرد، درخواست‌ها
    // با هدر Authorization معتبر بمانند.
    ++refreshSeq.current; // پاسخِ refreshهای قبلی دیگر اعمال نمی‌شود
    saveSessionToken(data?.session_token ?? null);
    if (data?.user) {
      setUser(data.user);
      setLimits(data.limits);
    } else {
      refresh();
    }
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      limits,
      booting,
      refresh,
      applyAuth,
      toast,
      confirm,
      theme,
      setTheme,
      activeCount,
      setActiveCount,
    }),
    [user, limits, booting, refresh, applyAuth, toast, confirm, theme, activeCount]
  );

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* ─── توست‌ها ─── */}
      <div className="toast-stack">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -26, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -18, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className={`toast ${t.type}`}
              onClick={() => dismissToast(t.id)}
            >
              <span className="toast-icon">{TOAST_STYLE[t.type]?.icon ?? <Info size={19} />}</span>
              <span className="toast-msg">{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ─── دیالوگ تأیید ─── */}
      <AnimatePresence>
        {confirmState && (
          <ConfirmDialog state={confirmState} onSettle={settleConfirm} />
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

function ConfirmDialog({ state, onSettle }) {
  const danger = state.danger !== false;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onSettle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSettle]);

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={() => onSettle(false)}
    >
      <motion.div
        className="modal-panel modal-sm"
        initial={{ scale: 0.9, y: 26, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.94, y: 14, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span
            className="modal-icon"
            style={
              danger
                ? { background: "var(--danger-soft)", color: "var(--danger)" }
                : undefined
            }
          >
            <AlertTriangle size={21} />
          </span>
          <h3>{state.title ?? "تأیید عملیات"}</h3>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13.5, lineHeight: 2, color: "var(--text-2)" }}>
            {state.message}
          </p>
        </div>
        <div className="modal-foot">
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={() => onSettle(true)}>
            {state.confirmLabel ?? "بله، انجام بده"}
          </button>
          <button className="btn" onClick={() => onSettle(false)}>
            انصراف
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function useApp() {
  return useContext(Ctx);
}

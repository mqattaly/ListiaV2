// اجزای کوچک پرکاربرد
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { PackageOpen, Check, Loader2 } from "lucide-react";

/** اسپینر داخل دکمه‌ها هنگام لودینگ */
export function BtnSpinner({ size = 16 }) {
  return <Loader2 size={size} className="spin" style={{ flexShrink: 0 }} />;
}

/** چک‌باکس بایگانی/بازگردانی — بدون تأیید، با انیمیشن تیک */
export function ArchiveCheck({ checked = false, onToggle, title = "", pending = false }) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      title={title}
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        if (!pending) onToggle?.();
      }}
      className={`archive-check ${checked ? "on" : ""} ${pending ? "busy" : ""}`}
      whileTap={{ scale: 0.82 }}
      whileHover={pending ? undefined : { scale: 1.1 }}
      transition={{ type: "spring", stiffness: 500, damping: 22 }}
    >
      {pending ? (
        <Loader2 size={15} className="spin" />
      ) : (
        <motion.span
          initial={false}
          animate={{ scale: checked ? 1 : 0.4, opacity: checked ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 24 }}
          style={{ display: "grid", placeItems: "center" }}
        >
          <Check size={16} strokeWidth={3.2} />
        </motion.span>
      )}
    </motion.button>
  );
}

/** عدد با انیمیشن شمارش */
export function AnimatedNumber({ value, className = "", duration = 0.9 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!inView) return;
    const from = fromRef.current;
    const to = Number(value) || 0;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min((now - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  return (
    <span ref={ref} className={className}>
      {(Number(value) || 0) === value && !Number.isInteger(Number(value))
        ? Number(value).toFixed(1)
        : display.toLocaleString("en-US")}
    </span>
  );
}

/** لیست با ظهور پله‌ای + انیمیشن حذف/خروج آیتم‌ها */
export function StaggerList({ children, delay = 0.04, className = "", ...rest }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: delay } },
      }}
      {...rest}
    >
      <AnimatePresence>
        {children}
      </AnimatePresence>
    </motion.div>
  );
}

export function StaggerItem({ children, className = "", ...rest }) {
  return (
    <motion.div
      className={className}
      layout
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.98 },
        show: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: "spring", stiffness: 300, damping: 26 },
        },
      }}
      exit={{ opacity: 0, x: 48, scale: 0.94, transition: { duration: 0.22, ease: "easeIn" } }}
      transition={{ layout: { type: "spring", stiffness: 350, damping: 30 } }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** اسکلتون لودینگ */
export function SkeletonRows({ rows = 4, height = 58 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, text, action, image, imageAlt }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  return (
    <div className="empty-state">
      {image ? (
        <motion.div
          className={`empty-img ${imgLoaded ? "loaded" : ""}`}
          animate={imgLoaded ? { y: [0, -9, 0] } : {}}
          transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
        >
          {!imgLoaded && <div className="skeleton" style={{ position: "absolute", inset: 0, borderRadius: "50%" }} />}
          <img src={image} alt={imageAlt ?? title ?? ""} loading="lazy" onLoad={() => setImgLoaded(true)} />
        </motion.div>
      ) : (
        <div className="empty-icon">{icon ?? <PackageOpen size={30} />}</div>
      )}
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

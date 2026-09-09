// اجزای کوچک پرکاربرد
import React, { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { PackageOpen } from "lucide-react";

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

/** لیست با ظهور پله‌ای */
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
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "", ...rest }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.98 },
        show: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: "spring", stiffness: 300, damping: 26 },
        },
      }}
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

export function EmptyState({ icon, title, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <PackageOpen size={30} />}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

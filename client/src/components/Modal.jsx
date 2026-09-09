// مودال انیمیشنی پایه — قلب «باز شدن پنجره‌ها با انیمیشن»
import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  size = "", // "" | "sm" | "lg"
  children,
  footer,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
          transition={{ duration: 0.22 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose?.();
          }}
        >
          <motion.div
            className={`modal-panel ${size ? `modal-${size}` : ""}`}
            initial={{ scale: 0.88, y: 34, opacity: 0, filter: "blur(6px)" }}
            animate={{ scale: 1, y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ scale: 0.92, y: 20, opacity: 0, filter: "blur(4px)" }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-head">
              {icon && <span className="modal-icon">{icon}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3>{title}</h3>
                {subtitle && <div className="modal-sub">{subtitle}</div>}
              </div>
              <button className="modal-close" onClick={onClose} aria-label="بستن">
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

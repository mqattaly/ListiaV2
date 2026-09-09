// ایمپورت از CSV / Excel
import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, FileSpreadsheet, Download, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import { StaggerItem, StaggerList } from "../components/bits.jsx";
import LicenseBanner from "../components/LicenseBanner.jsx";

export default function ImportPage() {
  const { toast, refresh, limits } = useApp();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const sendFile = async (file) => {
    if (!file) return;
    if (!/\.(csv|xlsx|xlsm|xls)$/i.test(file.name)) {
      toast("فقط فایل CSV یا Excel مجاز است.", "error");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await api.upload("/api/import", fd);
      setResult(data);
      if (data.success) toast(data.message, "success", 6000);
      else toast(data.message, "error", 6500);
      refresh();
    } catch (err) {
      toast(err.message, "error", 6500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>
            <FileSpreadsheet size={21} className="text-gradient" /> ایمپورت از اکسل
          </h2>
          <p className="page-sub">
            ستون‌ها به‌ترتیب: تأمین‌کننده، نام محصول، تعداد، واحد (عدد/کارتن/بسته/گونی/کیلو)، توضیحات. سطر اول
            (عنوان‌ها) نادیده گرفته می‌شود.
          </p>
        </div>
        <div className="page-actions">
          <a className="btn" href="/api/import/template" download>
            <Download size={16} /> دانلود فایل نمونه
          </a>
        </div>
      </div>

      {limits && !limits.is_licensed && (
        <LicenseBanner message="در نسخه‌ی آزمایشی، سقف ایمپورت هم ۱ تأمین‌کننده و ۵ محصول است — ردیف‌های اضافه رد می‌شوند." />
      )}

      <motion.div
        className={`dropzone ${over ? "over" : ""}`}
        whileHover={{ scale: 1.008 }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          sendFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <motion.div
          className="dz-icon"
          animate={busy ? { scale: [1, 1.12, 1], rotate: [0, 6, -6, 0] } : {}}
          transition={{ repeat: Infinity, duration: 1.6 }}
        >
          <UploadCloud size={30} />
        </motion.div>
        <h3 style={{ fontSize: 16, marginBottom: 6 }}>
          {busy ? "در حال پردازش فایل…" : "فایل را اینجا رها کنید"}
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--text-3)", fontWeight: 600 }}>
          یا برای انتخاب کلیک کنید — پشتیبانی از CSV و XLSX تا ۸ مگابایت
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xlsm,.xls"
          hidden
          onChange={(e) => sendFile(e.target.files?.[0])}
        />
      </motion.div>

      <AnimatePresence>
        {result && (
          <motion.div
            className="card mt-24"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex items-center gap-12 mb-16">
              {result.success ? (
                <CheckCircle2 size={22} style={{ color: "var(--success)" }} />
              ) : (
                <XCircle size={22} style={{ color: "var(--danger)" }} />
              )}
              <b style={{ fontSize: 14.5 }}>{result.message}</b>
            </div>
            {result.errors?.length > 0 && (
              <div className="error-list">
                <StaggerList>
                  {result.errors.map((err, i) => (
                    <StaggerItem key={i} className="err-item">
                      <XCircle size={14} style={{ marginTop: 4, flexShrink: 0 }} />
                      <span>{err}</span>
                    </StaggerItem>
                  ))}
                </StaggerList>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

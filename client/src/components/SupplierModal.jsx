// مودال ثبت/ویرایش تأمین‌کننده
import React, { useEffect, useRef, useState } from "react";
import { Store, Pencil } from "lucide-react";
import Modal from "./Modal.jsx";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import { BtnSpinner } from "./bits.jsx";

export default function SupplierModal({ open, onClose, supplier = null, onSaved }) {
  const { toast } = useApp();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setName(supplier?.name ?? "");
    setTimeout(() => inputRef.current?.focus(), 350);
  }, [open, supplier]);

  const save = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return toast("نام تأمین‌کننده را وارد کنید.", "error");
    setSaving(true);
    try {
      const data = supplier
        ? await api.post(`/api/suppliers/${supplier.id}/edit`, { name })
        : await api.post("/api/suppliers", { name });
      toast(data.message || "ثبت شد", "success");
      onSaved?.(data);
      onClose?.();
    } catch (err) {
      toast(err.message, "error", 5200);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      icon={supplier ? <Pencil size={19} /> : <Store size={19} />}
      title={supplier ? "ویرایش تأمین‌کننده" : "تأمین‌کننده‌ی جدید"}
      subtitle={supplier ? undefined : "محصولات هر تأمین‌کننده جداگانه مدیریت می‌شود"}
    >
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <label>نام تأمین‌کننده</label>
          <input
            ref={inputRef}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً: هایپراستار"
          />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving} style={{ flex: 1 }}>
            {saving ? <><BtnSpinner /> در حال ذخیره…</> : supplier ? "ذخیره" : "افزودن"}
          </button>
          <button type="button" className="btn btn-lg" onClick={onClose}>
            انصراف
          </button>
        </div>
      </form>
    </Modal>
  );
}

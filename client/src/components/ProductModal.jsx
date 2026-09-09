// مودال ثبت/ویرایش محصول — با بررسی تکراری و autocomplete
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PackagePlus, Pencil, AlertTriangle } from "lucide-react";
import Modal from "./Modal.jsx";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";

const UNITS = ["عدد", "کارتن", "بسته", "گونی", "کیلو"];

export default function ProductModal({
  open,
  onClose,
  suppliers,
  productNames = [],
  product = null,
  defaultSupplierId = "",
  onSaved,
}) {
  const { toast } = useApp();
  const [form, setForm] = useState({
    supplier_id: "",
    product: "",
    quantity: "",
    unit: "عدد",
    description: "",
  });
  const [dup, setDup] = useState(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setDup(null);
    if (product) {
      setForm({
        supplier_id: String(product.supplier_id),
        product: product.product_name,
        quantity: product.quantity ?? "",
        unit: product.unit ?? "عدد",
        description: product.description ?? "",
      });
    } else {
      setForm({
        supplier_id: defaultSupplierId ? String(defaultSupplierId) : "",
        product: "",
        quantity: "",
        unit: "عدد",
        description: "",
      });
      setTimeout(() => nameRef.current?.focus(), 350);
    }
  }, [open, product, defaultSupplierId]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (key === "product") setDup(null);
  };

  const checkDuplicate = async () => {
    const name = form.product.trim();
    if (!name || (product && name === product.product_name)) return;
    try {
      const data = await api.get(
        `/api/check-duplicate?product=${encodeURIComponent(name)}&supplier=${form.supplier_id || ""}`
      );
      setDup(data.matches?.length ? data.matches : null);
    } catch {
      /* بی‌صدا */
    }
  };

  const save = async (e) => {
    e?.preventDefault();
    if (!form.supplier_id) return toast("تأمین‌کننده را انتخاب کنید.", "error");
    if (!form.product.trim()) return toast("نام محصول را وارد کنید.", "error");
    if (!form.quantity.trim()) return toast("تعداد را وارد کنید.", "error");
    setSaving(true);
    try {
      const payload = {
        supplier_id: form.supplier_id,
        product: form.product,
        quantity: form.quantity,
        unit: form.unit,
        description: form.description,
      };
      const data = product
        ? await api.post(`/api/products/${product.id}/edit`, payload)
        : await api.post("/api/products", payload);
      toast(data.message || (product ? "محصول به‌روزرسانی شد" : "خرید ثبت شد"), "success");
      onSaved?.(data.product, product ? "edit" : "add");
      onClose?.();
    } catch (err) {
      toast(err.message, "error", 5200);
    } finally {
      setSaving(false);
    }
  };

  const supplierName = useMemo(
    () => suppliers.find((s) => String(s.id) === String(form.supplier_id))?.name,
    [suppliers, form.supplier_id]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={product ? <Pencil size={20} /> : <PackagePlus size={20} />}
      title={product ? "ویرایش محصول" : "ثبت خرید جدید"}
      subtitle={product ? supplierName : "به لیست خریدِ فعال اضافه می‌شود"}
    >
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <label>تأمین‌کننده</label>
          <select className="select" value={form.supplier_id} onChange={set("supplier_id")}>
            <option value="">— انتخاب کنید —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.owner_name && s.owner_name !== s.name ? ` (${s.owner_name})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>نام محصول</label>
          <input
            ref={nameRef}
            className="input"
            list="product-names"
            value={form.product}
            onChange={set("product")}
            onBlur={checkDuplicate}
            placeholder="مثلاً: برنج طارم هاشمی"
          />
          <datalist id="product-names">
            {productNames.slice(0, 150).map((n, i) => (
              <option key={i} value={n} />
            ))}
          </datalist>
          <AnimatePresence>
            {dup && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -6 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="auth-alert info"
                style={{ marginBottom: 0, marginTop: 4 }}
              >
                <AlertTriangle size={17} style={{ marginTop: 3, flexShrink: 0 }} />
                <span>
                  این محصول قبلاً ثبت شده:
                  {dup.slice(0, 3).map((m, i) => (
                    <span key={i}>
                      {" "}
                      <b>{m.supplier_name}</b>
                      {m.quantity ? ` (${m.quantity} ${m.unit || ""})` : ""}
                      {m.same_supplier ? " (همین تأمین‌کننده)" : ""}
                      {i < dup.length - 1 ? "،" : ""}
                    </span>
                  ))}
                  . مطمئنید دوباره می‌خواهید ثبتش کنید؟
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label>تعداد</label>
            <input
              className="input mono"
              value={form.quantity}
              onChange={set("quantity")}
              placeholder="مثلاً: 4"
            />
          </div>
          <div className="field">
            <label>واحد</label>
            <select className="select" value={form.unit} onChange={set("unit")}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>توضیحات (اختیاری)</label>
          <textarea
            className="input"
            value={form.description}
            onChange={set("description")}
            placeholder="برند، گرید، نکته‌ی مهم…"
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving} style={{ flex: 1 }}>
            {saving ? "در حال ذخیره…" : product ? "ذخیره‌ی تغییرات" : "ثبت خرید"}
          </button>
          <button type="button" className="btn btn-lg" onClick={onClose}>
            انصراف
          </button>
        </div>
      </form>
    </Modal>
  );
}

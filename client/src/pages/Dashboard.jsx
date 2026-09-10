// داشبورد: آمار زنده، ثبت سریع، تأمین‌کننده‌ها، آخرین خریدها
import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ShoppingBasket,
  Store,
  Archive,
  ChevronLeft,
  Sparkles,
  Store as StoreIcon,
} from "lucide-react";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import { AnimatedNumber, StaggerList, StaggerItem, SkeletonRows, EmptyState, BtnSpinner } from "../components/bits.jsx";
import ProductModal from "../components/ProductModal.jsx";
import { greeting } from "../format.js";

export default function Dashboard() {
  const { user, toast, refresh, setActiveCount } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [quick, setQuick] = useState({ product: "", quantity: "", unit: "عدد", supplier_id: "" });
  const [savingQuick, setSavingQuick] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    const d = await api.get("/api/dashboard").catch(() => null);
    if (d) {
      setData(d);
      setActiveCount(d.active_count ?? 0);
    }
  }, [setActiveCount]);

  useEffect(() => {
    load();
  }, [load]);

  const suppliers = data?.suppliers ?? [];
  const canQuick = suppliers.length > 0;

  const submitQuick = async (e) => {
    e.preventDefault();
    if (!quick.product.trim() || !quick.quantity.trim()) {
      toast("نام محصول و تعداد را وارد کنید.", "error");
      return;
    }
    if (!quick.supplier_id) {
      toast("تأمین‌کننده را انتخاب کنید.", "error");
      return;
    }
    setSavingQuick(true);
    try {
      const res = await api.post("/api/products", {
        supplier_id: quick.supplier_id,
        product: quick.product,
        quantity: quick.quantity,
        unit: quick.unit,
        description: quick.description ?? "",
      });
      toast(res.message || "خرید ثبت شد", "success");
      setQuick((q) => ({ ...q, product: "", quantity: "" }));
      load();
      refresh();
    } catch (err) {
      toast(err.message, "error", 5200);
    } finally {
      setSavingQuick(false);
    }
  };

  const stats = [
    {
      icon: <ShoppingBasket size={24} />,
      cls: "grad-1",
      num: data?.active_count ?? 0,
      label: "قلم خرید فعال",
    },
    {
      icon: <StoreIcon size={24} />,
      cls: "grad-2",
      num: data?.supplier_count ?? 0,
      label: "تأمین‌کننده",
    },
    {
      icon: <Archive size={24} />,
      cls: "grad-3",
      num: data?.archived_count ?? 0,
      label: "بایگانی خرید",
    },
  ];

  return (
    <div>
      {/* سلام و آمار */}
      <div className="page-head">
        <div>
          <h2>
            {greeting()}، <span className="text-gradient">{user?.first_name || user?.username}</span> 👋
          </h2>
          <p className="page-sub">
            امروز {data?.today_label ?? "—"} است. وضعیت لیست خریدِ شما در یک نگاه:
          </p>
        </div>
      </div>

      <StaggerList className="stat-grid">
        {stats.map((s, i) => (
          <StaggerItem key={i}>
            <div className="card card-hover stat-card">
              <span className={`st-icon ${s.cls}`}>{s.icon}</span>
              <div>
                <div className="st-num">
                  <AnimatedNumber value={s.num} />
                </div>
                <div className="st-label">{s.label}</div>
              </div>
              <span className="st-spark" />
            </div>
          </StaggerItem>
        ))}
      </StaggerList>

      {/* ثبت سریع */}
      <motion.div
        className="quick-add-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <h3>
          <Sparkles size={17} className="text-gradient" /> ثبت سریع خرید
        </h3>
        {canQuick ? (
          <form className="quick-grid" onSubmit={submitQuick}>
            <div className="field">
              <label>نام محصول</label>
              <input
                className="input"
                list="dash-product-names"
                value={quick.product}
                onChange={(e) => setQuick((q) => ({ ...q, product: e.target.value }))}
                placeholder="مثلاً: روغن سرخ‌کردنی"
              />
              <datalist id="dash-product-names">
                {(data?.product_names ?? []).slice(0, 150).map((n, i) => (
                  <option key={i} value={n} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label>تعداد</label>
              <input
                className="input mono"
                value={quick.quantity}
                onChange={(e) => setQuick((q) => ({ ...q, quantity: e.target.value }))}
                placeholder="۲"
              />
            </div>
            <div className="field">
              <label>واحد</label>
              <select
                className="select"
                value={quick.unit}
                onChange={(e) => setQuick((q) => ({ ...q, unit: e.target.value }))}
              >
                {["عدد", "کارتن", "بسته", "گونی", "کیلو"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>تأمین‌کننده</label>
              <select
                className="select"
                value={quick.supplier_id}
                onChange={(e) => setQuick((q) => ({ ...q, supplier_id: e.target.value }))}
              >
                <option value="">انتخاب…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>توضیح</label>
              <input
                className="input"
                value={quick.description ?? ""}
                onChange={(e) => setQuick((q) => ({ ...q, description: e.target.value }))}
                placeholder="اختیاری"
              />
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button className="btn btn-primary" type="submit" disabled={savingQuick}>
                {savingQuick ? <BtnSpinner /> : "ثبت"}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-12 wrap">
            <span style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.9 }}>
              برای شروع، اول یک تأمین‌کننده بسازید — بعد از آن ثبت خرید فقط چند ثانیه طول می‌کشد.
            </span>
            <button className="btn btn-primary" onClick={() => navigate("/suppliers")}>
              <Store size={16} /> ساخت تأمین‌کننده
            </button>
          </div>
        )}
      </motion.div>

      {/* تأمین‌کننده‌ها */}
      <div className="flex items-center justify-between mb-16">
        <h3 style={{ fontSize: 16.5 }}>تأمین‌کننده‌ها</h3>
        <Link to="/suppliers" className="btn btn-sm btn-ghost">
          مدیریت <ChevronLeft size={14} />
        </Link>
      </div>

      {!data ? (
        <SkeletonRows rows={2} height={120} />
      ) : suppliers.length === 0 ? (
        <div className="card">
          <EmptyState
            image="/img/empty-store.png"
            title="هنوز تأمین‌کننده‌ای ندارید"
            text="تأمین‌کننده‌ها مثل پوشه‌های لیست خرید شما هستند — برای هر مغازه یا فروشنده یک‌بسازید."
            action={
              <button className="btn btn-primary" onClick={() => navigate("/suppliers")}>
                <Store size={16} /> اولین تأمین‌کننده
              </button>
            }
          />
        </div>
      ) : (
        <StaggerList className="supplier-grid">
          {suppliers.map((s) => (
            <StaggerItem key={s.id}>
              <Link to={`/supplier/${s.id}`} className="card card-hover supplier-card" style={{ display: "block" }}>
                <span className="sc-shine" />
                <div className="sc-top">
                  <span className="sc-icon">
                    <Store size={21} />
                  </span>
                  <h4>{s.name}</h4>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="sc-count">
                      <AnimatedNumber value={s.active_count} />
                    </div>
                    <div className="sc-count-label">قلم خرید فعال</div>
                  </div>
                  <ChevronLeft size={18} style={{ color: "var(--text-3)" }} />
                </div>
                {s.owner_name && user && s.owner_id !== user.id && (
                  <span className="badge badge-cyan sc-owner">
                    اشتراکی از {s.owner_name}
                  </span>
                )}
              </Link>
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      {/* آخرین خریدها */}
      <div className="flex items-center justify-between mb-16 mt-24">
        <h3 style={{ fontSize: 16.5 }}>آخرین خریدهای فعال</h3>
        <Link to="/purchases" className="btn btn-sm btn-ghost">
          مشاهده‌ی همه ({data?.active_count ?? 0}) <ChevronLeft size={14} />
        </Link>
      </div>
      <div className="card" style={{ padding: 14 }}>
        {!data ? (
          <SkeletonRows rows={3} height={54} />
        ) : (data?.recent ?? []).length === 0 ? (
          <EmptyState
            image="/img/empty-purchases.png"
            title="لیست خرید خالی است"
            text="با فرم «ثبت سریع» بالا اولین قلم خریدتان را اضافه کنید."
          />
        ) : (
          <StaggerList style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {data.recent.slice(0, 8).map((p) => (
              <StaggerItem key={p.id}>
                <Link to={`/supplier/${p.supplier_id}`} className="product-row" style={{ textDecoration: "none" }}>
                  <span className="pr-icon">
                    <ShoppingBasket size={19} />
                  </span>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div className="pr-name">{p.product_name}</div>
                    <div className="pr-desc">
                      <span className="badge" style={{ padding: "2px 8px", fontSize: 10.5 }}>{p.supplier_name}</span>
                      {p.description && <span>{p.description}</span>}
                    </div>
                  </div>
                  <span className="pr-qty">
                    {p.quantity} {p.unit}
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </div>

      <ProductModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        suppliers={suppliers}
        productNames={data?.product_names ?? []}
        onSaved={() => {
          load();
          refresh();
        }}
      />
    </div>
  );
}

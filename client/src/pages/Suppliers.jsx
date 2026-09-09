// صفحه‌ی تأمین‌کننده‌ها
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Store, Plus, Pencil, Trash2, ChevronLeft } from "lucide-react";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import { AnimatedNumber, EmptyState, SkeletonRows, StaggerItem, StaggerList } from "../components/bits.jsx";
import SupplierModal from "../components/SupplierModal.jsx";
import LicenseBanner from "../components/LicenseBanner.jsx";

export default function Suppliers() {
  const { toast, confirm, limits, refresh, user } = useApp();
  const [data, setData] = useState(null);
  const [modal, setModal] = useState({ open: false, supplier: null });

  const load = useCallback(async () => {
    const d = await api.get("/api/suppliers").catch(() => null);
    if (d) setData(d);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (s) => {
    const ok = await confirm({
      title: "حذف تأمین‌کننده",
      message: `تأمین‌کننده‌ی «${s.name}» و همه‌ی محصولات آن حذف شود؟ این عمل قابل بازگشت نیست.`,
      confirmLabel: "حذف کامل",
    });
    if (!ok) return;
    try {
      const res = await api.post(`/api/suppliers/${s.id}/delete`);
      toast(res.message || "حذف شد", "success");
      load();
      refresh();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const suppliers = data?.suppliers ?? [];
  const showLicenseBanner = limits && !limits.is_licensed && limits.supplier_count >= (limits.max_suppliers ?? 1);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>
            <Store size={21} className="text-gradient" /> تأمین‌کننده‌ها
          </h2>
          <p className="page-sub">
            {data ? `${suppliers.length} تأمین‌کننده در دسترس شماست` : "در حال بارگذاری…"}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setModal({ open: true, supplier: null })}>
            <Plus size={17} /> تأمین‌کننده‌ی جدید
          </button>
        </div>
      </div>

      {showLicenseBanner && <LicenseBanner />}

      {!data ? (
        <SkeletonRows rows={3} height={120} />
      ) : suppliers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Store size={30} />}
            title="هنوز تأمین‌کننده‌ای نساخته‌اید"
            text="هر تأمین‌کننده یک لیست خریدِ جداگانه است — مثلاً «هایپراستار» یا «مواد غذایی پارس»."
            action={
              <button className="btn btn-primary" onClick={() => setModal({ open: true, supplier: null })}>
                <Plus size={16} /> ساخت اولین تأمین‌کننده
              </button>
            }
          />
        </div>
      ) : (
        <StaggerList className="supplier-grid">
          {suppliers.map((s) => (
            <StaggerItem key={s.id}>
              <div className="card card-hover supplier-card">
                <span className="sc-shine" />
                <Link to={`/supplier/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="sc-top">
                    <span className="sc-icon">
                      <Store size={21} />
                    </span>
                    <h4>{s.name}</h4>
                  </div>
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <div className="sc-count">
                        <AnimatedNumber value={s.active_count} />
                      </div>
                      <div className="sc-count-label">قلم خرید فعال</div>
                    </div>
                    <ChevronLeft size={18} style={{ color: "var(--text-3)" }} />
                  </div>
                </Link>
                {s.owner_name && user && s.owner_id !== user.id && (
                  <span className="badge badge-cyan" style={{ marginBottom: 10 }}>
                    اشتراکی از {s.owner_name}
                  </span>
                )}
                <div className="flex gap-6" style={{ marginTop: 10 }}>
                  <button
                    className="btn btn-sm btn-ghost tip"
                    data-tip="ویرایش نام"
                    onClick={() => setModal({ open: true, supplier: s })}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn btn-sm btn-ghost tip"
                    data-tip="حذف"
                    onClick={() => remove(s)}
                    style={{ color: "var(--danger)" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      <SupplierModal
        open={modal.open}
        supplier={modal.supplier}
        onClose={() => setModal({ open: false, supplier: null })}
        onSaved={() => {
          load();
          refresh();
        }}
      />
    </div>
  );
}

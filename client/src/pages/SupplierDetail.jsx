// جزئیات تأمین‌کننده: محصولات فعال + بایگانی گروه‌بندی‌شده بر اساس تاریخ
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import {
  Store,
  Plus,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  ShoppingCart,
  CalendarDays,
  PackageSearch,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import { EmptyState, SkeletonRows, StaggerItem, StaggerList } from "../components/bits.jsx";
import ProductModal from "../components/ProductModal.jsx";

export default function SupplierDetail() {
  const { id } = useParams();
  const { toast, confirm, refresh, user } = useApp();
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [modal, setModal] = useState({ open: false, product: null });
  const [highlight, setHighlight] = useState(null);
  const [params] = useSearchParams();

  const load = useCallback(async () => {
    const d = await api.get(`/api/suppliers/${id}`).catch((err) => {
      if (err.status === 404) setNotFound(true);
      return null;
    });
    if (d) setData(d);
  }, [id]);

  useEffect(() => {
    setData(null);
    setNotFound(false);
    load();
  }, [load]);

  useEffect(() => {
    const hl = params.get("highlight");
    if (hl) {
      setHighlight(Number(hl));
      setTimeout(() => setHighlight(null), 2600);
    }
  }, [params]);

  if (notFound) {
    return (
      <div className="card">
        <EmptyState
          icon={<PackageSearch size={30} />}
          title="تأمین‌کننده پیدا نشد"
          text="شاید حذف شده باشد یا به شما تعلق نداشته باشد."
        />
      </div>
    );
  }

  const archive = async (p) => {
    const ok = await confirm({
      title: "انتقال به بایگانی",
      message: `«${p.product_name}» به بایگانیِ امروز (${data?.today_label}) منتقل شود؟`,
      confirmLabel: "بله، بایگانی کن",
      danger: false,
    });
    if (!ok) return;
    try {
      await api.post(`/api/products/${p.id}/toggle-order`);
      toast("به بایگانی منتقل شد", "success");
      load();
      refresh();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const unarchive = async (p) => {
    try {
      await api.post(`/api/products/${p.id}/unarchive`);
      toast("به لیست فعال برگشت", "success");
      load();
      refresh();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const remove = async (p) => {
    const ok = await confirm({
      title: "حذف محصول",
      message: `«${p.product_name}» برای همیشه حذف شود؟`,
      confirmLabel: "حذف کن",
    });
    if (!ok) return;
    try {
      await api.post(`/api/products/${p.id}/delete`);
      toast("محصول حذف شد", "success");
      load();
      refresh();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const deleteArchiveGroup = async (dateKey, label) => {
    const ok = await confirm({
      title: "حذف گروه بایگانی",
      message: `همه‌ی محصولات بایگانی‌شده در تاریخ «${label}» حذف شوند؟`,
      confirmLabel: "حذف گروه",
    });
    if (!ok) return;
    try {
      await api.post(`/api/suppliers/${id}/archive/${dateKey}/delete`);
      toast("گروه بایگانی حذف شد", "success");
      load();
      refresh();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const products = data?.products ?? [];
  const groups = Object.entries(data?.groups ?? {}).sort(([a], [b]) => (a === "unknown" ? 1 : b === "unknown" ? -1 : a < b ? 1 : -1));

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>
            <Store size={21} className="text-gradient" /> {data?.supplier?.name ?? "…"}
          </h2>
          <p className="page-sub">
            {data
              ? `${products.length} قلم فعال · ${groups.length} گروه بایگانی${data.supplier.owner_name && user && data.supplier.owner_id !== user.id ? ` · داده‌ی اشتراکی از ${data.supplier.owner_name}` : ""}`
              : "در حال بارگذاری…"}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setModal({ open: true, product: null })}>
            <Plus size={17} /> ثبت خرید
          </button>
        </div>
      </div>

      {!data ? (
        <SkeletonRows rows={4} />
      ) : (
        <>
          <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>لیست فعال</h3>
          {products.length === 0 ? (
            <div className="card">
              <EmptyState
                title="لیست فعال خالی است"
                text="برای این تأمین‌کننده هنوز خرید فعالی ثبت نشده."
                action={
                  <button className="btn btn-primary" onClick={() => setModal({ open: true, product: null })}>
                    <Plus size={16} /> ثبت اولین خرید
                  </button>
                }
              />
            </div>
          ) : (
            <StaggerList style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {products.map((p) => (
                <StaggerItem key={p.id}>
                  <motion.div layout className={`product-row ${highlight === p.id ? "highlight" : ""}`}>
                    <span className="pr-icon">
                      <ShoppingCart size={18} />
                    </span>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div className="pr-name">{p.product_name}</div>
                      <div className="pr-desc">
                        {p.description && <span>{p.description}</span>}
                        {p.is_next_purchase && (
                          <span className="badge badge-cyan" style={{ padding: "2px 8px", fontSize: 10.5 }}>
                            خرید بعدی: {p.next_qty}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="pr-qty">
                      {p.quantity} {p.unit}
                    </span>
                    <div className="pr-actions">
                      <button className="btn btn-sm btn-success tip" data-tip="بایگانی" onClick={() => archive(p)}>
                        <Archive size={15} />
                      </button>
                      <button className="btn btn-sm btn-ghost tip" data-tip="ویرایش" onClick={() => setModal({ open: true, product: p })}>
                        <Pencil size={15} />
                      </button>
                      <button className="btn btn-sm btn-ghost tip" data-tip="حذف" onClick={() => remove(p)} style={{ color: "var(--danger)" }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </motion.div>
                </StaggerItem>
              ))}
            </StaggerList>
          )}

          {groups.length > 0 && (
            <>
              <h3 style={{ fontSize: 15.5, margin: "28px 0 12px" }}>بایگانی خریدها</h3>
              <StaggerList style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {groups.map(([dateKey, group]) => (
                  <StaggerItem key={dateKey}>
                    <div className="archive-group">
                      <div className="ag-head">
                        <span className="ag-date">
                          <CalendarDays size={16} style={{ color: "#a5b4fc" }} />
                          {group.label}
                          {dateKey === data.today_iso && (
                            <span className="badge badge-success" style={{ fontSize: 10 }}>امروز</span>
                          )}
                        </span>
                        <span className="badge">{group.products.length} قلم</span>
                        <button
                          className="btn btn-sm btn-ghost tip"
                          data-tip="حذف گروه"
                          style={{ marginRight: "auto", color: "var(--danger)" }}
                          onClick={() => deleteArchiveGroup(dateKey, group.label)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="ag-rows">
                        {group.products.map((p) => (
                          <motion.div key={p.id} layout className="product-row" style={{ opacity: 0.85 }}>
                            <span className="pr-icon" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
                              <Archive size={17} />
                            </span>
                            <div style={{ flex: 1, minWidth: 140 }}>
                              <div className="pr-name">{p.product_name}</div>
                              {p.description && <div className="pr-desc"><span>{p.description}</span></div>}
                            </div>
                            <span className="pr-qty">{p.quantity} {p.unit}</span>
                            <div className="pr-actions">
                              <button className="btn btn-sm tip" data-tip="بازگردانی" onClick={() => unarchive(p)}>
                                <ArchiveRestore size={15} />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerList>
            </>
          )}
        </>
      )}

      <ProductModal
        open={modal.open}
        product={modal.product}
        defaultSupplierId={id}
        suppliers={data?.suppliers ?? []}
        productNames={[]}
        onClose={() => setModal({ open: false, product: null })}
        onSaved={() => {
          load();
          refresh();
        }}
      />
    </div>
  );
}

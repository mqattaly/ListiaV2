// جزئیات تأمین‌کننده: محصولات فعال + بایگانی گروه‌بندی‌شده بر اساس تاریخ
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import {
  Store,
  Plus,
  Pencil,
  Trash2,
  Archive,
  ShoppingCart,
  CalendarDays,
  PackageSearch,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import { ArchiveCheck, EmptyState, SkeletonRows, StaggerItem, StaggerList } from "../components/bits.jsx";
import ProductModal from "../components/ProductModal.jsx";

export default function SupplierDetail() {
  const { id } = useParams();
  const { toast, confirm, refresh, user, setActiveCount } = useApp();
  const [pending, setPending] = useState(() => new Set());
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

  const setBusy = (pid, on) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(pid);
      else next.delete(pid);
      return next;
    });
  };

  // بایگانی فوری با چک‌باکس — بدون تأیید
  const archive = async (p) => {
    if (pending.has(p.id)) return;
    setBusy(p.id, true);
    setData((d) => (d ? { ...d, products: d.products.filter((x) => x.id !== p.id) } : d));
    setActiveCount?.((c) => Math.max(0, (c ?? 1) - 1));
    try {
      await api.post(`/api/products/${p.id}/toggle-order`);
      toast(`«${p.product_name}» بایگانی شد`, "success");
      load();
      refresh();
    } catch (err) {
      toast(err.message, "error");
      load();
      refresh();
    } finally {
      setBusy(p.id, false);
    }
  };

  // بازگردانی فوری با برداشتن تیک — بدون تأیید
  const unarchive = async (p) => {
    if (pending.has(p.id)) return;
    setBusy(p.id, true);
    setData((d) => {
      if (!d) return d;
      const groups = {};
      for (const [key, group] of Object.entries(d.groups ?? {})) {
        const left = group.products.filter((x) => x.id !== p.id);
        if (left.length) groups[key] = { ...group, products: left };
      }
      return { ...d, groups };
    });
    setActiveCount?.((c) => (c ?? 0) + 1);
    try {
      await api.post(`/api/products/${p.id}/unarchive`);
      toast(`«${p.product_name}» به لیست فعال برگشت`, "success");
      load();
      refresh();
    } catch (err) {
      toast(err.message, "error");
      load();
      refresh();
    } finally {
      setBusy(p.id, false);
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
                image="/img/empty-purchases.png"
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
                  <motion.div
                    layout
                    className={`product-row ${highlight === p.id ? "highlight" : ""}`}
                    animate={highlight === p.id ? { scale: [1, 1.015, 1] } : {}}
                    transition={{ duration: 0.5 }}
                  >
                    <ArchiveCheck
                      checked={false}
                      pending={pending.has(p.id)}
                      title="بایگانی"
                      onToggle={() => archive(p)}
                    />
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
                        <AnimatePresence initial={false}>
                        {group.products.map((p) => (
                          <motion.div
                            key={p.id}
                            layout
                            className="product-row"
                            style={{ opacity: 0.85 }}
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 0.85, y: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 60, scale: 0.94, transition: { duration: 0.22, ease: "easeIn" } }}
                          >
                            <ArchiveCheck
                              checked={true}
                              pending={pending.has(p.id)}
                              title="بازگردانی به لیست فعال"
                              onToggle={() => unarchive(p)}
                            />
                            <span className="pr-icon" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
                              <Archive size={17} />
                            </span>
                            <div style={{ flex: 1, minWidth: 140 }}>
                              <div className="pr-name">{p.product_name}</div>
                              {p.description && <div className="pr-desc"><span>{p.description}</span></div>}
                            </div>
                            <span className="pr-qty">{p.quantity} {p.unit}</span>
                          </motion.div>
                        ))}
                        </AnimatePresence>
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
        onSaved={(saved) => {
          load();
          refresh();
          if (saved?.id) {
            setHighlight(saved.id);
            setTimeout(() => setHighlight((h) => (h === saved.id ? null : h)), 2600);
          }
        }}
      />
    </div>
  );
}

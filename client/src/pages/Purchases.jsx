// صفحه‌ی خریدهای فعال — گروه‌بندی بر اساس تأمین‌کننده
import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ShoppingCart,
  Plus,
  Pencil,
  Trash2,
  Archive,
  PackageCheck,
  ChevronDown,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import { EmptyState, SkeletonRows } from "../components/bits.jsx";
import ProductModal from "../components/ProductModal.jsx";

export default function Purchases() {
  const { toast, confirm, refresh, setActiveCount } = useApp();
  const [data, setData] = useState(null);
  const [modal, setModal] = useState({ open: false, product: null });
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [params, setParams] = useSearchParams();

  const load = useCallback(async () => {
    const d = await api.get("/api/purchases").catch(() => null);
    if (d) {
      setData(d);
      setActiveCount(d.products.length);
    }
  }, [setActiveCount]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (params.get("add")) {
      setModal({ open: true, product: null });
      params.delete("add");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const groups = React.useMemo(() => {
    const map = new Map();
    for (const p of data?.products ?? []) {
      if (!map.has(p.supplier_id)) {
        map.set(p.supplier_id, { name: p.supplier_name, owner: p.owner_display, items: [] });
      }
      map.get(p.supplier_id).items.push(p);
    }
    return [...map.entries()];
  }, [data]);

  const toggleGroup = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const archive = async (p) => {
    const ok = await confirm({
      title: "انتقال به بایگانی",
      message: `«${p.product_name}» به بایگانیِ امروز منتقل شود؟ می‌توانید بعداً برش گردانید.`,
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

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>
            <ShoppingCart size={21} className="text-gradient" /> خریدهای فعال
          </h2>
          <p className="page-sub">
            {data ? `${data.products.length} قلم خرید در ${groups.length} تأمین‌کننده` : "در حال بارگذاری…"}
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            onClick={() => setModal({ open: true, product: null })}
            disabled={data && data.suppliers.length === 0}
          >
            <Plus size={17} /> ثبت خرید
          </button>
        </div>
      </div>

      {!data ? (
        <SkeletonRows rows={5} />
      ) : data.products.length === 0 ? (
        <div className="card">
          <EmptyState
            title="هیچ خرید فعالی ندارید"
            text="اولین قلم خرید را ثبت کنید یا از صفحه‌ی تأمین‌کننده‌ها شروع کنید."
            action={
              <button className="btn btn-primary" onClick={() => setModal({ open: true, product: null })}>
                <Plus size={16} /> ثبت خرید
              </button>
            }
          />
        </div>
      ) : (
        groups.map(([sid, group]) => {
          const isCollapsed = collapsed.has(sid);
          return (
            <div className="supplier-group" key={sid}>
              <div className="sg-head" onClick={() => toggleGroup(sid)}>
                <motion.span animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }} style={{ display: "grid" }}>
                  <ChevronDown size={16} style={{ color: "var(--text-3)" }} />
                </motion.span>
                <span className="sg-icon">
                  <PackageCheck size={17} />
                </span>
                <h3>
                  <Link to={`/supplier/${sid}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {group.name}
                  </Link>
                </h3>
                <span className="sg-count-badge">{group.items.length} قلم</span>
              </div>
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    className="sg-rows"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: "hidden" }}
                  >
                    {group.items.map((p) => (
                      <motion.div
                        key={p.id}
                        className="product-row"
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 30 }}
                      >
                        <span className="pr-icon">
                          <ShoppingCart size={18} />
                        </span>
                        <div style={{ flex: 1, minWidth: 140 }}>
                          <div className="pr-name">{p.product_name}</div>
                          <div className="pr-desc">
                            <span className="badge" style={{ padding: "2px 8px", fontSize: 10.5 }}>
                              {p.supplier_name}
                            </span>
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
                          <button
                            className="btn btn-sm btn-success tip"
                            data-tip="بایگانی"
                            onClick={() => archive(p)}
                          >
                            <Archive size={15} />
                          </button>
                          <button
                            className="btn btn-sm btn-ghost tip"
                            data-tip="ویرایش"
                            onClick={() => setModal({ open: true, product: p })}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="btn btn-sm btn-ghost tip"
                            data-tip="حذف"
                            onClick={() => remove(p)}
                            style={{ color: "var(--danger)" }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })
      )}

      <ProductModal
        open={modal.open}
        product={modal.product}
        suppliers={data?.suppliers ?? []}
        productNames={data?.product_names ?? []}
        onClose={() => setModal({ open: false, product: null })}
        onSaved={() => {
          load();
          refresh();
        }}
      />
    </div>
  );
}

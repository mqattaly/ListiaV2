// برآورد قیمت: بودجه، قیمت واحد، خرید بعدی، جستجوی قیمت زنده
import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  Wallet,
  ArrowLeftCircle,
  ArrowRightCircle,
  Scissors,
  Search,
  Link2,
  TrendingUp,
  ShoppingBasket,
  ExternalLink,
  Eraser,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import { fmtAmount, fmtShort } from "../format.js";
import { BtnSpinner, EmptyState, SkeletonRows, StaggerItem, StaggerList } from "../components/bits.jsx";
import Modal from "../components/Modal.jsx";

export default function Estimate() {
  const { toast, confirm } = useApp();
  const [snap, setSnap] = useState(null);
  const [filter, setFilter] = useState("");
  const [budgetInput, setBudgetInput] = useState("");
  const [priceModal, setPriceModal] = useState(null); // {product}
  const [savingItem, setSavingItem] = useState(null);
  const [budgetBusy, setBudgetBusy] = useState(false);
  const [trimBusy, setTrimBusy] = useState(false);

  const load = useCallback(async (supplierId = filter) => {
    const d = await api
      .get(`/api/estimate${supplierId ? `?supplier_id=${supplierId}` : ""}`)
      .catch(() => null);
    if (d) {
      setSnap(d);
      setBudgetInput(d.budget ?? "");
    }
  }, [filter]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const saveBudget = async () => {
    if (budgetBusy) return;
    setBudgetBusy(true);
    try {
      const d = await api.post("/api/estimate/budget", {
        budget: budgetInput,
        supplier_id: filter || undefined,
      });
      setSnap(d);
      setBudgetInput(d.budget ?? "");
      toast(d.price_unit_note || "سقف بودجه ذخیره شد", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBudgetBusy(false);
    }
  };

  const saveItemField = async (product, patch) => {
    setSavingItem(product.id);
    try {
      // قیمت که پاک شود، لینک هم همراهش پاک می‌شود (سرور هم همین قانون را دارد)
      const body = { ...patch, supplier_id: filter || undefined };
      if ("unit_price" in body && !String(body.unit_price ?? "").trim() && !("price_url" in body)) {
        body.price_url = "";
      }
      const d = await api.post(`/api/estimate/item/${product.id}`, body);
      setSnap(d);
      if (d.price_unit_note) toast(d.price_unit_note, "info");
    } catch (err) {
      toast(err.message, "error");
      load();
    } finally {
      setSavingItem(null);
    }
  };

  const clearPrice = async (product) => {
    if (!product.unit_price && !product.price_url) return;
    setSavingItem(product.id);
    try {
      const d = await api.post(`/api/estimate/item/${product.id}`, { unit_price: "", price_url: "" });
      setSnap(d);
      toast(`قیمت و لینک «${product.product_name}» پاک شد`, "info");
    } catch (err) {
      toast(err.message, "error");
      load();
    } finally {
      setSavingItem(null);
    }
  };

  const moveToNext = async (product, qty) => {
    try {
      const d = await api.post(`/api/estimate/next/${product.id}`, {
        qty: qty ?? undefined,
        supplier_id: filter || undefined,
      });
      setSnap(d);
      toast(`${d.sent_label} عدد به «خرید بعدی» منتقل شد`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const restoreFromNext = async (product) => {
    try {
      const d = await api.post(`/api/estimate/next/${product.id}/restore`, {
        supplier_id: filter || undefined,
      });
      setSnap(d);
      toast(`${d.restored_label} عدد به لیست اصلی برگشت`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const trimToBudget = async () => {
    if (!snap?.over_budget || trimBusy) return;
    const ok = await confirm({
      title: "برش لیست تا سقف بودجه",
      message:
        "از آخر لیست به‌ترتیب، آن‌قدر تعداد به «خرید بعدی» منتقل می‌شود تا جمع برآورد داخل بودجه‌ی شما بنشیند. ادامه می‌دهید؟",
      confirmLabel: "بله، برش بزن",
      danger: false,
    });
    if (!ok) return;
    setTrimBusy(true);
    try {
      const d = await api.post("/api/estimate/trim-to-budget", {
        supplier_id: filter || undefined,
      });
      setSnap(d);
      if (d.moved?.length) {
        toast(
          `${d.moved.length} قلم تعدادش کم شد تا بودجه جا شود: ` +
            d.moved.map((m) => `${m.name} (${m.qty})`).join("، "),
          "success",
          6500
        );
      } else {
        toast("لیست در سقف بودجه جا گرفت", "success");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setTrimBusy(false);
    }
  };

  if (!snap) {
    return (
      <div>
        <div className="skeleton" style={{ height: 130, marginBottom: 20 }} />
        <SkeletonRows rows={4} height={62} />
      </div>
    );
  }

  const progress = Math.min(snap.budget_progress ?? 0, 100);
  const progressState = snap.over_budget ? "danger" : progress > 85 ? "" : "success";

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>
            <Calculator size={21} className="text-gradient" /> برآورد قیمت
          </h2>
          <p className="page-sub">
            قیمت هر قلم را وارد کنید تا جمع کل و وضعیت بودجه‌تان زنده محاسبه شود.
            قیمت‌ها به تومان‌اند؛ اگر مبلغی ریالی است کافی است کلمه‌ی «ریال» را کنارش بنویسید تا خودش تبدیل شود.
          </p>
        </div>
        <div className="page-actions">
          <select className="select" style={{ width: 190 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">همه‌ی تأمین‌کننده‌ها</option>
            {snap.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── کارت بودجه ─── */}
      <motion.div className="card budget-card" layout>
        <div className="bc-top">
          <span className="st-icon grad-1" style={{ width: 52, height: 52, borderRadius: 17, display: "grid", placeItems: "center", background: "linear-gradient(135deg, rgba(99,102,241,.25), rgba(139,92,246,.2))", color: "#a5b4fc" }}>
            <Wallet size={24} />
          </span>
          <div className="bc-total">
            <div className="bc-num mono">{fmtAmount(snap.grand_total) || 0}</div>
            <div className="bc-label">
              جمع برآورد ({snap.priced_items} قلم قیمت‌گذاری‌شده) · تومان
            </div>
          </div>
          <div className="bc-form">
            <input
              className="input mono"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder="سقف بودجه (تومان)…"
              title="به تومان وارد کنید؛ برای مبلغ ریالی، کلمه‌ی «ریال» را کنار عدد بنویسید"
              style={{ direction: "ltr" }}
            />
            <button className="btn" onClick={saveBudget} disabled={budgetBusy}>
              {budgetBusy ? <BtnSpinner size={15} /> : null} ثبت بودجه
            </button>
          </div>
        </div>

        <AnimatePresence>
          {Number(snap.budget) > 0 || snap.budget_label ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-8" style={{ fontSize: 12.5, fontWeight: 700 }}>
                <span className="muted">
                  بودجه: <span className="mono">{snap.budget_label}</span> تومان
                </span>
                {snap.over_budget ? (
                  <span className="badge badge-danger">
                    {fmtAmount(snap.over_by)} تومان over budget
                  </span>
                ) : (
                  <span className="badge badge-success">
                    {fmtAmount(snap.budget_remaining)} تومان باقی‌مانده
                  </span>
                )}
              </div>
              <div className={`progress ${progressState}`}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ type: "spring", stiffness: 80, damping: 20 }}
                />
              </div>
              {snap.over_budget && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-12 mt-12 wrap"
                >
                  <span style={{ fontSize: 12.5, color: "var(--danger)", fontWeight: 700, flex: 1, minWidth: 180 }}>
                    جمع برآورد {fmtAmount(snap.over_by)} تومان از بودجه‌تان بیشتر است.
                  </span>
                  <button className="btn btn-danger" onClick={trimToBudget} disabled={trimBusy}>
                    {trimBusy ? <BtnSpinner size={15} /> : <Scissors size={15} />} برش خودکار تا سقف بودجه
                  </button>
                </motion.div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      {/* ─── اقلام ─── */}
      <h3 style={{ fontSize: 15.5, margin: "24px 0 12px" }}>اقلام لیست ({snap.items.length})</h3>
      {snap.items.length === 0 ? (
        <div className="card">
          <EmptyState
            image="/img/empty-wallet.png"
            title="قلمی برای برآورد نیست"
            text="اول چند خرید فعال ثبت کنید تا بتوانید برایشان برآورد قیمت بزنید."
          />
        </div>
      ) : (
        <StaggerList style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {snap.items.map((p) => (
            <StaggerItem key={p.id}>
              <div className="estimate-row">
                <div className="er-name">
                  {p.product_name}
                  <div className="er-sup">{p.supplier_name}</div>
                </div>
                <span className="er-qty">
                  {p.quantity} {p.unit}
                  {p.qty_per_unit ? <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>×{p.qty_per_unit} در واحد</div> : null}
                </span>
                <div className="flex gap-6 er-prices">
                  <input
                    className="input mono"
                    defaultValue={p.unit_price ?? ""}
                    key={`price-${p.id}-${p.unit_price ?? ""}`}
                    placeholder="قیمت واحد (تومان)"
                    title="به تومان وارد کنید؛ برای مبلغ ریالی، کلمه‌ی «ریال» را کنار عدد بنویسید"
                    style={{ direction: "ltr" }}
                    onBlur={(e) => {
                      if ((e.target.value ?? "") !== (p.unit_price ?? "")) {
                        saveItemField(p, { unit_price: e.target.value });
                      }
                    }}
                  />
                  <input
                    className="input mono"
                    defaultValue={p.qty_per_unit ?? ""}
                    key={`per-${p.id}-${p.qty_per_unit ?? ""}`}
                    placeholder="تعداد در واحد"
                    style={{ direction: "ltr" }}
                    onBlur={(e) => {
                      if ((e.target.value ?? "") !== (p.qty_per_unit ?? "")) {
                        saveItemField(p, { qty_per_unit: e.target.value });
                      }
                    }}
                  />
                </div>
                <div className="flex gap-6 er-actions">
                  <button
                    className="btn btn-sm btn-ghost tip"
                    data-tip="جستجوی قیمت زنده"
                    onClick={() => setPriceModal({ product: p })}
                  >
                    <Search size={14} />
                  </button>
                  <button
                    className="btn btn-sm btn-ghost tip"
                    data-tip="لینک صفحه‌ی قیمت"
                    onClick={() => {
                      const url = prompt("آدرس صفحه‌ی محصول (اختیاری):", p.price_url || "");
                      if (url !== null) saveItemField(p, { price_url: url });
                    }}
                  >
                    <Link2 size={14} />
                  </button>
                  {p.price_url && (
                    <a className="btn btn-sm btn-ghost tip" data-tip="باز کردن لینک" href={p.price_url} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} />
                    </a>
                  )}
                  {(p.unit_price || p.price_url) && (
                    <button
                      className="btn btn-sm btn-ghost tip"
                      data-tip="پاک کردن قیمت و لینک"
                      style={{ color: "var(--danger)" }}
                      onClick={() => clearPrice(p)}
                    >
                      <Eraser size={14} />
                    </button>
                  )}
                </div>
                <span className="er-total mono">
                  {p.row_total_label || "—"}
                  {p.row_total_label ? <small>تومان</small> : null}
                </span>
                <div className="flex gap-6 er-move">
                  <button
                    className="btn btn-sm tip"
                    data-tip="انتقال به خرید بعدی"
                    onClick={() => {
                      const qty = prompt(`چند عدد از «${p.product_name}» به خرید بعدی منتقل شود؟ (خالی = همه)`, "");
                      if (qty !== null) moveToNext(p, qty);
                    }}
                  >
                    <ArrowLeftCircle size={15} />
                  </button>
                </div>
                {savingItem === p.id && (
                  <span className="badge badge-accent" style={{ position: "absolute", top: 8, left: 8 }}>
                    ذخیره…
                  </span>
                )}
              </div>
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      {/* ─── خرید بعدی ─── */}
      <AnimatePresence>
        {snap.next_items.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <h3 style={{ fontSize: 15.5, margin: "28px 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={18} style={{ color: "#67e8f9" }} /> خرید بعدی ({snap.next_items.length})
            </h3>
            <div className="card next-card">
              <StaggerList style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {snap.next_items.map((p) => (
                  <StaggerItem key={p.id}>
                    <div className="product-row">
                      <span className="pr-icon" style={{ background: "var(--cyan-soft)", color: "#67e8f9" }}>
                        <ShoppingBasket size={18} />
                      </span>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div className="pr-name">{p.product_name}</div>
                        <div className="pr-desc">
                          <span className="badge badge-cyan" style={{ padding: "2px 8px", fontSize: 10.5 }}>
                            خرید بعدی
                          </span>
                          <span>{p.supplier_name}</span>
                        </div>
                      </div>
                      <span className="pr-qty">
                        {p.next_qty} {p.unit}
                      </span>
                      <span className="mono" style={{ fontSize: 13.5, fontWeight: 700 }}>
                        {p.next_row_total_label || "—"}
                      </span>
                      <div className="pr-actions">
                        <button
                          className="btn btn-sm tip"
                          data-tip="بازگرداندن به لیست"
                          onClick={() => restoreFromNext(p)}
                        >
                          <ArrowRightCircle size={15} />
                        </button>
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerList>
              <p className="hint-text" style={{ marginTop: 12 }}>
                اقلام «خرید بعدی» از جمع برآورد فعلی کنار گذاشته می‌شوند تا بودجه‌ی امروز جا شود؛ هر
                وقت خواستید برگردانید.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── مودال جستجوی قیمت ─── */}
      <PriceSearchModal
        state={priceModal}
        onClose={() => setPriceModal(null)}
        onPick={(product, result) => {
          setPriceModal(null);
          // قیمت + لینک صفحه‌ی همان نتیجه با هم ذخیره می‌شوند
          saveItemField(product, { unit_price: String(result.price), price_url: result.url || "" });
          toast(`قیمت ${fmtAmount(result.price)} برای «${product.product_name}» ثبت شد`, "success");
        }}
      />
    </div>
  );
}

const JOB_PRESETS = [
  "خدمات نظافت و نظافتچی",
  "کافی‌شاپ",
  "رستوران",
  "قنادی",
  "آرایشگاه",
  "مکانیکی",
  "تعمیرات موبایل",
  "خیاطی",
  "گل‌فروشی",
  "سوپرمارکت",
  "نانوایی",
  "خشکشویی",
  "باغبانی و فضای سبز",
  "ساختمان و نقاشی ساختمان",
  "دفتر کار",
];
const JOB_KEY = "listia-price-job";

function PriceSearchModal({ state, onClose, onPick }) {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [job, setJob] = useState(() => {
    try {
      return localStorage.getItem(JOB_KEY) || "";
    } catch {
      return "";
    }
  });
  const [usedQueries, setUsedQueries] = useState([]);
  const [smartOn, setSmartOn] = useState(false);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(null); // { image, title, x, y }
  const [lightbox, setLightbox] = useState(null); // { image, title } — بزرگ‌نمایی داخل همان صفحه

  useEffect(() => {
    try {
      if (job.trim()) localStorage.setItem(JOB_KEY, job.trim());
      else localStorage.removeItem(JOB_KEY);
    } catch {
      /* ذخیره‌سازی در دسترس نیست */
    }
  }, [job]);

  useEffect(() => {
    if (state?.product) {
      setQ(state.product.product_name);
      setResults(null);
      setError("");
      setZoom(null);
      setLightbox(null);
      setUsedQueries([]);
      setSmartOn(false);
    }
  }, [state]);

  // نمایش نسخه‌ی بزرگ عکس هنگام هاور (شناور کنار نشانگر، بدون بریده‌شدن توسط overflow)
  const zoomPos = (ev) => {
    const W = 260;
    const H = 260;
    const pad = 16;
    let x = ev.clientX + 22;
    if (x + W + pad > window.innerWidth) x = ev.clientX - W - 22;
    x = Math.max(pad, x);
    let y = ev.clientY - H / 2;
    y = Math.max(pad, Math.min(y, window.innerHeight - H - pad));
    return { x, y };
  };
  const showZoom = (r) => (e) => {
    if (!r.image) return;
    setZoom({ image: r.image, title: r.title, ...zoomPos(e) });
  };
  const moveZoom = (e) => {
    if (!zoom) return;
    setZoom((z) => (z ? { ...z, ...zoomPos(e) } : z));
  };
  const hideZoom = () => setZoom(null);

  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError("");
    setResults(null);
    setZoom(null);
    setUsedQueries([]);
    setSmartOn(false);
    try {
      const useSmart = job.trim().length >= 2;
      const url = useSmart
        ? `/api/estimate/search-smart?q=${encodeURIComponent(q.trim())}&job=${encodeURIComponent(job.trim())}`
        : `/api/estimate/search?q=${encodeURIComponent(q.trim())}${source ? `&source=${source}` : ""}`;
      const data = await api.get(url);
      setResults(data);
      setSmartOn(Boolean(useSmart && data.smart));
      if (useSmart) setUsedQueries(data.queries || [q.trim()]);
      if (!data.results?.length && data.errors?.length) {
        setError("از هیچ منبعی نتیجه‌ای نرسید: " + data.errors.slice(0, 2).join(" · "));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(state)}
      onClose={() => {
        hideZoom();
        onClose();
      }}
      size="lg"
      icon={<Search size={19} />}
      title="جستجوی قیمت زنده"
      subtitle={state?.product ? `برای «${state.product.product_name}»` : "از دیجی‌کالا، ترب، باسلام و تعداد بالا"}
    >
      <form onSubmit={search}>
        <div className="flex gap-8 ps-formrow">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام کالا… (مثلاً: تی حوله‌ای)" />
          <select
            className="select"
            style={{ maxWidth: 170 }}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={job.trim().length >= 2}
            title={job.trim().length >= 2 ? "وقتی شغل انتخاب شده، هوش مصنوعی منابع را خودش انتخاب می‌کند" : ""}
          >
            <option value="">همه‌ی منابع</option>
            <option value="digikala">دیجی‌کالا</option>
            <option value="torob">ترب</option>
            <option value="basalam">باسلام</option>
            <option value="tedadbala">تعداد بالا (عمده)</option>
          </select>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <BtnSpinner size={15} /> : job.trim().length >= 2 ? <><Sparkles size={14} /> جستجوی هوشمند</> : "جستجو"}
          </button>
        </div>

        {/* جستجوی شغل‌محور: AI گونه‌ی حرفه‌ای/صنعتیِ همین کالا را در منابع مناسب می‌گردد */}
        <div className="ps-jobrow">
          <span className="ps-jobico" title="جستجوی هوشمند بر اساس شغل">
            <Sparkles size={13} />
          </span>
          <input
            className="input"
            list="listia-job-presets"
            value={job}
            onChange={(e) => {
              setJob(e.target.value);
              if (e.target.value.trim().length < 2) setSource("");
            }}
            placeholder="شغل خود را بنویسید تا جستجو حرفه‌ای شود (مثلاً: خدمات نظافت) — خالی بگذارید برای جستجوی عادی"
            style={{ flex: 1 }}
          />
          {job.trim() && (
            <button type="button" className="btn btn-sm" onClick={() => setJob("")} title="حذف شغل و جستجوی عادی">
              حذف شغل
            </button>
          )}
          <datalist id="listia-job-presets">
            {JOB_PRESETS.map((j) => (
              <option key={j} value={j} />
            ))}
          </datalist>
        </div>
        {job.trim().length >= 2 && (
          <p className="ps-jobhint">
            هوش مصنوعی عبارت «{q.trim() || "کالا"}» را متناسب با شغل «{job.trim()}» بازنویسی می‌کند و خودش
            دیجی‌کالا، ترب، باسلام یا تعداد بالا را برمی‌گزیند.
          </p>
        )}
      </form>

      {smartOn && usedQueries.length > 1 && (
        <div className="ps-queries">
          <Sparkles size={12} />
          {usedQueries.map((u, i) => (
            <span key={i} className="badge">
              {u}
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="auth-alert err" style={{ marginBottom: 0 }}>
          {error}
        </div>
      )}

      {busy && <SkeletonRows rows={3} height={72} />}

      {results && (
        <>
          {results.sources?.some((s) => s.count > 0) && (
            <div className="flex gap-8 wrap">
              {results.sources.map((s) => (
                <span key={s.id} className={`badge ${s.count ? "badge-accent" : ""}`}>
                  {s.label}: {s.count}
                </span>
              ))}
            </div>
          )}
          {results.results.length === 0 && !error && (
            <EmptyState title="قیمتی پیدا نشد" text="عبارت را کلی‌تر بنویسید یا منبع دیگری را امتحان کنید." />
          )}
          {results.results.length > 0 && (
            <StaggerList style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "46vh", overflowY: "auto", paddingLeft: 4 }}>
              {results.results.map((r, i) => (
                <StaggerItem key={i}>
                  <div className="price-result">
                    {r.image ? (
                      <button
                        type="button"
                        className="prc-thumb"
                        title="هاور: پیش‌نمایش بزرگ · کلیک: بزرگ‌نمایی در همین صفحه"
                        onMouseEnter={showZoom(r)}
                        onMouseMove={moveZoom}
                        onMouseLeave={hideZoom}
                        onClick={() => {
                          hideZoom();
                          setLightbox({ image: r.image, title: r.title });
                        }}
                      >
                        <img src={r.image} alt="" loading="lazy" />
                        <span className="prc-zoom-hint"><Search size={11} /></span>
                      </button>
                    ) : (
                      <span className="pr-icon"><ShoppingBasket size={18} /></span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="prc-title">{r.title}</div>
                      <span className="badge" style={{ marginTop: 6 }}>{r.source_label}</span>
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div className="prc-price">{r.price_label}</div>
                      <button className="btn btn-sm btn-primary" style={{ marginTop: 6 }} onClick={() => onPick(state.product, r)}>
                        انتخاب قیمت
                      </button>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </>
      )}

      {zoom && (
        <div
          className="prc-zoom"
          style={{ left: zoom.x, top: zoom.y }}
          onMouseMove={moveZoom}
          onClick={() => setZoom(null)}
        >
          <img src={zoom.image} alt={zoom.title} />
          <div className="prc-zoom-title">{zoom.title}</div>
        </div>
      )}

      {/* بزرگ‌نمایی کامل عکس — داخل همان صفحه، بدون باز شدن تب جدید */}
      <ImageLightbox state={lightbox} onClose={() => setLightbox(null)} />
    </Modal>
  );
}

// لایت‌باکس بزرگ‌نمایی عکس: با انیمیشن باز و بسته می‌شود؛ کلیک بیرون، دکمه یا Esc می‌بندد
function ImageLightbox({ state, onClose }) {
  useEffect(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  return createPortal(
    <AnimatePresence>
      {state && (
        <motion.div
          className="prc-lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.figure
            initial={{ scale: 0.72, opacity: 0, y: 28 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.84, opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <img src={state.image} alt={state.title} draggable={false} />
            {state.title && <figcaption>{state.title}</figcaption>}
            <button type="button" className="prc-lightbox-close" onClick={onClose} aria-label="بستن">
              <X size={16} />
            </button>
          </motion.figure>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

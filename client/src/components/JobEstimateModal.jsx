// مودال «برآورد هوشمند بر اساس شغل»
// مرحله ۱: شغل را می‌گیرد و با AI فهرست اقلام می‌سازد
// مرحله ۲: کاربر فهرست را ویرایش/تأیید می‌کند
// مرحله ۳: سرور برای هر قلم از منابع پیشنهادی AI قیمت واقعی می‌گیرد (خطای قلم ایزوله است)
// مرحله ۴: افزودن گروهی اقلام انتخاب‌شده به لیست خرید یک تأمین‌کننده
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Search, Store, Wand2, ShoppingBasket, ExternalLink, AlertCircle, ChevronLeft } from "lucide-react";
import { api } from "../api.js";
import Modal from "./Modal.jsx";
import { BtnSpinner } from "./bits.jsx";
import { fmtAmount } from "../format.js";

const UNITS = ["عدد", "بسته", "کارتن", "گونی", "کیلو"];

const JOB_CHIPS = [
  "آرایشگاه زنانه",
  "آرایشگاه مردانه",
  "کافی‌شاپ",
  "رستوران",
  "نانوایی",
  "مکانیکی",
  "تعمیرات موبایل",
  "خیاطی",
  "گل‌فروشی",
  "سوپرمارکت",
  "قنادی",
  "خشکشویی",
];

const PROGRESS_LINES = [
  "هوش مصنوعی فهرست اقلام را آماده کرد؛ حالا سرور در بازار می‌گردد…",
  "در حال جست‌وجوی دیجی‌کالا، ترب، باسلام و تعداد بالا…",
  "اگر یک منبع خطا بدهد، خودش سراغ منبع بعدی می‌رود…",
  "ارزان‌ترین قیمت برای هر قلم انتخاب می‌شود…",
  "کمی صبر کنید، قیمت‌ها زنده و واقعی‌اند…",
];

export default function JobEstimateModal({ open, onClose, suppliers, supplierId, onImported, onManualSearch }) {
  const [step, setStep] = useState("form"); // form | plan | price
  const [job, setJob] = useState("");
  const [note, setNote] = useState("");
  const [supId, setSupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [items, setItems] = useState([]);
  const [rows, setRows] = useState(null);
  const [picked, setPicked] = useState({});
  const [includeUnpriced, setIncludeUnpriced] = useState(false);
  const [progressLine, setProgressLine] = useState(0);
  const progressTimer = useRef(null);

  useEffect(() => {
    if (open) {
      setStep("form");
      setJob("");
      setNote("");
      setError("");
      setItems([]);
      setRows(null);
      setPicked({});
      setIncludeUnpriced(false);
      setSupId(supplierId || "");
    }
  }, [open, supplierId]);

  useEffect(() => () => clearInterval(progressTimer.current), []);

  const makePlan = async (e) => {
    e?.preventDefault();
    if (!job.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await api.post("/api/estimate/ai-plan", { job: job.trim(), note: note.trim() });
      const list = (d.items || []).map((it, i) => ({ ...it, checked: true, key: i }));
      setItems(list);
      setPlanTitle(d.title || "");
      setStep("plan");
    } catch (err) {
      setError(
        err.status === 503
          ? "سرویس هوش مصنوعی هنوز روی این سرور فعال نیست (کلید CHABOKAN_AI_API_KEY ست نشده)."
          : err.message
      );
    } finally {
      setBusy(false);
    }
  };

  const updateItem = (i, patch) =>
    setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const removeItem = (i) => setItems((list) => list.filter((_, j) => j !== i));

  const runPrices = async () => {
    const chosen = items.filter((it) => it.checked);
    if (!chosen.length || busy) return;
    setBusy(true);
    setError("");
    setProgressLine(0);
    progressTimer.current = setInterval(() => {
      setProgressLine((n) => (n + 1) % PROGRESS_LINES.length);
    }, 1800);
    try {
      const d = await api.post("/api/estimate/ai-price", { items: chosen });
      setRows(d.rows);
      const initialPicked = {};
      d.rows.forEach((r, i) => {
        initialPicked[i] = r.status === "priced";
      });
      setPicked(initialPicked);
      setStep("price");
    } catch (err) {
      setError(err.message);
    } finally {
      clearInterval(progressTimer.current);
      setBusy(false);
    }
  };

  const selectedRows = useMemo(
    () => (rows || []).filter((r, i) => picked[i] && (r.status === "priced" || includeUnpriced)),
    [rows, picked, includeUnpriced]
  );
  const selectedTotal = selectedRows.reduce((s, r) => s + r.row_total, 0);
  const selectedCount = selectedRows.length;

  const doImport = async () => {
    if (!supId) {
      setError("اول تأمین‌کننده‌ی مقصد را انتخاب کنید تا اقلام زیرمجموعه‌ی آن ساخته شوند.");
      return;
    }
    if (!selectedRows.length || importing) return;
    setImporting(true);
    setError("");
    try {
      const payloadItems = selectedRows.map((r) => ({
        name: r.name,
        qty: r.qty,
        unit: r.unit,
        price: r.result?.price ?? 0,
        url: r.result?.url ?? "",
      }));
      const d = await api.post("/api/estimate/ai-import", { supplier_id: supId, items: payloadItems });
      onImported?.(d);
      onClose();
    } catch (err) {
      setError(err.license_locked ? err.message : err.message);
    } finally {
      setImporting(false);
    }
  };

  const subtitle =
    step === "form"
      ? "شغل را بگویید؛ AI اقلام و منبع جست‌وجوی هرکدام را تعیین می‌کند"
      : step === "plan"
        ? planTitle || "فهرست پیشنهادی را مرور و ویرایش کنید"
        : "قیمت‌های زنده‌ی بازار برای اقلام فهرست";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={<Sparkles size={19} />}
      title="برآورد هوشمند بر اساس شغل"
      subtitle={subtitle}
    >
      {/* ─── مرحله ۱: ورود شغل ─── */}
      {step === "form" && (
        <form onSubmit={makePlan}>
          <label className="je-label">شغل / حرفه / کسب‌وکار</label>
          <input
            className="input"
            autoFocus
            value={job}
            onChange={(e) => setJob(e.target.value)}
            placeholder="مثلاً: آرایشگاه زنانه، کافی‌شاپ، مکانیکی…"
            maxLength={120}
          />
          <div className="je-chips">
            {JOB_CHIPS.map((c) => (
              <button
                type="button"
                key={c}
                className={`je-chip ${job === c ? "on" : ""}`}
                onClick={() => setJob(c)}
              >
                {c}
              </button>
            ))}
          </div>

          <label className="je-label" style={{ marginTop: 12 }}>
            توضیح یا مقیاس کار <span className="muted">(اختیاری)</span>
          </label>
          <textarea
            className="input"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثلاً: یک مغازه‌ی کوچک تازه‌تأسیس، خرید اولیه برای ۵۰ مشتری در روز…"
            maxLength={300}
            style={{ resize: "vertical" }}
          />

          {error && <div className="auth-alert err" style={{ marginTop: 12 }}>{error}</div>}

          <div className="je-foot">
            <span className="hint-text je-hint">
              <Wand2 size={13} /> قیمت‌ها مستقیم از سایت‌های بازار و قابل‌کلیک‌اند؛ AI قیمت حدسی نمی‌زند.
            </span>
            <button className="btn btn-primary" type="submit" disabled={busy || job.trim().length < 2}>
              {busy ? <BtnSpinner size={15} /> : <Sparkles size={15} />} ساخت فهرست
            </button>
          </div>
        </form>
      )}

      {/* ─── مرحله ۲: مرور فهرست ─── */}
      {step === "plan" && (
        <>
          <div className="je-list">
            {items.map((it, i) => (
              <div key={i} className={`je-plan-row ${it.checked ? "" : "off"}`}>
                <button
                  type="button"
                  className={`je-check ${it.checked ? "on" : ""}`}
                  onClick={() => updateItem(i, { checked: !it.checked })}
                  aria-label="انتخاب"
                >
                  {it.checked ? "✓" : ""}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    className="input je-name-input"
                    value={it.name}
                    onChange={(e) => updateItem(i, { name: e.target.value })}
                  />
                  {it.why && <div className="je-why">{it.why}</div>}
                  <div className="je-srcs">
                    {it.sources.map((s) => (
                      <span key={s} className="badge">
                        {SOURCE_FA[s]}
                      </span>
                    ))}
                  </div>
                </div>
                <input
                  className="input je-qty"
                  type="number"
                  min={1}
                  max={50}
                  value={it.qty}
                  onChange={(e) => updateItem(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                  style={{ direction: "ltr" }}
                />
                <select className="select je-unit" value={it.unit} onChange={(e) => updateItem(i, { unit: e.target.value })}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-sm je-del" onClick={() => removeItem(i)} title="حذف قلم">
                  ✕
                </button>
              </div>
            ))}
          </div>

          {error && <div className="auth-alert err" style={{ marginTop: 12 }}>{error}</div>}

          <div className="je-foot">
            <button className="btn" type="button" onClick={() => setStep("form")} disabled={busy}>
              بازگشت
            </button>
            <button className="btn btn-primary" type="button" onClick={runPrices} disabled={busy || !items.some((x) => x.checked)}>
              {busy ? <BtnSpinner size={15} /> : <Search size={15} />}
              جستجوی قیمت {items.filter((x) => x.checked).length} قلم در بازار
            </button>
          </div>
        </>
      )}

      {/* ─── مرحله ۳: نتایج قیمت ─── */}
      {step === "price" && (
        <>
          {busy ? (
            <div className="je-busy">
              <div className="je-spin">
                <Search size={26} />
              </div>
              <div className="je-busy-line">{PROGRESS_LINES[progressLine]}</div>
              <SlimBars />
            </div>
          ) : (
            <>
              <div className="je-list">
                {rows.map((r, i) => {
                  const on = Boolean(picked[i]);
                  return (
                    <div key={i} className={`price-result je-price-row ${on ? "" : "off"}`}>
                      <button
                        type="button"
                        className={`je-check ${on ? "on" : ""}`}
                        onClick={() => setPicked((p) => ({ ...p, [i]: !p[i] }))}
                        aria-label="انتخاب"
                      >
                        {on ? "✓" : ""}
                      </button>
                      {r.result?.image ? (
                        <a className="prc-thumb je-thumb" href={r.result.image} target="_blank" rel="noreferrer">
                          <img src={r.result.image} alt="" loading="lazy" />
                        </a>
                      ) : (
                        <span className="pr-icon">
                          <ShoppingBasket size={18} />
                        </span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="prc-title">
                          {r.result ? (
                            <a href={r.result.url} target="_blank" rel="noreferrer" className="je-link">
                              {r.result.title}
                              <ExternalLink size={11} style={{ marginInlineStart: 3, flexShrink: 0 }} />
                            </a>
                          ) : (
                            r.name
                          )}
                        </div>
                        <div className="flex gap-6 wrap" style={{ marginTop: 4, alignItems: "center" }}>
                          <span className="badge">{r.result?.source_label || "—"}</span>
                          <span className="muted je-qty-label">
                            {r.qty} {r.unit}
                          </span>
                          {r.alternatives?.length > 0 && (
                            <span className="muted je-qty-label">+{r.alternatives.length} قیمت دیگر</span>
                          )}
                          {r.status === "none" && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => {
                                onManualSearch?.(r.name);
                                onClose();
                              }}
                            >
                              جستجوی دستی
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: "left" }}>
                        {r.result ? (
                          <>
                            <div className="prc-price">{r.result.price_label}</div>
                            <div className="je-rowtotal mono">جمع: {fmtAmount(r.row_total)}</div>
                          </>
                        ) : (
                          <span className="badge badge-danger je-none">
                            <AlertCircle size={12} /> قیمتی پیدا نشد
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <label className="je-unpriced">
                <input
                  type="checkbox"
                  checked={includeUnpriced}
                  onChange={(e) => setIncludeUnpriced(e.target.checked)}
                />
                اقلام بدون قیمت هم به لیست اضافه شوند (بعداً دستی قیمت می‌زنم)
              </label>

              {error && <div className="auth-alert err" style={{ marginTop: 10 }}>{error}</div>}

              <div className="je-importbar">
                <div className="je-sup">
                  <Store size={15} />
                  <select className="select" value={supId} onChange={(e) => setSupId(e.target.value)}>
                    <option value="">انتخاب تأمین‌کننده‌ی مقصد…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="je-totalbox">
                  <div className="je-total-num mono">{fmtAmount(selectedTotal)} تومان</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    جمع {selectedCount} قلم انتخاب‌شده
                  </div>
                </div>
                <button className="btn" type="button" onClick={() => setStep("plan")} disabled={importing}>
                  ویرایش فهرست
                </button>
                <button className="btn btn-primary" type="button" onClick={doImport} disabled={importing || !selectedCount}>
                  {importing ? <BtnSpinner size={15} /> : <ChevronLeft size={15} />}
                  افزودن به لیست
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

const SOURCE_FA = {
  digikala: "دیجی‌کالا",
  torob: "ترب",
  basalam: "باسلام",
  tedadbala: "تعداد بالا",
};

function SlimBars() {
  return (
    <div className="je-bars">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ animationDelay: `${i * 0.14}s` }} />
      ))}
    </div>
  );
}

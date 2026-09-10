// جستجوی سراسری محصولات و تأمین‌کننده‌ها
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search as SearchIcon, Store, ShoppingCart, Archive } from "lucide-react";
import { api } from "../api.js";
import { EmptyState, SkeletonRows, StaggerItem, StaggerList } from "../components/bits.jsx";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // ترکیب Ctrl+K برای پرش به جستجو
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const d = await api.get(`/api/search?q=${encodeURIComponent(term)}`).catch(() => null);
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    }, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const hasResults = data && (data.results.length > 0 || data.suppliers.length > 0);

  return (
    <div>
      <div className="search-hero">
        <h2>
          <SearchIcon size={24} className="text-gradient" /> جستجو
        </h2>
        <div className="search-bar">
          <input
            ref={inputRef}
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="نام محصول یا تأمین‌کننده…"
          />
          {q && (
            <button className="btn btn-ghost" onClick={() => setQ("")}>
              پاک کردن
            </button>
          )}
        </div>
      </div>

      {loading && <SkeletonRows rows={3} height={54} />}

      {!loading && q.trim().length >= 2 && !hasResults && (
        <div className="card">
          <EmptyState
            image="/img/empty-search.png"
            title="نتیجه‌ای پیدا نشد"
            text={`چیزی مطابق «${q.trim()}» بین خریدها و تأمین‌کننده‌های شما نیست.`}
          />
        </div>
      )}

      {hasResults && (
        <>
          {data.suppliers.length > 0 && (
            <>
              <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>تأمین‌کننده‌ها</h3>
              <StaggerList className="supplier-grid" style={{ marginBottom: 26 }}>
                {data.suppliers.map((s) => (
                  <StaggerItem key={s.id}>
                    <Link to={`/supplier/${s.id}`} className="card card-hover supplier-card" style={{ display: "block" }}>
                      <div className="sc-top">
                        <span className="sc-icon">
                          <Store size={20} />
                        </span>
                        <h4>{s.name}</h4>
                      </div>
                      <div className="sc-count">{s.active_count}</div>
                      <div className="sc-count-label">قلم خرید فعال</div>
                    </Link>
                  </StaggerItem>
                ))}
              </StaggerList>
            </>
          )}

          {data.results.length > 0 && (
            <>
              <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>محصولات</h3>
              <StaggerList style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.results.map((p) => (
                  <StaggerItem key={p.id}>
                    <Link to={`/supplier/${p.supplier_id}?highlight=${p.id}`} className="product-row" style={{ textDecoration: "none" }}>
                      <span className="pr-icon" style={p.ordered ? { background: "var(--success-soft)", color: "var(--success)" } : undefined}>
                        {p.ordered ? <Archive size={17} /> : <ShoppingCart size={18} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div className="pr-name">{p.product_name}</div>
                        <div className="pr-desc">
                          <span className="badge" style={{ padding: "2px 8px", fontSize: 10.5 }}>
                            {p.supplier_name}
                          </span>
                          {p.ordered && (
                            <span className="badge badge-success" style={{ padding: "2px 8px", fontSize: 10.5 }}>
                              بایگانی {p.ordered_date_label ?? ""}
                            </span>
                          )}
                          {p.owner_username && <span className="badge badge-cyan" style={{ padding: "2px 8px", fontSize: 10.5 }}>از {p.owner_display}</span>}
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
            </>
          )}
        </>
      )}

      {q.trim().length < 2 && (
        <div className="card">
          <EmptyState
            image="/img/empty-search.png"
            title="جستجو در همه‌چیز"
            text="حداقل دو حرف بنویسید تا بین محصولات فعال و بایگانی و تأمین‌کننده‌ها جستجو شود. (Ctrl+K)"
          />
        </div>
      )}
    </div>
  );
}

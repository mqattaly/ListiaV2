// پوسته‌ی اپ: ساید‌بار، نوار بالا، منوی کاربر، تم، ترنزیشن صفحه
import React, { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  ShoppingCart,
  Store,
  Search,
  Calculator,
  Upload,
  UserRound,
  ShieldCheck,
  LogOut,
  ShoppingBasket,
  Moon,
  SunMedium,
  ChevronLeft,
  Gem,
  Crown,
  Plus,
  Clock,
  Menu,
} from "lucide-react";
import { useApp } from "../context/AppContext.jsx";
import { api, saveSessionToken } from "../api.js";
import { initials, APP_VERSION } from "../format.js";
import { AnimatedNumber } from "./bits.jsx";

function AuroraBackground() {
  return (
    <div className="aurora-bg" aria-hidden="true">
      <div className="aurora-blob b1" />
      <div className="aurora-blob b2" />
      <div className="aurora-blob b3" />
    </div>
  );
}

const NAV_MAIN = [
  { to: "/", icon: LayoutDashboard, label: "داشبورد", end: true },
  { to: "/purchases", icon: ShoppingCart, label: "خریدهای فعال" },
  { to: "/suppliers", icon: Store, label: "تأمین‌کننده‌ها" },
  { to: "/estimate", icon: Calculator, label: "برآورد قیمت" },
  { to: "/search", icon: Search, label: "جستجو" },
];
const NAV_TOOLS = [
  { to: "/import", icon: Upload, label: "ایمپورت اکسل" },
  { to: "/account", icon: UserRound, label: "حساب کاربری" },
];

function SidebarLink({ to, icon: Icon, label, end, count }) {
  return (
    <NavLink to={to} end={end} className="nav-item">
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-pill"
              className={isActive ? "nav-glow" : "nav-pill"}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
          <span>{label}</span>
          {count > 0 && <span className="nav-count">{count}</span>}
        </>
      )}
    </NavLink>
  );
}

function UserMenu() {
  const { user, theme, setTheme, toast } = useApp();
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const logout = async () => {
    saveSessionToken(null);
    try {
      await api.post("/api/auth/logout");
    } catch { /* ignore */ }
    toast("خارج شدید. به سلامت 👋", "info");
    window.location.href = "/login";
  };

  return (
    <div style={{ position: "relative" }} ref={popRef}>
      <button className="user-menu-btn" onClick={() => setOpen((v) => !v)}>
        <span className="avatar" style={{ width: 34, height: 34, borderRadius: 11 }}>
          {initials(user)}
        </span>
        <span style={{ textAlign: "right" }}>
          <span className="um-name">{user?.full_name ?? user?.username}</span>
          <span className="um-sub" style={{ display: "block" }}>
            {user?.is_admin ? "مدیر سامانه" : user?.is_licensed ? "نسخه پرو" : "نسخه آزمایشی"}
          </span>
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="user-pop"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 480, damping: 32 }}
          >
            <div className="up-head">
              <div style={{ fontSize: 14, fontWeight: 800 }}>{user?.full_name}</div>
              <div className="um-sub" style={{ direction: "ltr", textAlign: "left", fontSize: 11 }}>
                @{user?.username}
              </div>
            </div>
            <button className="up-item" onClick={() => { setOpen(false); navigate("/account"); }}>
              <UserRound size={17} /> حساب کاربری و لایسنس
            </button>
            {user?.is_admin && (
              <button className="up-item" onClick={() => { setOpen(false); navigate("/admin"); }}>
                <ShieldCheck size={17} /> پنل مدیریت
              </button>
            )}
            <button
              className="up-item"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <SunMedium size={17} /> : <Moon size={17} />}
              {theme === "dark" ? "تم روشن" : "تم تیره"}
            </button>
            <button className="up-item danger" onClick={logout}>
              <LogOut size={17} /> خروج از حساب
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LicenseChip() {
  const { limits, user } = useApp();
  if (!limits) return null;
  const licensed = limits.is_licensed;
  return (
    <NavLink to="/account" className={`license-chip ${licensed ? "pro" : "free"}`}>
      <span className="lc-icon">{licensed ? <Crown size={17} /> : <Gem size={17} />}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="lc-title">{licensed ? "لایسنس فعال" : "نسخه آزمایشی"}</span>
        <span className="lc-sub" style={{ display: "block" }}>
          {licensed
            ? limits.is_lifetime
              ? "مادام‌العمر"
              : `${limits.remaining_days} روز باقی‌مانده`
            : `${limits.product_count}/${limits.max_products} محصول`}
        </span>
      </span>
      <ChevronLeft size={15} style={{ color: "var(--text-3)" }} />
    </NavLink>
  );
}

function Sidebar({ activeCount }) {
  return (
    <aside className="sidebar">
      <NavLink to="/" className="brand">
        <span className="brand-logo">
          <ShoppingBasket size={23} strokeWidth={2.2} />
        </span>
        <span>
          <h1>لیستیا</h1>
          <span className="brand-sub">مدیریت هوشمند خرید</span>
        </span>
      </NavLink>

      <div className="nav-section">منوی اصلی</div>
      {NAV_MAIN.map((item) => (
        <SidebarLink key={item.to} {...item} count={item.to === "/purchases" ? activeCount : 0} />
      ))}
      <div className="nav-section">ابزارها</div>
      {NAV_TOOLS.map((item) => (
        <SidebarLink key={item.to} {...item} />
      ))}

      <div className="sidebar-foot">
        <LicenseChip />
        <div
          style={{
            textAlign: "center",
            fontSize: 10,
            color: "var(--text-3)",
            fontWeight: 700,
            direction: "ltr",
          }}
        >
          Listia v{APP_VERSION}
        </div>
      </div>
    </aside>
  );
}

function BottomNav({ activeCount }) {
  const { user } = useApp();
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className="bn-item">
        {({ isActive }) => (
          <>
            <LayoutDashboard size={21} strokeWidth={isActive ? 2.4 : 2} />
            داشبورد
          </>
        )}
      </NavLink>
      <NavLink to="/purchases" className="bn-item">
        {({ isActive }) => (
          <>
            <ShoppingCart size={21} strokeWidth={isActive ? 2.4 : 2} />
            خریدها {activeCount > 0 && <span className="nav-count">{activeCount}</span>}
          </>
        )}
      </NavLink>
      <NavLink to="/purchases?add=1" className="bn-item bn-add">
        <span className="bn-add-circle">
          <Plus size={24} strokeWidth={2.6} />
        </span>
        ثبت
      </NavLink>
      <NavLink to="/estimate" className="bn-item">
        {({ isActive }) => (
          <>
            <Calculator size={21} strokeWidth={isActive ? 2.4 : 2} />
            برآورد
          </>
        )}
      </NavLink>
      <NavLink to={user?.is_admin ? "/admin" : "/account"} className="bn-item">
        {({ isActive }) => (
          <>
            {user?.is_admin ? <ShieldCheck size={21} strokeWidth={isActive ? 2.4 : 2} /> : <UserRound size={21} strokeWidth={isActive ? 2.4 : 2} />}
            {user?.is_admin ? "مدیریت" : "حساب"}
          </>
        )}
      </NavLink>
    </nav>
  );
}

const TITLES = {
  "/": "داشبورد",
  "/purchases": "خریدهای فعال",
  "/suppliers": "تأمین‌کننده‌ها",
  "/estimate": "برآورد قیمت",
  "/search": "جستجو",
  "/import": "ایمپورت از اکسل",
  "/account": "حساب کاربری",
  "/admin": "پنل مدیریت",
};

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, theme, setTheme, activeCount = 0 } = useApp();
  const title = TITLES[location.pathname] ?? "لیستیا";

  return (
    <>
      <AuroraBackground />
      <div className="app-shell">
        <Sidebar activeCount={activeCount} />
        <div className="main-col">
          {/* ─── نوار بالا (دسکتاپ) ─── */}
          <header className="topbar">
            <div className="page-title">{title}</div>
            <button
              className="topbar-search"
              onClick={() => navigate("/search")}
              aria-label="جستجو"
            >
              <Search size={16} />
              <span>جستجوی محصول یا تأمین‌کننده…</span>
              <kbd>Ctrl K</kbd>
            </button>
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-icon btn-ghost tip"
              data-tip={theme === "dark" ? "تم روشن" : "تم تیره"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <SunMedium size={19} /> : <Moon size={19} />}
            </button>
            <UserMenu />
          </header>

          {/* ─── نوار بالا (موبایل) ─── */}
          <header className="mobile-topbar">
            <span className="brand-logo" style={{ width: 38, height: 38, borderRadius: 12 }}>
              <ShoppingBasket size={19} />
            </span>
            <span className="mt-title">{title}</span>
            <button
              className="btn btn-icon btn-ghost"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <SunMedium size={19} /> : <Moon size={19} />}
            </button>
          </header>

          {/* ─── محتوا با ترنزیشن ─── */}
          <main className="page-scroll">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 18, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.995 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <BottomNav activeCount={activeCount} />
      </div>
    </>
  );
}

// روتینگ اصلی + محافظت از مسیرها (صفحه‌ها با lazy load جدا تکه‌بندی می‌شوند)
import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "./context/AppContext.jsx";
import Layout from "./components/Layout.jsx";
import { ShoppingBasket } from "lucide-react";

const AuthPage = lazy(() => import("./pages/AuthPage.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Purchases = lazy(() => import("./pages/Purchases.jsx"));
const Suppliers = lazy(() => import("./pages/Suppliers.jsx"));
const SupplierDetail = lazy(() => import("./pages/SupplierDetail.jsx"));
const SearchPage = lazy(() => import("./pages/SearchPage.jsx"));
const Estimate = lazy(() => import("./pages/Estimate.jsx"));
const ImportPage = lazy(() => import("./pages/ImportPage.jsx"));
const Account = lazy(() => import("./pages/Account.jsx"));
const Admin = lazy(() => import("./pages/Admin.jsx"));

function BootSplash() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div className="aurora-bg">
        <div className="aurora-blob b1" />
        <div className="aurora-blob b2" />
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ textAlign: "center" }}
      >
        <motion.span
          className="brand-logo"
          style={{ width: 74, height: 74, borderRadius: 24, margin: "0 auto 18px", display: "grid", placeItems: "center", background: "var(--accent-grad)", color: "#fff", boxShadow: "0 14px 44px rgba(99,102,241,.45)" }}
          animate={{ y: [0, -8, 0] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
        >
          <ShoppingBasket size={34} strokeWidth={2} />
        </motion.span>
        <div style={{ fontWeight: 800, fontSize: 20 }}>لیستیا</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>در حال آماده‌سازی…</div>
      </motion.div>
    </div>
  );
}

function Protected({ children }) {
  const { user, booting } = useApp();
  const location = useLocation();
  if (booting) return <BootSplash />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, booting } = useApp();
  if (booting) return <BootSplash />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function NotFound() {
  return (
    <div className="card">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
      >
        <EmptyState404 />
      </motion.div>
    </div>
  );
}

function EmptyState404() {
  return (
    <div className="empty-state">
      <div className="empty-img loaded" style={{ width: 190, height: 190 }}>
        <img src="/img/empty-search.png" alt="صفحه پیدا نشد" loading="lazy" />
      </div>
      <h2 style={{ fontSize: 40 }} className="text-gradient mono">404</h2>
      <p className="muted" style={{ margin: "10px 0 20px" }}>این صفحه در لیستیا وجود ندارد.</p>
    </div>
  );
}

export default function App() {
  const { user } = useApp();
  return (
    <Suspense fallback={<BootSplash />}>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <AuthPage />
            </GuestOnly>
          }
        />
        <Route
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/supplier/:id" element={<SupplierDetail />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/estimate" element={<Estimate />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/account" element={<Account />} />
          <Route
            path="/admin"
            element={user?.is_admin ? <Admin /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

// مرز خطای رندر — به‌جای صفحه‌ی خالی، کارت بازیابی نشان می‌دهد
import React from "react";
import { motion } from "framer-motion";
import { TriangleAlert, RotateCcw, House } from "lucide-react";

export default class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("خطای رندر صفحه:", error);
  }

  componentDidUpdate(prevProps) {
    // با عوض شدن صفحه، خطای قبلی ریست شود
    if (prevProps.pageKey !== this.props.pageKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        style={{ textAlign: "center", padding: "52px 24px" }}
      >
        <motion.span
          className="empty-icon"
          style={{ margin: "0 auto 18px", background: "var(--warning-soft)", color: "var(--warning)" }}
          animate={{ rotate: [0, -8, 8, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
        >
          <TriangleAlert size={30} />
        </motion.span>
        <h3 style={{ marginBottom: 8 }}>این صفحه موقتاً به مشکل خورد</h3>
        <p className="muted" style={{ fontSize: 13, lineHeight: 2, maxWidth: 380, margin: "0 auto 20px" }}>
          چیزی اشتباه شد، ولی اطلاعات شما امن است. با تلاش دوباره معمولاً درست می‌شود.
        </p>
        <div className="flex gap-10" style={{ justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
            <RotateCcw size={16} /> تلاش دوباره
          </button>
          <button className="btn" onClick={() => (window.location.href = "/")}>
            <House size={16} /> بازگشت به داشبورد
          </button>
        </div>
      </motion.div>
    );
  }
}

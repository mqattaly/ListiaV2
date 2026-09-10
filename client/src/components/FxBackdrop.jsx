// پس‌زمینه‌ی زنده‌ی ویدیویی: ذرات شناور + رگه‌های نور — سبک و کم‌مصرف
// (با احترام به prefers-reduced-motion و توقف خودکار وقتی تب مخفی است)
import React, { useEffect, useRef } from "react";

const COLORS = [
  [99, 102, 241], // indigo
  [139, 92, 246], // violet
  [34, 211, 238], // cyan
  [52, 211, 153], // mint
];

export default function FxBackdrop({ density = 1 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const count = Math.round(Math.min(90, Math.max(28, (w * h) / 26000)) * density);
    const parts = Array.from({ length: count }, () => spawn(true));

    function spawn(anywhere) {
      const c = COLORS[(Math.random() * COLORS.length) | 0];
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : h + 12,
        r: 0.8 + Math.random() * 2.4,
        vy: -(0.12 + Math.random() * 0.5),
        vx: (Math.random() - 0.5) * 0.22,
        a: 0.12 + Math.random() * 0.4,
        tw: Math.random() * Math.PI * 2,
        ts: 0.008 + Math.random() * 0.03,
        c,
      };
    }

    // چند رگه‌ی نورِ مورب که گاهی رد می‌شوند
    const streaks = Array.from({ length: 3 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      len: 90 + Math.random() * 130,
      speed: 0.0011 + Math.random() * 0.0016,
      a: 0.05 + Math.random() * 0.07,
      c: COLORS[(i + 1) % COLORS.length],
      w: 1 + Math.random() * 1.4,
    }));

    const onVis = () => {
      running = document.visibilityState === "visible";
      if (running) loop();
    };
    document.addEventListener("visibilitychange", onVis);

    function loop() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);

      for (const s of streaks) {
        s.x -= s.speed;
        s.y += s.speed * 0.45;
        if (s.x < -0.25) {
          s.x = 1.15;
          s.y = Math.random();
        }
        const x0 = s.x * w;
        const y0 = s.y * h;
        const grad = ctx.createLinearGradient(x0, y0, x0 - s.len, y0 - s.len * 0.45);
        const [r, g, b] = s.c;
        grad.addColorStop(0, `rgba(${r},${g},${b},${s.a})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = s.w;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 - s.len, y0 - s.len * 0.45);
        ctx.stroke();
      }

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.tw += p.ts;
        p.x += p.vx + Math.sin(p.tw * 0.7) * 0.08;
        p.y += p.vy;
        if (p.y < -12 || p.x < -12 || p.x > w + 12) parts[i] = spawn(false);
        const alpha = p.a * (0.55 + 0.45 * Math.sin(p.tw));
        const [r, g, b] = p.c;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        glow.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.75, alpha + 0.2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(loop);
    }
    loop();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [density]);

  return <canvas ref={ref} className="fx-canvas" aria-hidden="true" />;
}

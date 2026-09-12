// ─── پشتیبانی هوش مصنوعی (چت‌بات چابکان) ───────────────────────────────────
import { Router } from "express";
import { aiConfigured, aiModels, supportChat } from "../lib/aiSupport.js";
import { rateCheck, tooMany, requestIP } from "../lib/auth.js";

const router = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// وضعیت فعال‌بودن دستیار (فرانت قبل از باز کردن پنل چک می‌کند)
router.get("/support/status", (req, res) => {
  const models = aiConfigured() ? aiModels() : [];
  res.json({
    success: true,
    enabled: aiConfigured(),
    model: models[0] || null,
    fallback_model: models[1] || null,
  });
});

// گفتگو: { message, history: [{role, content}, ...] }
router.post(
  "/support/chat",
  ah(async (req, res) => {
    const body = req.body ?? {};
    const ip = requestIP(req);
    // سقف مصرف: ۲۰ پیام در دقیقه برای هر کاربر و ۴۰ برای هر IP
    if (
      !rateCheck("aisupport", `user:${req.user.id}`, 20, 60_000) ||
      !rateCheck("aisupport", `ip:${ip}`, 40, 60_000)
    ) {
      return tooMany(res, "تعداد پیام‌ها در این دقیقه زیاد است؛ کمی بعد دوباره بفرستید.");
    }

    const message = String(body.message ?? "").trim();
    if (!message) return res.status(400).json({ success: false, message: "متن پرسش را بنویسید." });
    if (message.length > 1500) {
      return res.status(400).json({ success: false, message: "پیام بیش از حد طولانی است (حداکثر ۱۵۰۰ کاراکتر)." });
    }

    try {
      const { reply } = await supportChat({ message, history: Array.isArray(body.history) ? body.history : [] });
      res.json({ success: true, reply });
    } catch (err) {
      const status = err.status || 502;
      res.status(status).json({ success: false, message: err.message || "خطا در دریافت پاسخ." });
    }
  })
);

export default router;

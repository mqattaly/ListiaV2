// پنل مدیریت: کاربران، لایسنس‌ها، تولید کلید
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Search,
  Crown,
  Trash2,
  Pencil,
  KeyRound,
  Wand2,
  Copy,
  UserCog,
} from "lucide-react";
import { api } from "../api.js";
import { useApp } from "../context/AppContext.jsx";
import { SkeletonRows, StaggerItem, StaggerList, EmptyState } from "../components/bits.jsx";
import Modal from "../components/Modal.jsx";

export default function Admin() {
  const { toast, confirm, user: me } = useApp();
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [licenseUser, setLicenseUser] = useState(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);

  const load = useCallback(async () => {
    const d = await api.get("/api/admin/users").catch(() => null);
    if (d) setData(d);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const users = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data?.users ?? [];
    return (data?.users ?? []).filter(
      (u) =>
        u.username.toLowerCase().includes(term) ||
        (u.full_name ?? "").toLowerCase().includes(term) ||
        (u.email ?? "").toLowerCase().includes(term)
    );
  }, [data, q]);

  const removeUser = async (u) => {
    const ok = await confirm({
      title: "حذف کاربر",
      message: `حساب «${u.username}» با همه‌ی تأمین‌کننده‌ها و محصولاتش حذف شود؟`,
      confirmLabel: "حذف کامل",
    });
    if (!ok) return;
    try {
      const res = await api.post(`/api/admin/users/${u.id}/delete`);
      toast(res.message, "success");
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>
            <ShieldCheck size={21} className="text-gradient" /> پنل مدیریت
          </h2>
          <p className="page-sub">
            {data ? `${data.users.length} کاربر ثبت‌شده` : "در حال بارگذاری…"}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setGeneratorOpen(true)}>
            <Wand2 size={16} /> تولید کلید لایسنس
          </button>
        </div>
      </div>

      <div className="field mb-16" style={{ maxWidth: 360 }}>
        <div className="flex gap-8">
          <input className="input" placeholder="جستجوی کاربر…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="btn btn-ghost"><Search size={16} /></span>
        </div>
      </div>

      {!data ? (
        <SkeletonRows rows={4} height={130} />
      ) : users.length === 0 ? (
        <div className="card">
          <EmptyState title="کاربری پیدا نشد" text="عبارت جستجو را تغییر دهید." />
        </div>
      ) : (
        <StaggerList style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {users.map((u) => (
            <StaggerItem key={u.id}>
              <div className="card card-hover user-card">
                <div className="uc-head">
                  <span className="avatar" style={{ background: u.is_admin ? "linear-gradient(135deg,#f59e0b,#fb7185)" : undefined }}>
                    {u.username.slice(0, 1).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="uc-name">
                      {u.full_name}
                      {u.is_self && <span className="badge" style={{ marginRight: 8 }}>شما</span>}
                    </div>
                    <div className="uc-sub">@{u.username} · {u.email || "بدون ایمیل"}</div>
                  </div>
                </div>

                <div className="flex gap-6 wrap">
                  {u.is_admin && <span className="badge badge-warning"><ShieldCheck size={12} /> مدیر</span>}
                  {u.is_licensed ? (
                    <span className="badge badge-success">
                      <Crown size={12} /> {u.is_lifetime ? "لایسنس مادام‌العمر" : `${u.remaining_days} روز`}
                    </span>
                  ) : (
                    <span className="badge">آزمایشی</span>
                  )}
                  {u.is_expired && <span className="badge badge-danger">منقضی</span>}
                  {u.email_verified && <span className="badge badge-cyan">ایمیل تأیید‌شده</span>}
                </div>

                <div className="uc-stats">
                  <div className="uc-stat"><b>{u.supplier_count}</b><span>تأمین‌کننده</span></div>
                  <div className="uc-stat"><b>{u.product_count}</b><span>محصول</span></div>
                  <div className="uc-stat"><b style={{ fontSize: 11.5 }}>{u.user_code}</b><span>کد فعال‌سازی</span></div>
                  <div className="uc-stat"><b style={{ fontSize: 11.5 }}>{u.license_type}</b><span>نوع لایسنس</span></div>
                </div>

                <div className="uc-actions">
                  <button className="btn btn-sm" onClick={() => setEditUser(u)}>
                    <Pencil size={13} /> ویرایش
                  </button>
                  <button className="btn btn-sm" onClick={() => setLicenseUser(u)}>
                    <KeyRound size={13} /> لایسنس
                  </button>
                  {!u.is_protected && !u.is_self && (
                    <button className="btn btn-sm btn-danger" onClick={() => removeUser(u)}>
                      <Trash2 size={13} /> حذف
                    </button>
                  )}
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      <EditUserModal
        user={editUser}
        onClose={() => setEditUser(null)}
        onSaved={() => {
          load();
          setEditUser(null);
        }}
      />
      <LicenseUserModal
        user={licenseUser}
        onClose={() => setLicenseUser(null)}
        onSaved={() => {
          load();
          setLicenseUser(null);
        }}
      />
      <KeyGeneratorModal open={generatorOpen} onClose={() => setGeneratorOpen(false)} />
    </div>
  );
}

function EditUserModal({ user, onClose, onSaved }) {
  const { toast, user: me } = useApp();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        email: user.email,
        new_password: "",
        is_admin: user.is_admin,
      });
    }
  }, [user]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form };
      if (!payload.new_password) delete payload.new_password;
      const res = await api.post(`/api/admin/users/${user.id}/update`, payload);
      toast(res.message, "success", 5500);
      onSaved();
    } catch (err) {
      toast(err.message, "error", 5500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(user)} onClose={onClose} size="lg" icon={<UserCog size={19} />} title={`ویرایش «${user?.username ?? ""}»`}>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <div className="flex gap-12 wrap">
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>نام کاربری</label>
            <input className="input" style={{ direction: "ltr" }} value={form.username ?? ""} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>رمز جدید (خالی = بدون تغییر)</label>
            <input className="input" style={{ direction: "ltr" }} value={form.new_password ?? ""} onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-12 wrap">
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label>نام</label>
            <input className="input" value={form.first_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label>نام خانوادگی</label>
            <input className="input" value={form.last_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-12 wrap">
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label>موبایل</label>
            <input className="input mono" style={{ direction: "ltr" }} value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label>ایمیل</label>
            <input className="input" style={{ direction: "ltr" }} value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
        </div>
        <div className="flex items-center gap-12">
          <span style={{ fontSize: 13, fontWeight: 700 }}>دسترسی مدیریت:</span>
          <button
            type="button"
            className={`switch ${form.is_admin ? "on" : ""}`}
            onClick={() => setForm((f) => ({ ...f, is_admin: !f.is_admin }))}
            disabled={me?.id === user?.id}
          />
        </div>
        <div className="flex gap-10 mt-8">
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
            {busy ? "…" : "ذخیره‌ی تغییرات"}
          </button>
          <button type="button" className="btn" onClick={onClose}>انصراف</button>
        </div>
      </form>
    </Modal>
  );
}

function LicenseUserModal({ user, onClose, onSaved }) {
  const { toast } = useApp();
  const [tier, setTier] = useState("PRO");
  const [duration, setDuration] = useState("LIFE");
  const [busy, setBusy] = useState(false);

  const grant = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/api/admin/users/${user.id}/license`, {
        action: "grant",
        tier,
        duration,
      });
      toast(res.message, "success", 6000);
      if (res.license_key) {
        navigator.clipboard?.writeText(res.license_key).catch(() => {});
        toast("کلید در کلیپ‌بورد کپی شد", "info", 2500);
      }
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/api/admin/users/${user.id}/license`, { action: "revoke" });
      toast(res.message, "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      icon={<KeyRound size={19} />}
      title={`لایسنس «${user?.username ?? ""}»`}
      subtitle={user ? `کد فعال‌سازی: ${user.user_code}` : ""}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="flex gap-12 wrap">
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label>سطح</label>
            <select className="select" value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="PRO">PRO</option>
              <option value="UNLIMITED">UNLIMITED</option>
              <option value="ENTERPRISE">ENTERPRISE</option>
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label>مدت</label>
            <select className="select" value={duration} onChange={(e) => setDuration(e.target.value)}>
              <option value="LIFE">مادام‌العمر</option>
              <option value="30D">۱ ماهه</option>
              <option value="90D">۳ ماهه</option>
              <option value="180D">۶ ماهه</option>
              <option value="365D">۱ ساله</option>
            </select>
          </div>
        </div>
        <div className="flex gap-10">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={grant} disabled={busy}>
            <Crown size={15} /> {user?.is_licensed ? "به‌روزرسانی لایسنس" : "اعطای لایسنس"}
          </button>
          {user?.is_licensed && !user?.is_protected && (
            <button className="btn btn-danger" onClick={revoke} disabled={busy}>
              حذف لایسنس
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function KeyGeneratorModal({ open, onClose }) {
  const { toast } = useApp();
  const [form, setForm] = useState({ identifier: "", tier: "PRO", duration: "LIFE", is_master: false });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const generate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const data = await api.post("/api/admin/generate-license", form);
      setResult(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { onClose(); setResult(null); }} icon={<Wand2 size={19} />} title="تولید کلید لایسنس">
      <form onSubmit={generate} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <AnimatePresence mode="wait">
          {result ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="token-box" style={{ fontSize: 15, fontWeight: 700, justifyContent: "center", padding: 18 }}>
                {result.license_key}
              </div>
              <div className="flex gap-8 wrap">
                <span className="badge badge-accent">{result.identifier}</span>
                <span className="badge">کد: {result.user_code}</span>
                <span className="badge">{result.duration_label}</span>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  navigator.clipboard?.writeText(result.customer_message);
                  toast("پیام آماده‌ی ارسال به مشتری کپی شد", "success");
                }}
              >
                <Copy size={15} /> کپی پیام متن کامل برای مشتری
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setResult(null)}>
                ساخت کلید دیگر
              </button>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div className="field">
                <label>نام کاربری یا شناسه‌ی مشتری</label>
                <input className="input" style={{ direction: "ltr" }} value={form.identifier} onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))} placeholder="username" />
              </div>
              <div className="flex gap-12">
                <div className="field" style={{ flex: 1 }}>
                  <label>سطح</label>
                  <select className="select" value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}>
                    <option>PRO</option>
                    <option>UNLIMITED</option>
                    <option>ENTERPRISE</option>
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>مدت</label>
                  <select className="select" value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}>
                    <option value="LIFE">مادام‌العمر</option>
                    <option value="30D">۱ ماهه</option>
                    <option value="90D">۳ ماهه</option>
                    <option value="180D">۶ ماهه</option>
                    <option value="365D">۱ ساله</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-12">
                <span style={{ fontSize: 13, fontWeight: 700 }}>کلید سراسری (Master):</span>
                <button type="button" className={`switch ${form.is_master ? "on" : ""}`} onClick={() => setForm((f) => ({ ...f, is_master: !f.is_master }))} />
              </div>
              <button className="btn btn-primary btn-lg" disabled={busy || (!form.is_master && !form.identifier.trim())}>
                {busy ? "…" : "تولید کلید"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </Modal>
  );
}

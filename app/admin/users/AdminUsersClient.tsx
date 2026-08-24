"use client";

import { useState } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  trialExpiresAt?: string | null;
  createdAt: string;
}

interface Props {
  initialUsers: User[];
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

function roleLabel(role: string): string {
  if (role === "ADMIN") return "Admin";
  if (role === "TRIAL") return "Trải nghiệm";
  return "User";
}

function roleBadgeStyle(role: string): React.CSSProperties {
  if (role === "ADMIN") return { background: "rgba(181,101,30,0.08)", color: "#B5651E" };
  if (role === "TRIAL") return { background: "rgba(163,58,42,0.1)", color: "#A33A2A" };
  return { background: "rgba(20,17,14,0.06)", color: "rgba(20,17,14,0.55)" };
}

type TrialTone = "pending" | "running" | "expired";

const TRIAL_TONE_COLOR: Record<TrialTone, string> = {
  pending: "rgba(20,17,14,0.45)",
  running: "rgba(180,83,9,0.9)",
  expired: "#B5651E",
};

// Đồng hồ 5 tiếng chỉ chạy từ lần đăng nhập đầu tiên → chưa có mốc hết hạn nghĩa
// là tài khoản vẫn đang nằm chờ khách đăng nhập, chưa bị trừ giờ.
function trialStatus(user: User): { text: string; tone: TrialTone } | null {
  if (user.role !== "TRIAL") return null;
  if (!user.trialExpiresAt) return { text: "Chưa bắt đầu — chờ đăng nhập", tone: "pending" };
  const left = new Date(user.trialExpiresAt).getTime() - Date.now();
  if (left <= 0) return { text: "Đã hết hạn", tone: "expired" };
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return { text: `Còn ${h}h${m.toString().padStart(2, "0")}p`, tone: "running" };
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
      style={{ background: "rgba(181,101,30,0.05)", border: "1px solid rgba(181,101,30,0.2)", color: "#B5651E" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {msg}
    </div>
  );
}

function SuccessBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
      style={{ background: "rgba(92,110,72,0.06)", border: "1px solid rgba(92,110,72,0.25)", color: "#5C6E48" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      {msg}
    </div>
  );
}

/** Mật khẩu ngẫu nhiên vừa sinh — hiện một lần để Admin sao chép nếu email không tới. */
function CreatedPasswordBox({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* trình duyệt chặn clipboard → Admin tự bôi đen để copy */
    }
  }

  return (
    <div className="rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap"
      style={{ background: "rgba(20,17,14,0.03)", border: "1px solid rgba(20,17,14,0.12)" }}>
      <span className="text-xs font-semibold" style={{ color: "rgba(20,17,14,0.55)" }}>
        Mật khẩu vừa tạo
      </span>
      <code className="text-sm font-bold tracking-wide px-2.5 py-1 rounded-lg select-all"
        style={{ background: "#F6F2EA", border: "1px solid rgba(20,17,14,0.1)", color: "#14110E" }}>
        {password}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        style={{ color: "#5C6E48", border: "1px solid rgba(92,110,72,0.3)", background: "rgba(92,110,72,0.06)" }}
      >
        {copied ? "Đã chép!" : "Sao chép"}
      </button>
    </div>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

interface EditModalProps {
  user: User;
  onClose: () => void;
  onSaved: (updated: User) => void;
}

function EditModal({ user, onClose, onSaved }: EditModalProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/update-user/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; user?: User };

      if (!res.ok) {
        setError(data.error ?? "Đã có lỗi xảy ra");
        return;
      }

      if (data.user) onSaved(data.user);
      onClose();
    } catch {
      setError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(20,17,14,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: "#F6F2EA", border: "1px solid rgba(20,17,14,0.08)" }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold" style={{ color: "#14110E" }}>
            Sửa tài khoản
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "rgba(20,17,14,0.4)", background: "rgba(20,17,14,0.05)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="dp-label">Họ và tên</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              required
              className="dp-input"
            />
          </div>
          <div>
            <label className="dp-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              required
              className="dp-input"
            />
          </div>
          <div>
            <label className="dp-label">
              Mật khẩu mới
              <span className="ml-1.5 text-xs font-normal" style={{ color: "rgba(20,17,14,0.4)" }}>
                (bỏ trống để giữ nguyên)
              </span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="••••••••"
              className="dp-input"
            />
          </div>

          {error && <ErrorBox msg={error} />}

          <div
            className="rounded-xl px-4 py-2.5 text-xs flex items-start gap-2"
            style={{ background: "rgba(181,101,30,0.04)", border: "1px solid rgba(181,101,30,0.12)", color: "rgba(20,17,14,0.55)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B5651E" strokeWidth="2" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Sau khi lưu, người dùng sẽ bị đăng xuất và phải đăng nhập lại bằng thông tin mới.
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ border: "1px solid rgba(20,17,14,0.12)", color: "rgba(20,17,14,0.6)", background: "transparent" }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
              style={{
                background: saving ? "rgba(20,17,14,0.55)" : "#14110E",
                color: "#F6F2EA",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                  </svg>
                  Đang lưu...
                </span>
              ) : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

interface DeleteModalProps {
  user: User;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteModal({ user, deleting, onCancel, onConfirm }: DeleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(20,17,14,0.5)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !deleting) onCancel(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: "#F6F2EA", border: "1px solid rgba(20,17,14,0.08)" }}
      >
        <div
          className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "rgba(181,101,30,0.08)" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B5651E" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </div>
        <h3 className="text-base font-bold text-center mb-1.5" style={{ color: "#14110E" }}>
          Xóa tài khoản?
        </h3>
        <p className="text-sm text-center leading-relaxed mb-5" style={{ color: "rgba(20,17,14,0.55)" }}>
          Bạn sắp xóa vĩnh viễn tài khoản{" "}
          <span className="font-semibold" style={{ color: "#14110E" }}>{user.name}</span>{" "}
          (<span style={{ color: "rgba(20,17,14,0.65)" }}>{user.email}</span>).
          <br />Hành động này <span className="font-semibold" style={{ color: "#B5651E" }}>không thể hoàn tác</span>.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ border: "1px solid rgba(20,17,14,0.12)", color: "rgba(20,17,14,0.6)", background: "transparent" }}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
            style={{
              background: deleting ? "rgba(20,17,14,0.55)" : "#14110E",
              color: "#F6F2EA",
              cursor: deleting ? "not-allowed" : "pointer",
            }}
          >
            {deleting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                </svg>
                Đang xóa...
              </span>
            ) : "Xóa tài khoản"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminUsersClient({ initialUsers }: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers);

  // ── Pagination ────────────────────────────────────────────────────────────
  const pageSize = 5;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(users.length / pageSize);
  const paginatedUsers = users.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Create form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"USER" | "TRIAL">("USER");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  // Mật khẩu ngẫu nhiên vừa sinh — hiện lại một lần để Admin sao chép nếu email lỗi.
  const [createdPassword, setCreatedPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete state
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Trial action state (reactivate / convert)
  const [trialActionId, setTrialActionId] = useState<string | null>(null);

  // Edit modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editSuccess, setEditSuccess] = useState("");

  // Logout state
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setFormError("");
    setFormSuccess("");

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; user?: User; emailed?: boolean; password?: string };

      if (!res.ok) {
        setFormError(data.error ?? "Đã có lỗi xảy ra");
        return;
      }

      if (data.user) {
        setUsers((prev) => [...prev, data.user!]);
        // Nhảy đến trang cuối để thấy user vừa tạo
        setCurrentPage(Math.ceil((users.length + 1) / pageSize));
      }
      const createdRoleLabel = role === "TRIAL" ? "Trải nghiệm" : "User";
      const createdEmail = email;
      setName(""); setEmail(""); setRole("USER");
      setCreatedPassword(data.password ?? "");
      setFormSuccess(
        `Đã cấp tài khoản ${createdRoleLabel} cho ${data.user?.name ?? createdEmail} thành công!` +
          (data.emailed
            ? ` Mật khẩu tự động đã được gửi tới ${createdEmail}.`
            : " (Chưa gửi được email thông báo — kiểm tra cấu hình email và gửi mật khẩu bên dưới cho khách.)")
      );
    } catch {
      setFormError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deletingUser) return;
    const userId = deletingUser.id;
    setDeleting(true);

    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok) { alert(data.error ?? "Không thể xóa tài khoản"); return; }
      setUsers((prev) => {
        const next = prev.filter((u) => u.id !== userId);
        // Nếu trang hiện tại vượt quá tổng trang mới → lùi 1 trang
        const newTotalPages = Math.ceil(next.length / pageSize);
        if (currentPage > newTotalPages && newTotalPages > 0) {
          setCurrentPage(newTotalPages);
        }
        return next;
      });
      setDeletingUser(null);
    } catch {
      alert("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setDeleting(false);
    }
  }

  async function handleTrialAction(user: User, action: "reactivate" | "convert_to_user") {
    setTrialActionId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; user?: User };
      if (!res.ok) { alert(data.error ?? "Không thể thực hiện thao tác"); return; }
      if (data.user) {
        setUsers((prev) => prev.map((u) => u.id === data.user!.id ? data.user! : u));
        setEditSuccess(
          action === "reactivate"
            ? `Đã mở lại 5 tiếng trải nghiệm cho "${data.user.name}" — bắt đầu tính khi họ đăng nhập lần tới.`
            : `Đã chuyển "${data.user.name}" sang tài khoản User chính thức.`
        );
        setTimeout(() => setEditSuccess(""), 4000);
      }
    } catch {
      alert("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setTrialActionId(null);
    }
  }

  function handleUserSaved(updated: User) {
    setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    setEditSuccess(`Đã cập nhật tài khoản "${updated.name}" thành công!`);
    setTimeout(() => setEditSuccess(""), 4000);
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/login");
    }
  }

  return (
    <>
      {/* Edit Modal */}
      {editingUser && (
        <EditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={handleUserSaved}
        />
      )}

      {/* Delete Confirm Modal */}
      {deletingUser && (
        <DeleteModal
          user={deletingUser}
          deleting={deleting}
          onCancel={() => { if (!deleting) setDeletingUser(null); }}
          onConfirm={handleDelete}
        />
      )}

      <div className="min-h-screen px-4 py-10" style={{ background: "#EFE9DD" }}>
        <div className="max-w-3xl mx-auto space-y-8">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#14110E" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F6F2EA" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight" style={{ color: "#14110E" }}>
                Quản lý tài khoản
              </h1>
              <p className="text-sm" style={{ color: "rgba(20,17,14,0.45)" }}>
                Cấp và thu hồi quyền truy cập hệ thống
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <a
                href="/"
                className="text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                style={{ color: "rgba(20,17,14,0.55)", border: "1px solid rgba(20,17,14,0.12)", background: "#F6F2EA" }}
              >
                ← Xem giao diện thực đơn
              </a>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                style={{
                  color: "#B5651E",
                  border: "1px solid rgba(181,101,30,0.25)",
                  background: "rgba(181,101,30,0.05)",
                  cursor: loggingOut ? "not-allowed" : "pointer",
                  opacity: loggingOut ? 0.6 : 1,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                {loggingOut ? "Đang xuất..." : "Đăng xuất"}
              </button>
            </div>
          </div>

          {/* Global edit success */}
          {editSuccess && <SuccessBox msg={editSuccess} />}

          {/* Create User Form */}
          <div
            className="rounded-2xl p-6 shadow-sm"
            style={{ background: "#F6F2EA", border: "1px solid rgba(20,17,14,0.08)" }}
          >
            <h2 className="text-base font-bold mb-5" style={{ color: "#14110E" }}>
              Cấp tài khoản mới
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="dp-label">Họ và tên</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setFormError(""); setFormSuccess(""); setCreatedPassword(""); }}
                    placeholder="Nguyễn Thị A"
                    required
                    className="dp-input"
                  />
                </div>
                <div>
                  <label className="dp-label">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFormError(""); setFormSuccess(""); setCreatedPassword(""); }}
                    placeholder="user@dietplan.com"
                    required
                    className="dp-input"
                  />
                </div>
              </div>
              <div
                className="rounded-xl px-4 py-3 text-xs leading-relaxed flex items-start gap-2"
                style={{ background: "rgba(20,17,14,0.03)", border: "1px solid rgba(20,17,14,0.1)", color: "rgba(20,17,14,0.55)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span>
                  Mật khẩu được <span className="font-semibold" style={{ color: "#14110E" }}>tạo ngẫu nhiên</span> và gửi thẳng
                  vào email của khách — bạn không cần đặt.
                </span>
              </div>

              {/* Cấp tài khoản: Vai trò */}
              <div>
                <label className="dp-label">Cấp tài khoản</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: "USER", title: "User", desc: "Tài khoản chính thức, dùng vĩnh viễn" },
                    { value: "TRIAL", title: "Trải nghiệm", desc: "5 tiếng, tính từ lần đăng nhập đầu" },
                  ] as const).map((opt) => {
                    const active = role === opt.value;
                    const accent = opt.value === "TRIAL" ? "163,58,42" : "181,101,30";
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setRole(opt.value); setFormError(""); setFormSuccess(""); setCreatedPassword(""); }}
                        className="text-left rounded-xl px-4 py-3 transition-all"
                        style={{
                          border: `1.5px solid ${active ? `rgba(${accent},0.6)` : "rgba(20,17,14,0.12)"}`,
                          background: active ? `rgba(${accent},0.05)` : "#F6F2EA",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                            style={{ border: `1.5px solid ${active ? `rgb(${accent})` : "rgba(20,17,14,0.25)"}` }}
                          >
                            {active && <span className="w-2 h-2 rounded-full" style={{ background: `rgb(${accent})` }} />}
                          </span>
                          <span className="text-sm font-bold" style={{ color: active ? `rgb(${accent})` : "#14110E" }}>
                            {opt.title}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-snug" style={{ color: "rgba(20,17,14,0.5)" }}>
                          {opt.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {formError && <ErrorBox msg={formError} />}
              {formSuccess && <SuccessBox msg={formSuccess} />}
              {createdPassword && <CreatedPasswordBox password={createdPassword} />}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-[0.98]"
                  style={{
                    background: creating ? "rgba(20,17,14,0.55)" : "#14110E",
                    color: "#F6F2EA",
                    cursor: creating ? "not-allowed" : "pointer",
                  }}
                >
                  {creating ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                      </svg>
                      Đang tạo...
                    </span>
                  ) : "Cấp tài khoản"}
                </button>
              </div>
            </form>
          </div>

          {/* Users Table */}
          <div
            className="rounded-2xl shadow-sm overflow-hidden"
            style={{ background: "#F6F2EA", border: "1px solid rgba(20,17,14,0.08)" }}
          >
            <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(20,17,14,0.08)" }}>
              <h2 className="text-base font-bold" style={{ color: "#14110E" }}>
                Danh sách tài khoản
                <span
                  className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(20,17,14,0.06)", color: "rgba(20,17,14,0.5)" }}
                >
                  {users.length}
                </span>
              </h2>
            </div>

            {users.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm" style={{ color: "rgba(20,17,14,0.35)" }}>
                Chưa có tài khoản nào
              </div>
            ) : (
              <>
                {/* ── Table ── */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "rgba(20,17,14,0.03)", borderBottom: "1px solid rgba(20,17,14,0.06)" }}>
                        <th
                          className="text-center px-4 py-3 font-semibold w-12"
                          style={{ color: "rgba(20,17,14,0.5)" }}
                        >
                          STT
                        </th>
                        <th className="text-left px-6 py-3 font-semibold" style={{ color: "rgba(20,17,14,0.5)" }}>Họ tên</th>
                        <th className="text-left px-6 py-3 font-semibold" style={{ color: "rgba(20,17,14,0.5)" }}>Email</th>
                        <th className="text-left px-6 py-3 font-semibold" style={{ color: "rgba(20,17,14,0.5)" }}>Vai trò</th>
                        <th className="px-6 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((user, idx) => {
                        const stt = (currentPage - 1) * pageSize + idx + 1;
                        return (
                          <tr
                            key={user.id}
                            style={{ borderBottom: idx < paginatedUsers.length - 1 ? "1px solid rgba(20,17,14,0.05)" : "none" }}
                          >
                            {/* STT */}
                            <td className="px-4 py-3.5 text-center font-semibold tabular-nums" style={{ color: "rgba(20,17,14,0.35)" }}>
                              {stt}
                            </td>
                            <td className="px-6 py-3.5 font-medium" style={{ color: "#14110E" }}>
                              {user.name}
                            </td>
                            <td className="px-6 py-3.5" style={{ color: "rgba(20,17,14,0.65)" }}>
                              {user.email}
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="flex flex-col items-start gap-1">
                                <span
                                  className="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                                  style={roleBadgeStyle(user.role)}
                                >
                                  {roleLabel(user.role)}
                                </span>
                                {(() => {
                                  const st = trialStatus(user);
                                  if (!st) return null;
                                  return (
                                    <span
                                      className="text-[11px] font-semibold"
                                      style={{ color: TRIAL_TONE_COLOR[st.tone] }}
                                    >
                                      {st.text}
                                    </span>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="flex items-center justify-end gap-2 flex-wrap">
                                {user.role === "TRIAL" && (
                                  <>
                                    <button
                                      onClick={() => handleTrialAction(user, "reactivate")}
                                      disabled={trialActionId === user.id}
                                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                      style={{
                                        color: "#A33A2A",
                                        border: "1px solid rgba(163,58,42,0.3)",
                                        background: "rgba(163,58,42,0.06)",
                                        cursor: trialActionId === user.id ? "wait" : "pointer",
                                        opacity: trialActionId === user.id ? 0.6 : 1,
                                      }}
                                    >
                                      Kích hoạt lại
                                    </button>
                                    <button
                                      onClick={() => handleTrialAction(user, "convert_to_user")}
                                      disabled={trialActionId === user.id}
                                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                      style={{
                                        color: "#5C6E48",
                                        border: "1px solid rgba(92,110,72,0.3)",
                                        background: "rgba(92,110,72,0.06)",
                                        cursor: trialActionId === user.id ? "wait" : "pointer",
                                        opacity: trialActionId === user.id ? 0.6 : 1,
                                      }}
                                    >
                                      Chuyển User
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => { setEditingUser(user); setEditSuccess(""); }}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                  style={{
                                    color: "rgba(20,17,14,0.6)",
                                    border: "1px solid rgba(20,17,14,0.15)",
                                    background: "rgba(20,17,14,0.03)",
                                  }}
                                >
                                  Sửa
                                </button>
                                <button
                                  onClick={() => setDeletingUser(user)}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                  style={{
                                    color: "#B5651E",
                                    border: "1px solid rgba(181,101,30,0.25)",
                                    background: "rgba(181,101,30,0.04)",
                                    cursor: "pointer",
                                  }}
                                >
                                  Xóa
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Pagination Bar ── */}
                {totalPages > 1 && (
                  <div
                    className="flex items-center justify-end gap-1.5 px-6 py-3"
                    style={{ borderTop: "1px solid rgba(20,17,14,0.06)" }}
                  >
                    {/* Prev */}
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                      style={{
                        border: "1px solid rgba(20,17,14,0.12)",
                        background: currentPage === 1 ? "rgba(20,17,14,0.02)" : "#F6F2EA",
                        color: currentPage === 1 ? "rgba(20,17,14,0.25)" : "rgba(20,17,14,0.6)",
                        cursor: currentPage === 1 ? "not-allowed" : "pointer",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                      Prev
                    </button>

                    {/* Page numbers */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className="w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg transition-all"
                        style={
                          page === currentPage
                            ? { background: "#14110E", color: "#F6F2EA", border: "1px solid #B5651E" }
                            : {
                                background: "#F6F2EA",
                                color: "rgba(20,17,14,0.55)",
                                border: "1px solid rgba(20,17,14,0.12)",
                                cursor: "pointer",
                              }
                        }
                      >
                        {page}
                      </button>
                    ))}

                    {/* Next */}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                      style={{
                        border: "1px solid rgba(20,17,14,0.12)",
                        background: currentPage === totalPages ? "rgba(20,17,14,0.02)" : "#F6F2EA",
                        color: currentPage === totalPages ? "rgba(20,17,14,0.25)" : "rgba(20,17,14,0.6)",
                        cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                      }}
                    >
                      Next
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      </div>
    </>
  );
}

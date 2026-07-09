"use client";

import { useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "#F6F2EA" }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: "#14110E" }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F6F2EA" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#14110E" }}>
            Đặt lại mật khẩu
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(20,17,14,0.45)" }}>
            Chọn mật khẩu mới cho tài khoản của bạn
          </p>
        </div>
        <div
          className="rounded-2xl p-6 shadow-sm"
          style={{ border: "1px solid rgba(20,17,14,0.1)", background: "#F6F2EA" }}
        >
          {children}
        </div>
        <p className="text-center text-xs mt-5" style={{ color: "rgba(20,17,14,0.3)" }}>
          Diet Plan © {new Date().getFullYear()} · Phần mềm quản lý dinh dưỡng
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Link opened without a token → nothing to reset.
  if (!token) {
    return (
      <Shell>
        <div className="space-y-5">
          <div
            className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{ background: "rgba(163,58,42,0.06)", border: "1px solid rgba(163,58,42,0.25)", color: "#A33A2A" }}
          >
            Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu đặt lại mật khẩu một lần nữa.
          </div>
          <a href="/forgot-password" className="block text-center text-sm font-semibold" style={{ color: "#B5651E" }}>
            Yêu cầu liên kết mới
          </a>
        </div>
      </Shell>
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (pw.length < 6) {
      setError("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }
    if (pw !== pw2) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Có lỗi xảy ra. Vui lòng thử lại.");
        return;
      }
      setDone(true);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="space-y-5">
          <div
            className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{ background: "rgba(92,110,72,0.08)", border: "1px solid rgba(92,110,72,0.3)", color: "#5C6E48" }}
          >
            Đã đặt lại mật khẩu thành công. Bây giờ bạn có thể đăng nhập bằng mật khẩu mới.
          </div>
          <a href="/login" className="block">
            <button
              className="w-full py-3 rounded-xl font-bold text-base tracking-wide transition-all active:scale-[0.98]"
              style={{ background: "#14110E", color: "#F6F2EA" }}
            >
              Đến trang đăng nhập
            </button>
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="pw" className="dp-label">Mật khẩu mới</label>
          <div className="relative">
            <input
              id="pw"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={pw}
              onChange={(e) => { setPw(e.target.value); if (error) setError(""); }}
              placeholder="Tối thiểu 6 ký tự"
              required
              className={`dp-input pr-11 ${error ? "dp-input-error" : ""}`}
              style={{ paddingRight: "2.75rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: "rgba(20,17,14,0.35)" }}
              tabIndex={-1}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="pw2" className="dp-label">Nhập lại mật khẩu mới</label>
          <input
            id="pw2"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => { setPw2(e.target.value); if (error) setError(""); }}
            placeholder="••••••••"
            required
            className={`dp-input ${error ? "dp-input-error" : ""}`}
          />
        </div>

        {error && (
          <div
            className="rounded-xl px-4 py-3 text-sm font-medium flex items-start gap-2"
            style={{ background: "rgba(181,101,30,0.05)", border: "1px solid rgba(181,101,30,0.2)", color: "#B5651E" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !pw || !pw2}
          className="w-full py-3 rounded-xl font-bold text-base tracking-wide transition-all active:scale-[0.98] mt-2"
          style={{
            background: loading || !pw || !pw2 ? "rgba(20,17,14,0.55)" : "#14110E",
            color: "#F6F2EA",
            cursor: loading ? "not-allowed" : "pointer",
            touchAction: "manipulation",
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
              </svg>
              Đang lưu...
            </span>
          ) : "Đặt lại mật khẩu"}
        </button>

        <a href="/login" className="block text-center text-sm font-medium pt-1" style={{ color: "rgba(20,17,14,0.5)" }}>
          ← Quay lại đăng nhập
        </a>
      </form>
    </Shell>
  );
}

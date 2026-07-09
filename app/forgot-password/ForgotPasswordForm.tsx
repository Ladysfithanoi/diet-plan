"use client";

import { useState, FormEvent } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Có lỗi xảy ra. Vui lòng thử lại.");
        return;
      }
      setSent(true);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "#F6F2EA" }}
    >
      <div className="w-full max-w-sm">

        {/* Logo + Title */}
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
            Quên mật khẩu
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(20,17,14,0.45)" }}>
            Nhập email đăng nhập, chúng tôi sẽ gửi liên kết đặt lại mật khẩu
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6 shadow-sm"
          style={{ border: "1px solid rgba(20,17,14,0.1)", background: "#F6F2EA" }}
        >
          {sent ? (
            <div className="space-y-5">
              <div
                className="rounded-xl px-4 py-3 text-sm font-medium"
                style={{
                  background: "rgba(92,110,72,0.08)",
                  border: "1px solid rgba(92,110,72,0.3)",
                  color: "#5C6E48",
                }}
              >
                Đã gửi liên kết đặt lại mật khẩu tới <strong>{email}</strong>. Vui lòng kiểm tra hộp thư
                (kể cả mục Spam/Quảng cáo). Liên kết hết hạn sau 1 giờ.
              </div>
              <a
                href="/login"
                className="block text-center text-sm font-semibold"
                style={{ color: "#B5651E" }}
              >
                ← Quay lại đăng nhập
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="dp-label">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
                  placeholder="user@dietplan.com"
                  required
                  className={`dp-input ${error ? "dp-input-error" : ""}`}
                />
              </div>

              {error && (
                <div
                  className="rounded-xl px-4 py-3 text-sm font-medium flex items-start gap-2"
                  style={{
                    background: "rgba(181,101,30,0.05)",
                    border: "1px solid rgba(181,101,30,0.2)",
                    color: "#B5651E",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-base tracking-wide transition-all active:scale-[0.98] mt-2"
                style={{
                  background: loading ? "rgba(20,17,14,0.55)" : "#14110E",
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
                    Đang gửi...
                  </span>
                ) : "Gửi liên kết đặt lại"}
              </button>

              <a
                href="/login"
                className="block text-center text-sm font-medium pt-1"
                style={{ color: "rgba(20,17,14,0.5)" }}
              >
                ← Quay lại đăng nhập
              </a>
            </form>
          )}
        </div>

        <p className="text-center text-xs mt-5" style={{ color: "rgba(20,17,14,0.3)" }}>
          Diet Plan © {new Date().getFullYear()} · Phần mềm quản lý dinh dưỡng
        </p>
      </div>
    </div>
  );
}

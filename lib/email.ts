// Server-only email helper built on Gmail SMTP via nodemailer — the same
// approach as the training-plan app, so both share one Gmail App Password
// instead of a separate email service. Runs only in the Node.js API-route
// runtime (nodemailer needs Node, not the edge runtime).
//
// Sending is intentionally best-effort: every caller must treat a failed or
// skipped send as a non-event and never let it break the main flow (e.g. an
// account is still created even if the welcome email can't go out). When
// GMAIL_USER / GMAIL_APP_PASSWORD are unset (local dev, preview) every call is
// a silent no-op.

import nodemailer from "nodemailer";

/** App / brand name used in subject lines and email chrome. */
const BRAND = "Diet Plan";

// Brand palette (paper / ink / amber) — mirrors the app UI.
const PAPER = "#F6F2EA";
const INK = "#14110E";
const AMBER = "#B5651E";

/**
 * Loose email-format check — enough to skip obvious placeholders so we don't
 * fire off sends to addresses that clearly aren't real mailboxes. We can't
 * verify a mailbox actually exists; Gmail simply bounces if it doesn't.
 */
export function looksLikeEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

type SendResult = { sent: boolean; skipped?: string; error?: string };

/**
 * Builds the "from" header. Prefer an explicit EMAIL_FROM (a nice display
 * name), otherwise fall back to the Gmail account itself. Gmail rewrites the
 * envelope sender to the authenticated account regardless, so a fancy address
 * here is display-only.
 */
function fromHeader(gmailUser: string): string {
  return process.env.EMAIL_FROM?.trim() || `${BRAND} <${gmailUser}>`;
}

/** Low-level send. Returns a result object instead of throwing. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  // Not configured → quietly do nothing. Keeps dev/preview from erroring.
  if (!user || !pass) return { sent: false, skipped: "email-not-configured" };
  // Bogus / placeholder recipient → skip.
  if (!looksLikeEmail(opts.to)) return { sent: false, skipped: "invalid-recipient" };

  try {
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    await transport.sendMail({
      from: fromHeader(user),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return { sent: true };
  } catch (err) {
    console.error("[sendEmail] Gmail send failed:", err);
    return { sent: false, error: "smtp" };
  }
}

/**
 * Builds the welcome email sent when an admin creates a new account. Carries
 * the login URL, the login email and the auto-generated password, plus a nudge
 * to change it after first sign-in. `roleLabel` is the Vietnamese label shown
 * in the subject/heading (e.g. "User", "Trải nghiệm"). `isTrial` adds the note
 * that the 5-hour trial clock only starts at the first sign-in.
 */
export function buildWelcomeEmail(opts: {
  fullName: string | null;
  email: string;
  password: string;
  loginUrl: string;
  roleLabel: string;
  isTrial?: boolean;
}): { subject: string; html: string } {
  const name = opts.fullName?.trim() || "bạn";
  const roleLabel = opts.roleLabel;
  const subject = `Tài khoản ${BRAND} của bạn đã sẵn sàng`;

  const html = `
  <div style="margin:0;padding:24px;background:${PAPER};font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6ddcb;">
      <tr>
        <td style="padding:28px 32px 8px;">
          <p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${AMBER};font-weight:700;">${BRAND}</p>
          <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;color:${INK};">Chào ${escapeHtml(name)}, tài khoản của bạn đã được tạo 🎉</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 32px 0;font-size:15px;line-height:1.65;color:#3a3630;">
          <p style="margin:0 0 16px;">Một tài khoản <strong>${escapeHtml(roleLabel)}</strong> trên hệ thống <strong>${BRAND}</strong> vừa được tạo cho bạn. Đăng nhập bằng thông tin bên dưới để bắt đầu sử dụng máy tính dinh dưỡng.</p>
          ${opts.isTrial ? `<p style="margin:0 0 16px;padding:12px 14px;background:#fdf6ec;border:1px solid #f0e0c4;border-radius:10px;font-size:14px;">⏳ Phiên trải nghiệm kéo dài <strong>5 tiếng</strong>, chỉ bắt đầu tính <strong>từ lúc bạn đăng nhập lần đầu</strong> — nên bạn có thể yên tâm đăng nhập khi đã sẵn sàng.</p>` : ""}
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};border:1px solid #e6ddcb;border-radius:10px;">
            <tr><td style="padding:14px 18px;font-size:14px;color:#3a3630;">
              <p style="margin:0 0 6px;"><span style="color:#8a8175;">Email đăng nhập:</span> <strong>${escapeHtml(opts.email)}</strong></p>
              <p style="margin:0;"><span style="color:#8a8175;">Mật khẩu:</span> <strong style="font-family:'Courier New',monospace;">${escapeHtml(opts.password)}</strong></p>
            </td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 32px 8px;">
          <a href="${opts.loginUrl}" style="display:inline-block;background:${INK};color:${PAPER};text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:10px;">Đăng nhập ngay →</a>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 32px 0;font-size:13px;line-height:1.6;color:#8a8175;">
          <p style="margin:0 0 6px;">Hoặc mở liên kết: <a href="${opts.loginUrl}" style="color:${AMBER};word-break:break-all;">${opts.loginUrl}</a></p>
          <p style="margin:10px 0 0;">Vì lý do bảo mật, hãy <strong>đổi mật khẩu</strong> sau lần đăng nhập đầu tiên.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 32px 28px;border-top:1px solid #efe8da;">
          <p style="margin:18px 0 0;font-size:12px;color:#a89f90;">Bạn nhận được email này vì có người đã tạo tài khoản cho bạn tại ${BRAND}. Nếu bạn không mong đợi email này, có thể bỏ qua nó.</p>
        </td>
      </tr>
    </table>
  </div>`;

  return { subject, html };
}

/**
 * Builds the password-reset email. Sent when someone uses "Quên mật khẩu?" on
 * the login page. Carries a single big button + fallback link to the reset page
 * (which holds a short-lived signed token) and states the 1-hour expiry.
 */
export function buildPasswordResetEmail(opts: {
  fullName: string | null;
  resetUrl: string;
}): { subject: string; html: string } {
  const name = opts.fullName?.trim() || "bạn";
  const subject = `Đặt lại mật khẩu ${BRAND}`;

  const html = `
  <div style="margin:0;padding:24px;background:${PAPER};font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6ddcb;">
      <tr>
        <td style="padding:28px 32px 8px;">
          <p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${AMBER};font-weight:700;">${BRAND}</p>
          <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;color:${INK};">Đặt lại mật khẩu 🔒</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 32px 0;font-size:15px;line-height:1.65;color:#3a3630;">
          <p style="margin:0 0 16px;">Chào ${escapeHtml(name)}, chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Bấm nút bên dưới để chọn mật khẩu mới.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 32px 8px;">
          <a href="${opts.resetUrl}" style="display:inline-block;background:${INK};color:${PAPER};text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:10px;">Đặt lại mật khẩu →</a>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 32px 0;font-size:13px;line-height:1.6;color:#8a8175;">
          <p style="margin:0 0 6px;">Hoặc mở liên kết: <a href="${opts.resetUrl}" style="color:${AMBER};word-break:break-all;">${opts.resetUrl}</a></p>
          <p style="margin:10px 0 0;">Liên kết này sẽ <strong>hết hạn sau 1 giờ</strong>. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu của bạn vẫn giữ nguyên.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 32px 28px;border-top:1px solid #efe8da;">
          <p style="margin:18px 0 0;font-size:12px;color:#a89f90;">Email tự động từ hệ thống ${BRAND}. Vì lý do bảo mật, đừng chuyển tiếp email này cho người khác.</p>
        </td>
      </tr>
    </table>
  </div>`;

  return { subject, html };
}

/** Minimal HTML-escape for interpolated user text (names, passwords). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

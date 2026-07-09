import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signResetToken } from "@/lib/reset-token";
import { sendEmail, buildPasswordResetEmail, looksLikeEmail } from "@/lib/email";

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Sends a password-reset link to the account's email. Public (no session) —
 * reached from the "Quên mật khẩu?" link on the login page.
 *
 * Per product choice this endpoint gives explicit feedback (a small internal
 * tool where UX clarity matters more than hiding which emails are registered):
 * a 404 when no account matches, so the user knows they mistyped.
 */
export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = (await req.json()) as { email?: string };
    email = String(body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  if (!looksLikeEmail(email)) {
    return NextResponse.json({ error: "Vui lòng nhập địa chỉ email hợp lệ." }, { status: 400 });
  }

  let user: { id: string; email: string; name: string } | null;
  try {
    user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
  } catch (err) {
    console.error("[forgot-password] Lookup failed:", err);
    return NextResponse.json({ error: "Lỗi hệ thống. Vui lòng thử lại sau." }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json(
      { error: "Email này chưa có tài khoản trong hệ thống. Vui lòng kiểm tra lại." },
      { status: 404 }
    );
  }

  const origin = new URL(req.url).origin;
  const token = await signResetToken(user.id, user.email);
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  const { subject, html } = buildPasswordResetEmail({
    fullName: user.name,
    resetUrl,
  });
  const result = await sendEmail({ to: user.email, subject, html });

  if (!result.sent) {
    console.error("[forgot-password] Reset email not sent:", result.skipped ?? result.error);
    return NextResponse.json(
      { error: "Không gửi được email. Vui lòng liên hệ quản trị viên hoặc thử lại sau." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}

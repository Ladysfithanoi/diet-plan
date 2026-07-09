import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { verifyResetToken } from "@/lib/reset-token";

/**
 * POST /api/auth/reset-password
 * Body: { token: string, password: string }
 *
 * Completes a password reset: validates the signed token from the emailed link,
 * then sets the account's new password. Clearing currentSessionToken forces any
 * existing session to log out. Public (no session) — the token is the proof of
 * identity.
 */
export async function POST(req: NextRequest) {
  let token: string, password: string;
  try {
    const body = (await req.json()) as { token?: string; password?: string };
    token = String(body.token ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Mật khẩu mới phải có ít nhất 6 ký tự." }, { status: 400 });
  }

  const verified = await verifyResetToken(token);
  if (!verified) {
    return NextResponse.json(
      { error: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu lại." },
      { status: 400 }
    );
  }

  try {
    // Guard against a token that outlived its account (deleted / email changed).
    const user = await prisma.user.findUnique({
      where: { id: verified.userId },
      select: { id: true, email: true },
    });
    if (!user || user.email !== verified.email) {
      return NextResponse.json(
        { error: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu lại." },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, currentSessionToken: null },
    });
  } catch (err) {
    console.error("[reset-password] Update failed:", err);
    return NextResponse.json({ error: "Không thể đặt lại mật khẩu. Vui lòng thử lại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

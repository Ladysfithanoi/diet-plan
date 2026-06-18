import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { signSession, COOKIE_NAME } from "@/lib/jwt";
import { isTrialExpired } from "@/lib/trial";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older Safari / WebKit
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { email?: string; password?: string };
    const { email, password } = body;

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Email và mật khẩu là bắt buộc" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Email hoặc mật khẩu không đúng" },
        { status: 401 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Email hoặc mật khẩu không đúng" },
        { status: 401 }
      );
    }

    // Tài khoản trải nghiệm đã hết hạn → không cho đăng nhập nữa
    if (isTrialExpired(user.role, user.trialExpiresAt)) {
      return NextResponse.json(
        { error: "Phiên trải nghiệm đã kết thúc. Vui lòng liên hệ Admin để kích hoạt lại tài khoản." },
        { status: 403 }
      );
    }

    const sessionId = generateUUID();

    await prisma.user.update({
      where: { id: user.id },
      data: { currentSessionToken: sessionId },
    });

    const token = await signSession({
      sub: user.id,
      email: user.email,
      role: user.role,
      sid: sessionId,
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const response = NextResponse.json({ ok: true, role: user.role });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    console.error("[login]", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ, vui lòng thử lại" },
      { status: 500 }
    );
  }
}

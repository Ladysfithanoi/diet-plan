import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAdminAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ROLE_TRIAL, ROLE_USER } from "@/lib/trial";
import { generatePassword } from "@/lib/password";
import { sendEmail, buildWelcomeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  try {
    const body = await req.json() as { name?: string; email?: string; role?: string };
    const { name, email } = body;
    const role = body.role === ROLE_TRIAL ? ROLE_TRIAL : ROLE_USER;

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Vui lòng điền đầy đủ thông tin" }, { status: 400 });
    }

    // Mật khẩu do hệ thống sinh ngẫu nhiên — Admin không phải tự đặt.
    const password = generatePassword();

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existing) {
      return NextResponse.json({ error: "Email này đã được sử dụng" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role,
        // Tài khoản Trải nghiệm chỉ bắt đầu đếm giờ khi khách đăng nhập lần đầu.
        trialExpiresAt: null,
      },
      select: { id: true, name: true, email: true, role: true, trialExpiresAt: true, createdAt: true },
    });

    // Best-effort welcome email with the login credentials. A failed/skipped
    // send must never break account creation — the admin still gets the account.
    const origin = new URL(req.url).origin;
    const emailResult = await sendEmail({
      to: user.email,
      ...buildWelcomeEmail({
        fullName: user.name,
        email: user.email,
        password,
        loginUrl: `${origin}/login`,
        roleLabel: role === ROLE_TRIAL ? "Trải nghiệm" : "User",
        isTrial: role === ROLE_TRIAL,
      }),
    });

    return NextResponse.json({
      ok: true,
      emailed: emailResult.sent,
      password,
      user: {
        ...user,
        trialExpiresAt: user.trialExpiresAt ? user.trialExpiresAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[create-user]", error);
    return NextResponse.json({ error: "Lỗi máy chủ, vui lòng thử lại" }, { status: 500 });
  }
}

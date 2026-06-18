import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAdminAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ROLE_TRIAL, ROLE_USER, trialDeadlineFromNow } from "@/lib/trial";

export async function POST(req: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  try {
    const body = await req.json() as { name?: string; email?: string; password?: string; role?: string };
    const { name, email, password } = body;
    const role = body.role === ROLE_TRIAL ? ROLE_TRIAL : ROLE_USER;

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: "Vui lòng điền đầy đủ thông tin" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Mật khẩu phải có ít nhất 6 ký tự" }, { status: 400 });
    }

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
        trialExpiresAt: role === ROLE_TRIAL ? trialDeadlineFromNow() : null,
      },
      select: { id: true, name: true, email: true, role: true, trialExpiresAt: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
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

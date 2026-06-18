import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ROLE_USER, trialDeadlineFromNow } from "@/lib/trial";

// Quản lý vai trò / phiên trải nghiệm:
//  - "reactivate": gia hạn thêm 5 tiếng cho tài khoản Trải nghiệm (sau khi hết hạn
//    hoặc bất cứ lúc nào Admin muốn).
//  - "convert_to_user": khách đã đóng tiền → chuyển sang vai trò User vĩnh viễn.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAdminAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json() as { action?: string };

    let data: { trialExpiresAt?: Date | null; role?: string };
    if (body.action === "reactivate") {
      data = { trialExpiresAt: trialDeadlineFromNow() };
    } else if (body.action === "convert_to_user") {
      data = { role: ROLE_USER, trialExpiresAt: null };
    } else {
      return NextResponse.json({ error: "Hành động không hợp lệ" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, trialExpiresAt: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
      user: {
        ...updated,
        trialExpiresAt: updated.trialExpiresAt ? updated.trialExpiresAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch {
    return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAdminAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  const { id } = await params;

  if (id === auth.user.id) {
    return NextResponse.json({ error: "Không thể xóa tài khoản đang đăng nhập" }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 });
  }
}

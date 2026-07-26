import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Xoá một món custom khỏi thư viện chung. Không cho xoá món builtin (món gốc trong code).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.kicked ? "Tài khoản của bạn đang được đăng nhập ở một thiết bị khác!" : "Chưa đăng nhập", kicked: auth.kicked },
      { status: 401 }
    );
  }

  const { id } = await params;

  const food = await prisma.food.findUnique({ where: { id } });
  if (!food) {
    return NextResponse.json({ error: "Không tìm thấy món ăn" }, { status: 404 });
  }
  if (food.source !== "custom") {
    return NextResponse.json({ error: "Không thể xoá món mặc định của hệ thống" }, { status: 403 });
  }

  await prisma.food.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

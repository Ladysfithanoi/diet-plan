import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { isValidSharePlan, slugifyName, type SharePlan } from "@/lib/share";

export const dynamic = "force-dynamic";

// Mã ngẫu nhiên ngắn (base36) gắn sau tên khách để link là duy nhất
function randomCode(len = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json(
      {
        error: auth.kicked
          ? "Tài khoản của bạn đang được đăng nhập ở một thiết bị khác!"
          : "Chưa đăng nhập",
        kicked: auth.kicked,
      },
      { status: 401 }
    );
  }

  let plan: unknown;
  try {
    const body = (await req.json()) as { plan?: unknown };
    plan = body.plan;
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  if (!isValidSharePlan(plan)) {
    return NextResponse.json({ error: "Thực đơn không hợp lệ" }, { status: 400 });
  }

  const base = slugifyName((plan as SharePlan).client.name);

  // Thử tối đa 6 lần để tránh trùng slug (xác suất trùng cực thấp)
  let slug = "";
  for (let i = 0; i < 6; i++) {
    const candidate = `${base}-${randomCode(6)}`;
    const existing = await prisma.sharedPlan.findUnique({ where: { id: candidate } });
    if (!existing) {
      slug = candidate;
      break;
    }
  }
  if (!slug) {
    return NextResponse.json({ error: "Không tạo được link, vui lòng thử lại" }, { status: 500 });
  }

  try {
    await prisma.sharedPlan.create({
      data: { id: slug, data: plan as SharePlan as object },
    });
  } catch {
    return NextResponse.json({ error: "Không lưu được thực đơn" }, { status: 500 });
  }

  return NextResponse.json({ slug });
}

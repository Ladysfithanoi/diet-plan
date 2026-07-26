import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { FOODS } from "@/lib/foods-data";
import { getCustomFoods, validateFoodInput, type FoodInput } from "@/lib/foods-db";

export const dynamic = "force-dynamic";

function unauthorized(kicked: boolean) {
  return NextResponse.json(
    { error: kicked ? "Tài khoản của bạn đang được đăng nhập ở một thiết bị khác!" : "Chưa đăng nhập", kicked },
    { status: 401 }
  );
}

// Danh sách món custom (dùng chung cho cả app) để client gộp vào ô tìm kiếm.
export async function GET() {
  const auth = await getAuth();
  if (!auth.ok) return unauthorized(auth.kicked);
  const foods = await getCustomFoods();
  return NextResponse.json({ foods });
}

// Thêm một món mới vào thư viện chung (từ kết quả Gemini hoặc nhập tay).
export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) return unauthorized(auth.kicked);

  let body: FoodInput;
  try {
    body = (await req.json()) as FoodInput;
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const result = validateFoodInput(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const food = result.food;

  // Trùng tên với món gốc trong code → chặn (không được ghi đè món hệ thống).
  const nameLower = food.name.toLowerCase();
  if (FOODS.some((f) => f.name.toLowerCase() === nameLower)) {
    return NextResponse.json({ error: "Món này đã có sẵn trong thư viện mặc định" }, { status: 409 });
  }

  try {
    const created = await prisma.food.create({
      data: { ...food, source: "custom", createdBy: auth.user.id },
    });
    return NextResponse.json({
      ok: true,
      food: {
        id: created.id,
        name: created.name,
        nameEn: created.nameEn ?? undefined,
        calories: created.calories,
        protein: created.protein,
        fat: created.fat,
        carbs: created.carbs,
        fiber: created.fiber ?? undefined,
        unit: created.unit ?? undefined,
        gramsPerUnit: created.gramsPerUnit ?? undefined,
        tag: created.tag,
      },
    });
  } catch (e: unknown) {
    // P2002 = vi phạm unique name (đã có món custom cùng tên)
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Đã có món khác cùng tên trong thư viện" }, { status: 409 });
    }
    return NextResponse.json({ error: "Không lưu được món ăn, vui lòng thử lại" }, { status: 500 });
  }
}

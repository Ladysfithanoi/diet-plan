// Helper truy vấn thư viện thực phẩm trong Supabase.
//
// Kiến trúc: toàn bộ món GỐC nằm trong code (lib/foods-data.ts) để app khởi động
// tức thì, không cần round-trip DB. Món CUSTOM do người dùng thêm nằm trong bảng
// Food (source="custom") và được nạp thêm lúc runtime rồi gộp vào danh sách tìm kiếm.
import prisma from "@/lib/prisma";
import { FOOD_TAGS, type FoodItem, type FoodTag } from "@/lib/foods-data";

export { FOOD_TAGS, FOOD_TAG_LABELS } from "@/lib/foods-data";

// Món custom trả về kèm id để có thể xoá / phân biệt với món builtin.
export type CustomFood = FoodItem & { id: string };

type DbFood = {
  id: string;
  name: string;
  nameEn: string | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number | null;
  unit: string | null;
  gramsPerUnit: number | null;
  tag: string;
};

function toFoodItem(f: DbFood): CustomFood {
  return {
    id: f.id,
    name: f.name,
    nameEn: f.nameEn ?? undefined,
    calories: f.calories,
    protein: f.protein,
    fat: f.fat,
    carbs: f.carbs,
    fiber: f.fiber ?? undefined,
    unit: f.unit ?? undefined,
    gramsPerUnit: f.gramsPerUnit ?? undefined,
    tag: f.tag as FoodTag,
  };
}

// Chỉ lấy món custom — món builtin đã có sẵn trong code nên không cần nạp lại.
export async function getCustomFoods(): Promise<CustomFood[]> {
  const rows = await prisma.food.findMany({
    where: { source: "custom" },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toFoodItem);
}

// ─── Validate input khi thêm món ────────────────────────────────────────────────

export type FoodInput = {
  name?: unknown;
  nameEn?: unknown;
  calories?: unknown;
  protein?: unknown;
  fat?: unknown;
  carbs?: unknown;
  fiber?: unknown;
  unit?: unknown;
  gramsPerUnit?: unknown;
  tag?: unknown;
};

export type CleanFood = {
  name: string;
  nameEn: string | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number | null;
  unit: string | null;
  gramsPerUnit: number | null;
  tag: string;
};

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Trả về { food } nếu hợp lệ, hoặc { error } với thông báo tiếng Việt.
export function validateFoodInput(input: FoodInput): { food: CleanFood } | { error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { error: "Vui lòng nhập tên món ăn" };
  if (name.length > 120) return { error: "Tên món quá dài (tối đa 120 ký tự)" };

  const macros = { calories: toNum(input.calories), protein: toNum(input.protein), fat: toNum(input.fat), carbs: toNum(input.carbs) };
  for (const [k, label] of [["calories", "Calo"], ["protein", "Đạm"], ["fat", "Chất béo"], ["carbs", "Tinh bột"]] as const) {
    const val = macros[k];
    if (val === null) return { error: `Chỉ số ${label} phải là số` };
    if (val < 0) return { error: `Chỉ số ${label} không được âm` };
    if (val > 1000) return { error: `Chỉ số ${label} không hợp lệ (>1000/100g)` };
  }

  const tag = typeof input.tag === "string" ? input.tag.trim() : "";
  if (!FOOD_TAGS.includes(tag as FoodTag)) return { error: "Nhóm thực phẩm không hợp lệ" };

  const fiber = input.fiber === undefined || input.fiber === null || input.fiber === "" ? null : toNum(input.fiber);
  if (fiber !== null && (fiber < 0 || fiber > 1000)) return { error: "Chỉ số Chất xơ không hợp lệ" };

  const unit = typeof input.unit === "string" && input.unit.trim() ? input.unit.trim().slice(0, 20) : null;
  const gramsPerUnit = input.gramsPerUnit === undefined || input.gramsPerUnit === null || input.gramsPerUnit === "" ? null : toNum(input.gramsPerUnit);
  if (gramsPerUnit !== null && (gramsPerUnit <= 0 || gramsPerUnit > 100000)) return { error: "Khối lượng mỗi đơn vị không hợp lệ" };
  // Có đơn vị đếm thì bắt buộc có khối lượng quy đổi và ngược lại.
  if ((unit && gramsPerUnit === null) || (!unit && gramsPerUnit !== null)) {
    return { error: "Đơn vị đếm và khối lượng mỗi đơn vị phải đi cùng nhau" };
  }

  const nameEn = typeof input.nameEn === "string" && input.nameEn.trim() ? input.nameEn.trim().slice(0, 160) : null;

  return {
    food: {
      name,
      nameEn,
      calories: macros.calories!,
      protein: macros.protein!,
      fat: macros.fat!,
      carbs: macros.carbs!,
      fiber,
      unit,
      gramsPerUnit,
      tag,
    },
  };
}

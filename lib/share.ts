// ─── Shareable plan payload ────────────────────────────────────────────────────
//
// Thực đơn (tối đa 7 ngày) được lưu vào bảng SharedPlan rồi chia sẻ qua link ngắn
// dạng /p/<ten-khach>-<mã>. Trang công khai /p/[slug] đọc bản ghi để khách xem.
// Chỉ lưu dữ liệu hiển thị (slim) cho gọn.

export interface SlimMeal {
  mealName?: string; // chỉ AI mới có (vd "Bữa 1 - Sáng (7:00)")
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface ShareDay {
  label: string;          // "Thứ 2" ... "Chủ Nhật"
  aiMeals: SlimMeal[];
  manualFoods: SlimMeal[];
}

export interface SharePlan {
  v: 1;
  client: {
    name: string;
    gender: "male" | "female";
    age: number;
    height: number;
    weight: number;
    weightGoal: string;
    der: number;
    protein: number;
    fat: number;
    carbs: number;
    date: string;
  };
  days: ShareDay[];
}

// Slug tiếng Việt: bỏ dấu, viết thường, thay ký tự lạ bằng "-"
export function slugifyName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base || "khach";
}

// Kiểm tra payload hợp lệ (dùng ở API trước khi lưu)
export function isValidSharePlan(p: unknown): p is SharePlan {
  if (!p || typeof p !== "object") return false;
  const plan = p as SharePlan;
  return (
    plan.v === 1 &&
    !!plan.client &&
    typeof plan.client.name === "string" &&
    Array.isArray(plan.days) &&
    plan.days.length > 0
  );
}

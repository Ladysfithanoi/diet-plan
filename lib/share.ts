// ─── Shareable plan payload ────────────────────────────────────────────────────
//
// Toàn bộ thực đơn (7 ngày) được nén thẳng vào URL (#hash) — KHÔNG cần database,
// không cần đăng nhập. Trang công khai /p tự giải mã hash để khách xem thực đơn.
// Chỉ lưu dữ liệu hiển thị (slim) để link gọn nhất có thể.

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

// ─── base64url <-> UTF-8 (an toàn cho tiếng Việt) ──────────────────────────────

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodePlan(plan: SharePlan): string {
  return toBase64Url(JSON.stringify(plan));
}

export function decodePlan(encoded: string): SharePlan | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as SharePlan;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.days)) return null;
    return parsed;
  } catch {
    return null;
  }
}

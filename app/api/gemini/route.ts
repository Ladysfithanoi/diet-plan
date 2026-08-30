import { NextRequest, NextResponse } from "next/server";
import { FOODS, type FoodItem } from "@/lib/foods-data";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ─── Gemini config ────────────────────────────────────────────────────────────

const API_KEYS: string[] = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(",").map(k => k.trim()).filter(Boolean)
  : [];

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

// ─── Utilities ────────────────────────────────────────────────────────────────

function shuffleFoods<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Mật độ dinh dưỡng tối thiểu để một món đủ tư cách làm "trụ" của nhóm.
// Không có ngưỡng này, solver sẽ chọn những món như tuỷ xương (1g đạm/100g) rồi
// tính ra khẩu phần 2.770g mới đủ đạm — kéo Calo ngày vọt lên gấp mấy lần mục tiêu.
const MIN_PRO_DENSITY = 15;  // g đạm/100g
const MIN_CARB_DENSITY = 15; // g bột đường/100g
const MAX_VEGGIE_KCAL = 40;  // kcal/100g
const MAX_VEGGIE_CARB = 10;  // g bột đường/100g

// Tag trong DB không phải lúc nào cũng phản ánh đúng vai trò dinh dưỡng: "Da gà"
// gắn tag protein nhưng 440kcal với P11/F44 — thực chất là nguồn fat; "Mộc nhĩ"
// gắn tag veggie nhưng 65g carbs/100g — thực chất là tinh bột. Solver vì thế xét
// theo macro thật của món, không tin tag một cách mù quáng.
function isUsableProtein(f: FoodItem): boolean {
  return f.tag === 'protein'
    && f.protein >= MIN_PRO_DENSITY
    && f.protein * 4 > f.fat * 9; // Calo phải chủ yếu đến từ đạm
}

// Rau cho suất cố định 150g: phải thực sự là rau, nếu không 150g "rau" khô có thể
// nạp thêm cả trăm kcal tinh bột mà vòng tinh chỉnh không có cách nào gỡ ra.
function isUsableVeggie(f: FoodItem): boolean {
  return f.tag === 'veggie'
    && f.calories <= MAX_VEGGIE_KCAL
    && f.carbs <= MAX_VEGGIE_CARB;
}

// Bột đạm, sữa bột, men bia, ruốc... hợp lệ về macro nhưng không ai dọn ra làm
// món mặn bữa trưa/tối. Bữa chính phải là combo cơm + thịt + rau, nên các món này
// chỉ được phép xuất hiện ở bữa sáng hoặc bữa phụ.
const NOT_MAIN_DISH = /whey|protein|bột |sữa |men bia|ruốc/i;

function isMainDishProtein(f: FoodItem): boolean {
  return !NOT_MAIN_DISH.test(f.name);
}

function isUsableStarch(f: FoodItem): boolean {
  return f.tag === 'starch' && f.carbs >= MIN_CARB_DENSITY;
}

// Trần "fat đi kèm đạm". Muốn ăn đủ P gram đạm mà không vỡ quỹ F gram fat thì
// nguồn đạm phải có tỉ lệ fat/đạm ≤ F/P. Chừa lại 25% quỹ fat cho dầu ăn + rau.
// Thiếu ràng buộc này, solver chọn đuôi lợn hay da gà rồi nạp 400g mới đủ đạm —
// fat vọt gấp mấy lần mục tiêu, mà vòng tinh chỉnh chỉ gỡ được dầu ăn nên bó tay.
function fatPerProteinCeil(macros: { protein: number; fat: number }): number {
  if (macros.protein <= 0 || macros.fat <= 0) return Infinity;
  return (macros.fat * 0.75) / macros.protein;
}

function fatRatio(f: FoodItem): number {
  return f.protein > 0 ? f.fat / f.protein : Infinity;
}

// Lọc theo trần fat/đạm; nếu DB không còn món nào đạt thì lấy các món nạc nhất
// còn lại để bữa ăn không bị khuyết đạm.
function leanestProteins(pool: FoodItem[], ceil: number): FoodItem[] {
  const fit = pool.filter(f => fatRatio(f) <= ceil);
  if (fit.length > 0) return fit;
  return [...pool].sort((a, b) => fatRatio(a) - fatRatio(b)).slice(0, 12);
}

function findExactFood(name: string): FoodItem | null {
  const q = name.trim().toLowerCase();
  return FOODS.find(f => f.name.trim().toLowerCase() === q) ?? null;
}

// Quy đổi grams "lý thuyết" → khối lượng THỰC TẾ sau khi làm tròn theo đơn vị đếm
// (vd trứng tính theo 'quả', 1 quả = 55g). Engine PHẢI tính macro trên chính con số
// này để khớp 100% với những gì hiển thị cho khách — nếu không, vòng tinh chỉnh sẽ
// hội tụ trên gram lẻ rồi phần hiển thị làm tròn lại khiến tổng ngày lệch khỏi mục tiêu.
function effectiveGrams(food: FoodItem, grams: number): number {
  if (grams <= 0) return 0;
  if (food.gramsPerUnit && food.unit) {
    const units = Math.max(1, Math.round(grams / food.gramsPerUnit));
    return units * food.gramsPerUnit;
  }
  return grams;
}

// ─── Meal Time Labels ─────────────────────────────────────────────────────────

const MEAL_TIMES: Record<number, string[]> = {
  2: ["Bữa 1 - Sáng (7:00)", "Bữa 2 - Tối (18:00)"],
  3: ["Bữa 1 - Sáng (7:00)", "Bữa 2 - Trưa (12:00)", "Bữa 3 - Tối (18:00)"],
  4: ["Bữa 1 - Sáng (7:00)", "Bữa 2 - Trưa (12:00)", "Bữa 3 - Phụ (15:30)", "Bữa 4 - Tối (18:00)"],
  5: ["Bữa 1 - Sáng (7:00)", "Bữa 2 - Phụ 1 (10:00)", "Bữa 3 - Trưa (12:00)", "Bữa 4 - Phụ 2 (15:30)", "Bữa 5 - Tối (18:00)"],
};

function getMealTimeLabel(index: number, total: number): string {
  return MEAL_TIMES[total]?.[index] ?? `Bữa ${index + 1}`;
}

// ─── Meal Templates ───────────────────────────────────────────────────────────

type MealSlotType = 'breakfast' | 'main' | 'snack';

interface MealSlot {
  type: MealSlotType;
  veggieGrams: number;  // 0 = bữa không có rau
  fruitGrams: number;   // 0 = bữa không có trái cây
}

function getMealTemplates(mealCount: number): MealSlot[] {
  switch (mealCount) {
    case 2: return [
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
    ];
    case 3: return [
      { type: 'breakfast', veggieGrams: 0,   fruitGrams: 0   },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
    ];
    case 4: return [
      { type: 'breakfast', veggieGrams: 0,   fruitGrams: 0   },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
      { type: 'snack',     veggieGrams: 0,   fruitGrams: 100 },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
    ];
    case 5: return [
      { type: 'breakfast', veggieGrams: 0,   fruitGrams: 0   },
      { type: 'snack',     veggieGrams: 0,   fruitGrams: 100 },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
      { type: 'snack',     veggieGrams: 0,   fruitGrams: 100 },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
    ];
    default: return Array.from({ length: mealCount }, () =>
      ({ type: 'main' as MealSlotType, veggieGrams: 150, fruitGrams: 0 })
    );
  }
}

// ─── AI System Instruction — tag-based food lists ─────────────────────────────

function buildNameOnlySystemInstruction(
  mealCount: number,
  macros: { calories: number; protein: number; fat: number; carbs: number },
  preferences?: { likes?: string; dislikes?: string }
): string {
  const vegNames     = shuffleFoods(FOODS.filter(isUsableVeggie)).map(f => f.name);
  const fruitNames   = shuffleFoods(FOODS.filter(f => f.tag === 'fruit')).map(f => f.name);
  const starchNames  = shuffleFoods(FOODS.filter(isUsableStarch)).map(f => f.name);

  const labels    = MEAL_TIMES[mealCount] ?? Array.from({ length: mealCount }, (_, i) => `Bữa ${i + 1}`);
  const templates = getMealTemplates(mealCount);

  const prefLines: string[] = [];
  if (preferences?.likes)    prefLines.push(`Thích: ${preferences.likes}`);
  if (preferences?.dislikes) prefLines.push(`Ghét/Dị ứng: ${preferences.dislikes}`);
  const prefBlock = prefLines.length > 0
    ? `\n5. SỞ THÍCH: ${prefLines.join(' | ')}`
    : '';

  const isLowCalHighProtein = macros.calories < 1300 && macros.protein > 120;
  const isHighCarbLowFat    = macros.carbs > 100 && macros.fat <= 60;

  // Build restricted protein list and warning block depending on scenario
  const leanProteinNames5 = FOODS.filter(f => isUsableProtein(f) && f.fat <= 5).map(f => f.name);
  const leanProteinNames8 = FOODS.filter(f => isUsableProtein(f) && f.fat <= 8).map(f => f.name);
  const ceil = fatPerProteinCeil(macros);
  const proteinNames = isLowCalHighProtein
    ? leanProteinNames5
    : isHighCarbLowFat
      ? leanProteinNames8
      : shuffleFoods(leanestProteins(FOODS.filter(isUsableProtein), ceil)).map(f => f.name);

  const leanProteinBlock = isLowCalHighProtein
    ? `\n\n⚠️ CHẾ ĐỘ THẤP CALO / CAO ĐẠM — LUẬT ĐẶC BIỆT BẮT BUỘC (${macros.calories} kcal, ${macros.protein}g đạm):\nTUYỆT ĐỐI CẤM chọn thịt lợn, trứng gà, vịt quay, gà quay, hay bất kỳ nguồn đạm có Fat > 5g/100g.\nCHỈ ĐƯỢC PHÉP chọn PROTEIN từ danh sách siêu sạch sau:\n${leanProteinNames5.join('\n')}`
    : isHighCarbLowFat
      ? `\n\n⚠️ CHẾ ĐỘ CAO CARBS / FAT THẤP — LUẬT ĐẶC BIỆT BẮT BUỘC (Carbs ${macros.carbs}g, Fat ${macros.fat}g):\nTUYỆT ĐỐI CẤM chọn trứng gà nguyên quả, gà quay có da, ba chỉ lợn, hay bất kỳ nguồn đạm có Fat > 8g/100g.\nLý do: Fat ẩn từ đạm chiếm hết quỹ Calo, tinh bột sẽ không còn chỗ đạt mốc ${macros.carbs}g.\nCHỈ ĐƯỢC PHÉP chọn PROTEIN từ danh sách đạm siêu nạc sau:\n${leanProteinNames8.join('\n')}`
      : '';

  // Per-meal slot instructions derived from templates
  const mealSlotLines = templates.map((tmpl, idx) => {
    const label  = labels[idx] ?? `Bữa ${idx + 1}`;
    const slots: string[] = ['1 PROTEIN', '1 TINH BỘT'];
    if (tmpl.veggieGrams > 0) slots.push('1-2 RAU');
    if (tmpl.fruitGrams  > 0) slots.push('1 TRÁI CÂY');
    const banned: string[] = [];
    if (tmpl.veggieGrams === 0) banned.push('RAU');
    if (tmpl.fruitGrams  === 0) banned.push('TRÁI CÂY');
    const bannedStr = banned.length > 0 ? ` | KHÔNG chọn: ${banned.join(', ')}` : '';
    // Trưa/tối là mâm cơm Việt — đạm phải là món mặn thật, không phải bột hay sữa.
    const mainNote = tmpl.type === 'main'
      ? ' | BỮA CHÍNH: PROTEIN phải là món mặn thật (thịt, cá, tôm, trứng...), CẤM bột đạm/whey/sữa bột/men bia/ruốc'
      : '';
    return `  • ${label}: ${slots.join(' + ')}${bannedStr}${mainNote}`;
  }).join('\n');

  return `Mày là chuyên gia dinh dưỡng lên thực đơn giảm cân Việt Nam. Nhiệm vụ DUY NHẤT: trả về TÊN thực phẩm — Backend tự tính 100% số gram và macro, AI KHÔNG được đặt bất kỳ con số nào.

OUTPUT BẮT BUỘC — JSON thuần, không markdown, không giải thích:
{"meal_1":["tên1","tên2",...],"meal_2":[...],...,"meal_${mealCount}":[...]}

${mealCount} bữa lần lượt: ${labels.join(' | ')}

LUẬT TUYỆT ĐỐI — VI PHẠM = OUTPUT BỊ HỦY:
1. CHỈ sao chép chính xác tên từ MENU bên dưới — sai một ký tự = backend không tìm được = bữa rỗng.
2. Cấu trúc BẮT BUỘC theo từng bữa (không được sai slot):
${mealSlotLines}
3. Không lặp cùng tên giữa các bữa.
4. Bữa Sáng ưu tiên TINH BỘT: Cơm lứt, Yến mạch, Bánh mỳ nguyên cám.
5. Bữa Trưa và Tối là mâm cơm Việt: CƠM + THỊT/CÁ + RAU. Không bao giờ đặt sữa,
   bột đạm hay thực phẩm bổ sung vào hai bữa này.${prefBlock}${leanProteinBlock}

════════════════ MENU — CHỈ ĐƯỢC CHỌN TỪ ĐÂY ════════════════

RAU (chọn cho bữa có RAU):
${vegNames.join('\n')}

TRÁI CÂY (chọn cho bữa có TRÁI CÂY):
${fruitNames.join('\n')}

TINH BỘT (chọn ĐÚNG 1/bữa):
${starchNames.join('\n')}

PROTEIN (chọn ĐÚNG 1/bữa):
${proteinNames.join('\n')}
════════════════════════════════════════════════════════════════`;
}

function buildNameOnlyUserPrompt(mealCount: number): string {
  return `Chọn tên thực phẩm thô cho ${mealCount} bữa ăn. JSON object với key meal_1 đến meal_${mealCount}. Chỉ JSON — không có text khác.`;
}

// ─── Fallback DB — dựng nameLists hợp lệ khi AI fail (parse lỗi / API chết) ────
// Đảm bảo người dùng LUÔN nhận được thực đơn thay vì lỗi "không trả thực phẩm hợp lệ".
function buildFallbackNameLists(
  mealCount: number,
  macros: { calories: number; protein: number; fat: number; carbs: number }
): Record<string, string[]> {
  const templates = getMealTemplates(mealCount);
  const used = new Set<string>();

  const isLowCalHighProtein = macros.calories < 1300 && macros.protein > 120;
  const isHighCarbLowFat    = macros.carbs > 100 && macros.fat <= 60;
  const proteinPool = shuffleFoods(
    leanestProteins(
      FOODS.filter(f =>
        isUsableProtein(f) &&
        (isLowCalHighProtein ? f.fat <= 5 : isHighCarbLowFat ? f.fat <= 8 : true)
      ),
      fatPerProteinCeil(macros)
    )
  );
  const starchPool = shuffleFoods(FOODS.filter(isUsableStarch));
  const veggiePool = shuffleFoods(FOODS.filter(isUsableVeggie));
  const fruitPool  = shuffleFoods(FOODS.filter(f => f.tag === 'fruit'));

  const take = (pool: FoodItem[], n: number): string[] => {
    const out: string[] = [];
    for (const f of pool) {
      if (out.length >= n) break;
      if (!used.has(f.name)) { out.push(f.name); used.add(f.name); }
    }
    return out;
  };

  const result: Record<string, string[]> = {};
  for (let i = 0; i < mealCount; i++) {
    const tmpl = templates[i];
    const names = [...take(proteinPool, 1), ...take(starchPool, 1)];
    if (tmpl.veggieGrams > 0) names.push(...take(veggiePool, 1));
    if (tmpl.fruitGrams  > 0) names.push(...take(fruitPool, 1));
    result[`meal_${i + 1}`] = names;
  }
  return result;
}

// ─── Parse Name-Only Response ─────────────────────────────────────────────────

function parseNameOnlyResponse(
  text: string,
  mealCount: number
): Record<string, string[]> | null {
  try {
    const cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const result: Record<string, string[]> = {};
    for (let i = 1; i <= mealCount; i++) {
      const key = `meal_${i}`;
      const val = (parsed as Record<string, unknown>)[key];
      result[key] = Array.isArray(val) ? val.map(String).filter(Boolean) : [];
    }
    return result;
  } catch {
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiMealRaw {
  mealName: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface MealSolution {
  mealName: string;
  items: Array<{ food: FoodItem; grams: number }>;
}

// ─── Core Diet Engine — Clean-Sheet Solver ───────────────────────────────────
//
//  Luồng tuyến tính, không có scale-down, không break nửa chừng:
//
//  Bước 1 : Khoá RAU(150g)/QUẢ(100g) theo template → đo vfPro/vfFat/vfCar
//  Bước 2 : PROTEIN  grams = perMealPro / food.protein × 100
//           Fat ceiling 8g/100g khi carbs>100 && fat≤60 (chặn trứng/gà quay/ba chỉ)
//  Bước 3 : TINH BỘT grams = perMealCarbs / food.carbs × 100
//           Nếu grams < 50g → bỏ bữa đó, dồn carbs sang bữa chính cuối
//  Bước 4 : FAT — bù dầu ăn để lấp fat gap (chia đều các bữa)
//  Bước 5 : Micro-Tuning Loop ≤ 5% error tại bữa chính cuối (±5g protein/starch, ±2/-1g dầu)
function runCoreEngine(
  nameLists: Record<string, string[]>,
  macros: { calories: number; protein: number; fat: number; carbs: number },
  mealCount: number
): MealSolution[] {
  const templates = getMealTemplates(mealCount);
  const used      = new Set<string>();
  const isWhey    = (f: FoodItem) => f.name.toLowerCase().includes('whey');
  const needsLean = macros.carbs > 100 && macros.fat <= 60;
  const LEAN_CEIL = 8; // g fat/100g
  const PRO_FAT_CEIL = fatPerProteinCeil(macros); // g fat / g đạm

  // ── pickFood: AI namelist trước, DB lean fallback cho protein ────────────────
  function pickFood(
    mealIdx: number,
    tag: string,
    opts: { noWhey?: boolean; maxFat?: number } = {}
  ): FoodItem | null {
    const names  = nameLists[`meal_${mealIdx + 1}`] ?? [];
    // Trưa/tối là bữa chính → chỉ nhận đạm dạng món ăn thật (thịt, cá, trứng...)
    const mainDishOnly = tag === 'protein' && templates[mealIdx]?.type === 'main';
    // Món AI gợi ý vẫn phải qua ngưỡng mật độ + trần fat/đạm, nếu không khẩu phần
    // sẽ phi thực tế hoặc fat vượt quỹ.
    const dense = (f: FoodItem) =>
      tag === 'protein'
        ? isUsableProtein(f) && fatRatio(f) <= PRO_FAT_CEIL && (!mainDishOnly || isMainDishProtein(f))
        : tag === 'starch' ? isUsableStarch(f) : true;

    const fromAI = names
      .map(n => findExactFood(n))
      .find((f): f is FoodItem =>
        f !== null &&
        f.tag === tag &&
        dense(f) &&
        !used.has(f.name) &&
        (!opts.noWhey  || !isWhey(f)) &&
        (opts.maxFat === undefined || f.fat <= opts.maxFat)
      ) ?? null;
    if (fromAI) return fromAI;

    // AI không đưa món hợp lệ cho nhóm này → lấy từ DB để bữa ăn không bị khuyết.
    if (tag === 'protein' || tag === 'starch') {
      const base = FOODS.filter(f =>
        f.tag === tag &&
        !used.has(f.name) &&
        (!opts.noWhey || !isWhey(f)) &&
        (opts.maxFat === undefined || f.fat <= opts.maxFat)
      );
      const pool = tag === 'protein'
        ? shuffleFoods(leanestProteins(
            base.filter(f => isUsableProtein(f) && (!mainDishOnly || isMainDishProtein(f))),
            PRO_FAT_CEIL
          ))
        : shuffleFoods(base.filter(isUsableStarch));
      return pool[0] ?? null;
    }
    return null;
  }

  function pickVeggies(mealIdx: number): FoodItem[] {
    const names = nameLists[`meal_${mealIdx + 1}`] ?? [];
    const fromAI = names
      .map(n => findExactFood(n))
      .filter((f): f is FoodItem => f !== null && isUsableVeggie(f) && !used.has(f.name))
      .slice(0, 2);
    if (fromAI.length > 0) return fromAI;
    // AI chỉ gợi ý "rau" nhiều tinh bột → lấy rau thật từ DB cho suất 150g.
    return shuffleFoods(FOODS.filter(f => isUsableVeggie(f) && !used.has(f.name))).slice(0, 1);
  }

  function dayMacro() {
    let cal = 0, pro = 0, fat = 0, car = 0;
    for (const its of mealItems) {
      for (const { food, grams } of its) {
        const g = effectiveGrams(food, grams); // đo trên khối lượng thực hiển thị
        cal += food.calories * g / 100;
        pro += food.protein  * g / 100;
        fat += food.fat      * g / 100;
        car += food.carbs    * g / 100;
      }
    }
    return { cal, pro, fat, car };
  }

  const mealItems: Array<Array<{ food: FoodItem; grams: number }>> =
    Array.from({ length: mealCount }, () => []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Bước 1: Khoá RAU & QUẢ — đo tổng macro VF
  // ─────────────────────────────────────────────────────────────────────────────
  let vfPro = 0, vfCar = 0;

  // Rau cũng mang carbs. Với mục tiêu Calo thấp, quỹ carbs không đủ chỗ cho 150g
  // rau mỗi bữa chính — và phần dư đó vòng tinh chỉnh không gỡ được (nó chỉ chỉnh
  // được nhóm tinh bột). Nên phải co suất rau cho vừa quỹ, giữ tối thiểu 50g/bữa.
  const VEGGIE_MIN_GRAMS = 50;
  const vegCarbBudget = Math.max(0, macros.carbs * 0.25);
  let vegCarbUsed = 0;

  for (let i = 0; i < mealCount; i++) {
    const tmpl = templates[i];

    if (tmpl.veggieGrams > 0) {
      const vegs = pickVeggies(i);
      if (vegs.length > 0) {
        const density = vegs.reduce((s, v) => s + v.carbs, 0) / vegs.length;
        let total = tmpl.veggieGrams;
        if (density > 0) {
          const room = Math.max(0, vegCarbBudget - vegCarbUsed);
          total = Math.min(total, Math.max(VEGGIE_MIN_GRAMS, Math.round((room / density) * 100)));
        }
        const gEach = Math.round(total / vegs.length);
        for (const v of vegs) {
          mealItems[i].push({ food: v, grams: gEach });
          used.add(v.name);
          vfPro += v.protein * gEach / 100;
          vfCar += v.carbs   * gEach / 100;
          vegCarbUsed += v.carbs * gEach / 100;
        }
      }
    }

    if (tmpl.fruitGrams > 0) {
      const fruit = pickFood(i, 'fruit');
      if (fruit) {
        mealItems[i].push({ food: fruit, grams: tmpl.fruitGrams });
        used.add(fruit.name);
        vfPro += fruit.protein * tmpl.fruitGrams / 100;
        vfCar += fruit.carbs   * tmpl.fruitGrams / 100;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Bước 2: PROTEIN — grams = perMealPro / food.protein × 100
  // ─────────────────────────────────────────────────────────────────────────────
  const protOpts  = needsLean ? { maxFat: LEAN_CEIL } : {};
  const perMealPro = Math.max(5, (macros.protein - vfPro) / mealCount);

  for (let i = 0; i < mealCount; i++) {
    const noWheyLast = mealCount >= 3 && i === mealCount - 1;
    const meat = pickFood(i, 'protein', { ...protOpts, noWhey: noWheyLast });
    if (!meat || meat.protein <= 0) continue;

    if (isWhey(meat)) {
      const wheyG = Math.max(30, Math.min(100, Math.round((perMealPro / meat.protein) * 100)));
      mealItems[i].push({ food: meat, grams: wheyG });
      used.add(meat.name);
      const rem = perMealPro - (meat.protein * wheyG / 100);
      if (rem >= 5) {
        const real = pickFood(i, 'protein', { ...protOpts, noWhey: true });
        if (real && real.protein > 0) {
          mealItems[i].push({ food: real, grams: Math.round((rem / real.protein) * 100) });
          used.add(real.name);
        }
      }
    } else {
      mealItems[i].push({ food: meat, grams: Math.round((perMealPro / meat.protein) * 100) });
      used.add(meat.name);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Bước 3: TINH BỘT — grams = perMealCarbs / food.carbs × 100
  //   grams < 50g → bỏ bữa đó, dồn carbs sang bữa chính cuối cùng
  // ─────────────────────────────────────────────────────────────────────────────
  const netCarbs     = Math.max(0, macros.carbs - vfCar);
  const perMealCarbs = mealCount > 0 ? netCarbs / mealCount : 0;

  const lastMainIdx = (() => {
    for (let i = mealCount - 1; i >= 0; i--) {
      if (templates[i].type === 'main') return i;
    }
    return mealCount - 1;
  })();

  let carbsCarry = 0;

  // Bữa chính = cơm + thịt + rau, nên đã có quỹ carbs thì trưa/tối phải có tinh bột;
  // chỉ bữa sáng/phụ mới được dồn suất quá nhỏ sang bữa khác.
  const MAIN_STARCH_MIN = 40;

  for (let i = 0; i < mealCount; i++) {
    const isLast    = i === lastMainIdx;
    const isMain    = templates[i].type === 'main';
    const carbsHere = isLast ? perMealCarbs + carbsCarry : perMealCarbs;
    if (carbsHere <= 0) continue;

    const starch = pickFood(i, 'starch');
    if (!starch || starch.carbs <= 0) {
      if (!isLast) carbsCarry += carbsHere;
      continue;
    }

    let g = Math.round((carbsHere / starch.carbs) * 100);
    if (!isLast && !isMain && g < 50) {
      carbsCarry += carbsHere;
      continue;
    }
    if (isMain && g < MAIN_STARCH_MIN) g = MAIN_STARCH_MIN;
    if (g > 0) {
      mealItems[i].push({ food: starch, grams: g });
      used.add(starch.name);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Bước 4: FAT — bù dầu ăn, chia đều các bữa
  // ─────────────────────────────────────────────────────────────────────────────
  const oilFood = FOODS.find(f => f.name === 'Dầu ăn (Chung)')
    ?? FOODS.find(f => f.tag === 'fat' && f.fat >= 80 && f.calories > 0);

  {
    const { fat: currentFat } = dayMacro();
    const fatGap = macros.fat - currentFat;
    if (fatGap > 3 && oilFood && oilFood.fat > 0) {
      const perMealOilG = Math.round((fatGap / oilFood.fat * 100) / mealCount);
      if (perMealOilG >= 1) {
        for (let i = 0; i < mealCount; i++) {
          mealItems[i].push({ food: oilFood, grams: perMealOilG });
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Bước 5: Micro-Tuning Loop — sai số ≤ 5% tại bữa chính cuối cùng
  // ─────────────────────────────────────────────────────────────────────────────
  const protFB = (() => {
    const names = nameLists[`meal_${lastMainIdx + 1}`] ?? [];
    return names.map(n => findExactFood(n))
      .find((f): f is FoodItem =>
        f !== null && isUsableProtein(f) && !isWhey(f) &&
        fatRatio(f) <= PRO_FAT_CEIL &&
        (!needsLean || f.fat <= LEAN_CEIL)
      )
      ?? leanestProteins(
        FOODS.filter(f =>
          isUsableProtein(f) && !isWhey(f) && f.protein > 20 &&
          (!needsLean || f.fat <= LEAN_CEIL)
        ),
        PRO_FAT_CEIL
      )[0]
      ?? null;
  })();

  const starchFB = (() => {
    const names = nameLists[`meal_${lastMainIdx + 1}`] ?? [];
    return names.map(n => findExactFood(n))
      .find((f): f is FoodItem => f !== null && isUsableStarch(f))
      ?? FOODS.find(f => isUsableStarch(f) && f.carbs > 20)
      ?? null;
  })();

  function getOrAdd(
    mealIdx: number,
    tag: string,
    fallback: FoodItem | null
  ): { food: FoodItem; grams: number } | null {
    const hit = mealItems[mealIdx].find(x => x.food.tag === tag);
    if (hit) return hit;
    if (!fallback) return null;
    const ni = { food: fallback, grams: 0 };
    mealItems[mealIdx].push(ni);
    return ni;
  }

  // Làm tròn về bội số đơn vị với món đếm theo quả/cái, để con số engine tính
  // trùng khít con số hiển thị (xem effectiveGrams).
  const snap = (food: FoodItem, grams: number) =>
    food.gramsPerUnit && food.unit
      ? effectiveGrams(food, grams)
      : Math.max(0, Math.round(grams));

  // Sàn khẩu phần cho bữa chính: trưa/tối luôn phải còn thịt và cơm trên đĩa.
  const MAIN_PROTEIN_MIN = 80;
  const floorGrams = (tag: string, mealIdx: number): number => {
    if (templates[mealIdx]?.type !== 'main') return 0;
    if (tag === 'protein') return MAIN_PROTEIN_MIN;
    if (tag === 'starch')  return MAIN_STARCH_MIN;
    return 0;
  };

  // Cộng/trừ `deltaNutrient` gram dưỡng chất `key` bằng cách chỉnh khẩu phần nhóm `tag`.
  // Thêm thì dồn vào bữa chính cuối; bớt thì rút ngược từ bữa cuối lên đầu — bước
  // trước đây chỉ đụng được vào bữa chính cuối nên phần dư nằm ở các bữa khác
  // (nhất là dầu ăn rải đều mọi bữa) không bao giờ gỡ ra được.
  function adjustTag(
    tag: string,
    key: 'protein' | 'fat' | 'carbs',
    deltaNutrient: number,
    fallback: FoodItem | null
  ): boolean {
    if (deltaNutrient > 0) {
      const it = getOrAdd(lastMainIdx, tag, fallback);
      if (!it || it.food[key] <= 0) return false;
      const before = it.grams;
      it.grams = snap(it.food, it.grams + (deltaNutrient / it.food[key]) * 100);
      return it.grams !== before;
    }

    let remain = -deltaNutrient;
    let changed = false;
    for (let i = mealCount - 1; i >= 0 && remain > 0.01; i--) {
      for (const it of mealItems[i]) {
        if (it.food.tag !== tag || it.grams <= 0 || it.food[key] <= 0) continue;
        // Bữa chính phải giữ được suất thịt/cơm tối thiểu, nếu không vòng tinh chỉnh
        // sẽ gọt sạch đĩa thịt của bữa trưa/tối để ép macro về đúng mục tiêu.
        const floor = floorGrams(tag, i);
        if (it.grams <= floor) continue;
        const cut = Math.min(it.grams - floor, (remain / it.food[key]) * 100);
        const before = it.grams;
        it.grams = Math.max(floor, snap(it.food, it.grams - cut));
        if (it.grams !== before) changed = true;
        remain -= ((before - it.grams) * it.food[key]) / 100;
        if (remain <= 0.01) break;
      }
    }
    return changed;
  }

  // Sai số cho phép: tương đối 5%, nhưng khi mục tiêu ~0 thì phải xét tuyệt đối —
  // trước đây target 0 bị coi là "sai số 0" nên phần dư (vd carbs từ rau) không
  // bao giờ được cắt.
  const tol = (target: number, absTol: number) => Math.max(absTol, target * 0.05);

  let prev = '';
  for (let iter = 0; iter < 40; iter++) {
    const { cal, pro, fat, car } = dayMacro();

    const dPro = macros.protein - pro;
    const dFat = macros.fat     - fat;
    const dCar = macros.carbs   - car;
    const calOk = macros.calories <= 0
      || Math.abs(cal - macros.calories) / macros.calories <= 0.05;

    if (
      Math.abs(dPro) <= tol(macros.protein, 5) &&
      Math.abs(dFat) <= tol(macros.fat, 3) &&
      Math.abs(dCar) <= tol(macros.carbs, 5) &&
      calOk
    ) break;

    // Không tiến triển nữa (vd món đếm theo quả không nhích nổi nửa đơn vị) → dừng
    // thay vì quay không đủ 100 vòng như trước.
    const sig = `${pro.toFixed(1)}|${fat.toFixed(1)}|${car.toFixed(1)}`;
    if (sig === prev) break;
    prev = sig;

    // Mỗi macro nằm trong dung sai riêng vẫn có thể cộng dồn thành lệch Calo lớn
    // (5g đạm + 3g fat + 5g carbs ≈ 67 kcal — tới 8% của một mục tiêu 800 kcal).
    // Khi Calo còn lệch thì siết dung sai lại để vòng lặp tiếp tục gọt.
    const k = calOk ? 1 : 0.3;

    let changed = false;
    if (Math.abs(dPro) > tol(macros.protein, 5) * k) {
      changed = adjustTag('protein', 'protein', dPro, protFB) || changed;
    }
    if (Math.abs(dCar) > tol(macros.carbs, 5) * k) {
      changed = adjustTag('starch', 'carbs', dCar, starchFB) || changed;
    }
    if (Math.abs(dFat) > tol(macros.fat, 3) * k) {
      changed = adjustTag('fat', 'fat', dFat, oilFood ?? null) || changed;
    }
    if (!changed) break;
  }

  for (let m = 0; m < mealItems.length; m++) {
    mealItems[m] = mealItems[m].filter(x => x.grams > 0);
  }

  return mealItems.map((items, i) => ({ mealName: getMealTimeLabel(i, mealCount), items }));
}

// ─── Convert Solution → AiMealRaw ─────────────────────────────────────────────

function mealSolutionToAiMeal(solution: MealSolution): AiMealRaw {
  let calories = 0, protein = 0, fat = 0, carbs = 0;
  const nameParts: string[] = [];
  for (const { food, grams } of solution.items) {
    // Thực phẩm đếm theo đơn vị (vd trứng → 'quả'): làm tròn về số nguyên đơn vị,
    // hiển thị "2 quả" và tính macro theo đúng khối lượng đã làm tròn.
    // effectiveGrams dùng CHUNG với engine để hiển thị và tính toán luôn khớp nhau.
    const effGrams = effectiveGrams(food, grams);
    let label: string;
    if (food.gramsPerUnit && food.unit) {
      label = `${food.name} ${Math.round(effGrams / food.gramsPerUnit)} ${food.unit}`;
    } else {
      label = `${food.name} ${Math.round(grams)}g`;
    }
    calories += food.calories * effGrams / 100;
    protein  += food.protein  * effGrams / 100;
    fat      += food.fat      * effGrams / 100;
    carbs    += food.carbs    * effGrams / 100;
    nameParts.push(label);
  }
  return {
    mealName: solution.mealName,
    name:     nameParts.join(' + '),
    calories: Math.max(0, Math.round(calories)),
    protein:  Math.max(0, Math.round(protein)),
    fat:      Math.max(0, Math.round(fat)),
    carbs:    Math.max(0, Math.round(carbs)),
  };
}

// ─── Gemini API ───────────────────────────────────────────────────────────────

function isRetryableStatus(status: number): boolean {
  return [400, 429, 500, 503].includes(status);
}

async function callGemini(prompt: string, systemInstruction: string): Promise<string> {
  if (API_KEYS.length === 0) {
    throw new Error("Chưa cấu hình GEMINI_API_KEYS trong .env.local (định dạng: key1,key2,...)");
  }
  let lastStatus = 0;
  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[i];
    let response: Response;
    try {
      response = await fetch(`${GEMINI_URL}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.8,
            maxOutputTokens: 512,
          },
        }),
      });
    } catch (networkErr) {
      console.log(`[Gemini] Key #${i + 1} lỗi mạng:`, networkErr);
      continue;
    }
    if (isRetryableStatus(response.status)) {
      console.log(`[Gemini] Key #${i + 1} HTTP ${response.status}, thử key tiếp`);
      lastStatus = response.status;
      continue;
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API lỗi HTTP ${response.status}: ${body}`);
    }
    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini không trả về nội dung hợp lệ");
    return text;
  }
  throw new Error(
    `Tất cả ${API_KEYS.length} key đều không khả dụng (lỗi cuối: HTTP ${lastStatus}). Vui lòng thêm key mới hoặc thử lại sau.`
  );
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

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

  try {
    const body = await req.json() as {
      macros?: { calories: number; protein: number; fat: number; carbs: number };
      mealCount?: number;
      preferences?: { likes?: string; dislikes?: string };
    };
    const { macros, mealCount, preferences } = body;

    if (!macros || macros.calories <= 0) {
      return NextResponse.json({ error: "Thiếu hoặc sai thông tin macros" }, { status: 400 });
    }
    if (!mealCount || mealCount < 2 || mealCount > 5) {
      return NextResponse.json({ error: "Số bữa không hợp lệ (phải từ 2–5)" }, { status: 400 });
    }
    if (mealCount === 4 && macros.calories < 1600) {
      return NextResponse.json({ error: "Không đủ Calories để thiết lập chế độ 4 bữa đầy đủ dưỡng chất. Vui lòng chọn số bữa ít hơn hoặc tăng mục tiêu Calories." }, { status: 400 });
    }
    if (mealCount === 5 && macros.calories < 2000) {
      return NextResponse.json({ error: "Không đủ Calories để thiết lập chế độ 5 bữa đầy đủ dưỡng chất. Vui lòng chọn số bữa ít hơn hoặc tăng mục tiêu Calories." }, { status: 400 });
    }

    // Step 1: AI trả về tên thực phẩm
    const systemInstruction = buildNameOnlySystemInstruction(mealCount, macros, preferences);
    const userPrompt        = buildNameOnlyUserPrompt(mealCount);

    const isEmpty = (nl: Record<string, string[]> | null) =>
      !nl || Object.values(nl).every(arr => arr.length === 0);

    let nameLists: Record<string, string[]> | null = null;
    try {
      let rawNames = await callGemini(userPrompt, systemInstruction);
      nameLists = parseNameOnlyResponse(rawNames, mealCount);

      if (isEmpty(nameLists)) {
        console.log('[Solver] Name-only response invalid, retrying...');
        rawNames = await callGemini(
          `${userPrompt}\n\nLần trước JSON sai format. Trả về ĐÚNG: {"meal_1":[...],...,"meal_${mealCount}":[...]}`,
          systemInstruction
        );
        nameLists = parseNameOnlyResponse(rawNames, mealCount);
      }
    } catch (aiErr) {
      console.log('[Solver] Gemini lỗi, chuyển sang thực đơn dự phòng từ DB:', aiErr);
      nameLists = null;
    }

    // AI fail (parse lỗi hoặc API chết) → dựng thực đơn hợp lệ từ DB thay vì báo lỗi
    if (isEmpty(nameLists)) {
      console.log('[Solver] Dùng fallback DB để đảm bảo luôn có thực đơn');
      nameLists = buildFallbackNameLists(mealCount, macros);
    }
    const finalLists = nameLists as Record<string, string[]>;

    // Step 2: 10-step sequential solver
    const solutions = runCoreEngine(finalLists, macros, mealCount);

    // Step 3: Convert → AiMealRaw (macro từ DB × gram / 100)
    const meals: AiMealRaw[] = solutions.map(mealSolutionToAiMeal);

    const dayTotal = meals.reduce(
      (a, m) => ({ cal: a.cal + m.calories, prot: a.prot + m.protein }),
      { cal: 0, prot: 0 }
    );
    console.log(
      `[Solver] Day totals → Cal: ${dayTotal.cal}/${macros.calories} ` +
      `(${((dayTotal.cal / macros.calories - 1) * 100).toFixed(1)}%) | ` +
      `Protein: ${dayTotal.prot}/${macros.protein} ` +
      `(${((dayTotal.prot / macros.protein - 1) * 100).toFixed(1)}%)`
    );

    return NextResponse.json({ result: JSON.stringify(meals) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định từ Gemini";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

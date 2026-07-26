"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { NutritionResult } from "./DietForm";
import { FOODS, type FoodItem } from "@/lib/foods-data";
import { getCookingTip } from "@/lib/cooking-tips";
import type { SharePlan, SlimMeal } from "@/lib/share";
import AddFoodModal, { type SavedFood } from "./AddFoodModal";

// ─── 7 ngày trong tuần ─────────────────────────────────────────────────────────

export const DAY_LABELS = [
  "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật",
] as const;

// Mỗi ngày có thực đơn riêng, hoàn toàn độc lập với các ngày còn lại.
interface DayPlan {
  aiMeals: AiMeal[] | null;
  manualFoods: ManualFood[];
}

function makeEmptyDays(): DayPlan[] {
  return DAY_LABELS.map(() => ({ aiMeals: null, manualFoods: [] }));
}

function dayHasData(d: DayPlan): boolean {
  return (!!d.aiMeals && d.aiMeals.length > 0) || d.manualFoods.length > 0;
}

// Ngày kèm nhãn — dùng cho PDF & link chia sẻ
interface PdfDay {
  label: string;
  aiMeals: AiMeal[] | null;
  manualFoods: ManualFood[];
}

// ─── Types ────────────────────────────────────────────────────────────────────

// Flat structure — one object per meal, foods listed as a single string.
// Simpler JSON = fewer tokens = faster + less likely to hit rate limits.
interface AiMeal {
  mealName: string;  // e.g. "Bữa 1 - Sáng (7:00)"
  name: string;      // e.g. "Cơm lứt 200g + Cá lóc hấp 150g + Rau cải luộc 100g"
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface SavedIngredient {
  food: FoodItem;
  grams: number;
}

interface ManualFood {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  ingredients: SavedIngredient[];
}

type Tab = "ai" | "manual";
type MealCount = 2 | 3 | 4 | 5;

interface IngredientRow {
  id: string;
  query: string;
  food: FoodItem | null;
  grams: number;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
}

function parseAiResponse(raw: string): AiMeal[] {
  const cleaned = stripMarkdown(raw);
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("AI trả về dữ liệu không đúng định dạng mảng");
  return (parsed as Record<string, unknown>[]).map((item, i) => ({
    mealName: String(item.mealName ?? `Bữa ${i + 1}`),
    name: String(item.name ?? ""),
    calories: Math.max(0, Math.round(Number(item.calories ?? 0))),
    protein: Math.max(0, Math.round(Number(item.protein ?? 0))),
    fat:     Math.max(0, Math.round(Number(item.fat     ?? 0))),
    carbs:   Math.max(0, Math.round(Number(item.carbs   ?? 0))),
  }));
}

// ─── Food search helpers ──────────────────────────────────────────────────────

function newRow(): IngredientRow {
  return { id: `${Date.now()}-${Math.random()}`, query: "", food: null, grams: 100 };
}

// Nhóm đồ uống đo theo ml — hiển thị đơn vị "ml" thay vì "g" (1ml ≈ 1g)
const LIQUID_TAGS: ReadonlySet<FoodItem["tag"]> = new Set(["beverage", "softdrink", "alcohol", "coffee"]);
function unitFor(food: FoodItem | null): string {
  if (!food) return "g";
  if (food.unit) return food.unit; // vd trứng → 'quả'
  return LIQUID_TAGS.has(food.tag) ? "ml" : "g";
}

// Quy đổi số lượng nhập (theo đơn vị hiển thị) → gram để tính macro.
// Thực phẩm đếm theo quả (gramsPerUnit) thì qty là số quả; còn lại qty chính là gram/ml.
function toGrams(food: FoodItem, qty: number): number {
  return food.gramsPerUnit ? qty * food.gramsPerUnit : qty;
}

function computeRowMacros(food: FoodItem, qty: number) {
  const r = toGrams(food, qty) / 100;
  return {
    calories: Math.round(food.calories * r),
    protein: Math.round(food.protein * r),
    fat: Math.round(food.fat * r),
    carbs: Math.round(food.carbs * r),
  };
}

function searchFoods(query: string, extra: FoodItem[] = []): FoodItem[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  return [...extra, ...FOODS].filter(f =>
    f.name.toLowerCase().includes(q) ||
    (f.nameEn ?? '').toLowerCase().includes(q)
  )
    .sort((a, b) => {
      const aS = a.name.toLowerCase().startsWith(q) || (a.nameEn ?? '').toLowerCase().startsWith(q);
      const bS = b.name.toLowerCase().startsWith(q) || (b.nameEn ?? '').toLowerCase().startsWith(q);
      return aS === bS ? 0 : aS ? -1 : 1;
    })
    .slice(0, 8);
}

// ─── TrackingBar ──────────────────────────────────────────────────────────────

function TrackingBar({
  label, current, target, color,
}: {
  label: string; current: number; target: number; color: string;
}) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const over = current > target;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(20,17,14,0.5)" }}>{label}</span>
        <span style={{ fontSize: "0.75rem", color: over ? "#B5651E" : "rgba(20,17,14,0.38)" }}>
          {over ? `+${Math.round(current - target)} vượt` : `còn ${Math.round(target - current)}`}
        </span>
      </div>
      <div style={{ height: "6px", borderRadius: "99px", background: "rgba(20,17,14,0.08)" }}>
        <div
          style={{
            height: "100%",
            borderRadius: "99px",
            width: `${pct}%`,
            background: over ? "#B5651E" : color,
            transition: "width 0.35s ease",
          }}
        />
      </div>
    </div>
  );
}

// ─── AiMealCard ───────────────────────────────────────────────────────────────

function AiMealCard({ meal }: { meal: AiMeal }) {
  const cookingTip = getCookingTip(meal.name);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(20,17,14,0.1)" }}>
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ background: "rgba(181,101,30,0.05)" }}
      >
        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#B5651E" }}>{meal.mealName}</span>
        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#14110E" }}>
          {meal.calories} kcal
        </span>
      </div>
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <p style={{ fontSize: "0.875rem", color: "#14110E", lineHeight: 1.55, flex: 1 }}>
          {meal.name}
        </p>
        <p className="flex-shrink-0 text-right" style={{ fontSize: "0.75rem", color: "rgba(20,17,14,0.45)", lineHeight: 1.8 }}>
          P: {Math.round(meal.protein)}g<br />
          F: {Math.round(meal.fat)}g<br />
          C: {Math.round(meal.carbs)}g
        </p>
      </div>
      {cookingTip && (
        <div
          className="px-4 py-2.5 flex items-start gap-2"
          style={{ borderTop: "1px dashed rgba(20,17,14,0.12)", background: "rgba(20,17,14,0.015)" }}
        >
          <span style={{ fontSize: "0.8rem", lineHeight: 1.5 }} aria-hidden="true">👨‍🍳</span>
          <p style={{ fontSize: "0.75rem", color: "rgba(20,17,14,0.55)", lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: "#B5651E" }}>Gợi ý chế biến: </span>
            {cookingTip}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── PdfTemplate (rendered off-screen for html2canvas) ────────────────────────

function PdfTemplate({
  result, days, date,
}: {
  result: NutritionResult;
  days: PdfDay[];
  date: string;
}) {
  const GOAL_LABEL: Record<string, string> = {
    lose: "Giảm cân", gain: "Tăng cân", maintain: "Duy trì",
  };

  const th: React.CSSProperties = {
    padding: "9px 13px",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    background: "#14110E",
    color: "#F6F2EA",
    fontFamily: "Montserrat, sans-serif",
    textAlign: "left",
  };
  const thDark: React.CSSProperties = { ...th, background: "#14110E" };
  const td: React.CSSProperties = {
    padding: "9px 13px",
    fontSize: "12px",
    borderBottom: "1px solid rgba(20,17,14,0.07)",
    color: "#14110E",
    fontFamily: "Montserrat, sans-serif",
  };
  const tdRight: React.CSSProperties = { ...td, textAlign: "right" };
  const tdCenter: React.CSSProperties = { ...td, textAlign: "center" };
  const tdBold: React.CSSProperties = { ...td, fontWeight: 700 };

  return (
    <div style={{ background: "#F6F2EA", fontFamily: "Montserrat, sans-serif", color: "#14110E" }}>
      {/* ── Header ── */}
      <div style={{ background: "#14110E", padding: "28px 40px 24px" }}>
        <div style={{ fontSize: "30px", fontWeight: 900, color: "#F6F2EA", letterSpacing: "-0.03em", lineHeight: 1 }}>
          DIET PLAN
        </div>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)", marginTop: "6px", letterSpacing: "0.04em" }}>
          Máy Tính Dinh Dưỡng Chuyên Sâu
        </div>
      </div>

      {/* ── Client info ── */}
      <div style={{ padding: "24px 40px", display: "flex", gap: "32px", flexWrap: "wrap" }}>
        {[
          { label: "Khách hàng", value: result.name, large: true },
          { label: "Ngày tạo", value: date },
          { label: "Mục tiêu", value: GOAL_LABEL[result.weightGoal] ?? result.weightGoal },
          {
            label: "Thông số",
            value: `${result.gender === "male" ? "Nam" : "Nữ"} · ${result.age}t · ${result.height}cm · ${result.weight}kg`,
          },
          { label: "Số ngày thực đơn", value: `${days.length} ngày` },
        ].map((item) => (
          <div key={item.label}>
            <div style={{ fontSize: "9px", color: "rgba(20,17,14,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "4px" }}>
              {item.label}
            </div>
            <div style={{ fontSize: item.large ? "20px" : "13px", fontWeight: item.large ? 800 : 600 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Nutrition targets ── */}
      <div style={{ padding: "0 40px 24px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(20,17,14,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "10px" }}>
          Mục tiêu dinh dưỡng hàng ngày
        </div>
        <div className="w-full overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Chỉ số</th>
              <th style={{ ...th, textAlign: "right" }}>Mục tiêu / ngày</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "DER (Calo mục tiêu)", value: `${result.der.toLocaleString("vi-VN")} kcal` },
              { label: "Protein", value: `${result.protein}g` },
              { label: "Fat", value: `${result.fat}g` },
              { label: "Carbs", value: `${result.carbs}g` },
            ].map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#F6F2EA" : "rgba(20,17,14,0.018)" }}>
                <td style={td}>{row.label}</td>
                <td style={{ ...tdRight, fontWeight: 600 }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* ── Mỗi ngày một mục riêng ── */}
      {days.map((day, dayIdx) => {
        const aiMeals = day.aiMeals;
        const manualFoods = day.manualFoods;

        const aiGrand = aiMeals
          ? aiMeals.reduce(
              (a, m) => ({ cal: a.cal + m.calories, p: a.p + m.protein, f: a.f + m.fat, c: a.c + m.carbs }),
              { cal: 0, p: 0, f: 0, c: 0 }
            )
          : null;
        const manualTotal = manualFoods.reduce(
          (a, f) => ({ cal: a.cal + f.calories, p: a.p + f.protein, f: a.f + f.fat, c: a.c + f.carbs }),
          { cal: 0, p: 0, f: 0, c: 0 }
        );

        return (
          <div
            key={dayIdx}
            style={{ pageBreakInside: "avoid", borderTop: "2px solid rgba(20,17,14,0.08)" }}
          >
            {/* Tên ngày */}
            <div style={{ padding: "18px 40px 4px" }}>
              <span style={{
                display: "inline-block",
                background: "#14110E",
                color: "#F6F2EA",
                fontSize: "14px",
                fontWeight: 800,
                letterSpacing: "0.02em",
                padding: "6px 16px",
                borderRadius: "999px",
              }}>
                📅 {day.label}
              </span>
            </div>

            {/* AI Meal table */}
            {aiMeals && aiMeals.length > 0 && (
              <div style={{ padding: "10px 40px 18px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(20,17,14,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "10px" }}>
                  Kế hoạch thực đơn
                </div>
                <div className="w-full overflow-x-auto">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, whiteSpace: "nowrap" }}>Bữa ăn</th>
                      <th style={thDark}>Thực đơn chi tiết</th>
                      <th style={{ ...thDark, textAlign: "center" }}>Calo</th>
                      <th style={{ ...thDark, textAlign: "center" }}>P(g)</th>
                      <th style={{ ...thDark, textAlign: "center" }}>F(g)</th>
                      <th style={{ ...thDark, textAlign: "center" }}>C(g)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiMeals.map((meal, i) => {
                      const tip = getCookingTip(meal.name);
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#F6F2EA" : "rgba(20,17,14,0.018)" }}>
                          <td style={{ ...tdBold, color: "#B5651E", whiteSpace: "nowrap" }}>{meal.mealName}</td>
                          <td style={td}>
                            {meal.name}
                            {tip && (
                              <span style={{ display: "block", fontSize: "10px", color: "rgba(20,17,14,0.45)", marginTop: "4px", fontStyle: "italic" }}>
                                👨‍🍳 Gợi ý chế biến: {tip}
                              </span>
                            )}
                          </td>
                          <td style={{ ...tdCenter, fontWeight: 600 }}>{Math.round(meal.calories)}</td>
                          <td style={tdCenter}>{Math.round(meal.protein)}</td>
                          <td style={tdCenter}>{Math.round(meal.fat)}</td>
                          <td style={tdCenter}>{Math.round(meal.carbs)}</td>
                        </tr>
                      );
                    })}
                    {aiGrand && (
                      <tr style={{ background: "rgba(181,101,30,0.05)" }}>
                        <td style={{ ...tdBold, color: "#B5651E" }} colSpan={2}>Tổng cả ngày</td>
                        <td style={{ ...tdCenter, fontWeight: 700, color: "#B5651E" }}>{Math.round(aiGrand.cal)}</td>
                        <td style={{ ...tdCenter, fontWeight: 700, color: "#B5651E" }}>{Math.round(aiGrand.p)}</td>
                        <td style={{ ...tdCenter, fontWeight: 700, color: "#B5651E" }}>{Math.round(aiGrand.f)}</td>
                        <td style={{ ...tdCenter, fontWeight: 700, color: "#B5651E" }}>{Math.round(aiGrand.c)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {/* Manual foods table */}
            {manualFoods.length > 0 && (
              <div style={{ padding: "0 40px 18px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(20,17,14,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "10px" }}>
                  Thực đơn tự nhập
                </div>
                <div className="w-full overflow-x-auto">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Món ăn</th>
                      <th style={{ ...th, textAlign: "center" }}>Calo</th>
                      <th style={{ ...th, textAlign: "center" }}>P(g)</th>
                      <th style={{ ...th, textAlign: "center" }}>F(g)</th>
                      <th style={{ ...th, textAlign: "center" }}>C(g)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualFoods.map((food, i) => (
                      <tr key={food.id} style={{ background: i % 2 === 0 ? "#F6F2EA" : "rgba(20,17,14,0.018)" }}>
                        <td style={td}>{food.name}</td>
                        <td style={{ ...tdCenter, fontWeight: 600 }}>{Math.round(food.calories)}</td>
                        <td style={tdCenter}>{Math.round(food.protein)}</td>
                        <td style={tdCenter}>{Math.round(food.fat)}</td>
                        <td style={tdCenter}>{Math.round(food.carbs)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: "rgba(181,101,30,0.04)" }}>
                      <td style={{ ...tdBold, color: "#B5651E" }}>Tổng ngày</td>
                      <td style={{ ...tdCenter, fontWeight: 700, color: "#B5651E" }}>{Math.round(manualTotal.cal)}</td>
                      <td style={{ ...tdCenter, fontWeight: 700, color: "#B5651E" }}>{Math.round(manualTotal.p)}</td>
                      <td style={{ ...tdCenter, fontWeight: 700, color: "#B5651E" }}>{Math.round(manualTotal.f)}</td>
                      <td style={{ ...tdCenter, fontWeight: 700, color: "#B5651E" }}>{Math.round(manualTotal.c)}</td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Footer ── */}
      <div style={{
        padding: "16px 40px",
        borderTop: "1px solid rgba(20,17,14,0.08)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ fontSize: "10px", color: "rgba(20,17,14,0.3)", fontStyle: "italic" }}>
          Được tạo bởi Diet Plan · Máy Tính Dinh Dưỡng Chuyên Sâu
        </span>
        <span style={{ fontSize: "12px", fontWeight: 900, color: "#B5651E", letterSpacing: "-0.01em" }}>
          DIET PLAN
        </span>
      </div>
    </div>
  );
}

// ─── IngredientSearchRow ──────────────────────────────────────────────────────

function IngredientSearchRow({
  row,
  isActive,
  canRemove,
  onQueryChange,
  onSelect,
  onGramsChange,
  onRemove,
  onFocus,
  onBlur,
  extraFoods = [],
}: {
  row: IngredientRow;
  isActive: boolean;
  canRemove: boolean;
  onQueryChange: (val: string) => void;
  onSelect: (food: FoodItem) => void;
  onGramsChange: (g: number) => void;
  onRemove: () => void;
  onFocus: () => void;
  onBlur: () => void;
  extraFoods?: FoodItem[];
}) {
  const results = isActive && row.query ? searchFoods(row.query, extraFoods) : [];
  const macros = row.food ? computeRowMacros(row.food, row.grams) : null;
  const [gramsInput, setGramsInput] = useState(String(row.grams));

  // Đồng bộ ô nhập khi số lượng bị đổi từ bên ngoài (vd chọn trứng → mặc định 1 quả)
  useEffect(() => { setGramsInput(String(row.grams)); }, [row.grams]);

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            placeholder="Tìm nguyên liệu... (VD: cá lóc, gạo lứt)"
            value={row.query}
            onChange={e => onQueryChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            className="dp-input w-full"
            autoComplete="off"
          />
          {results.length > 0 && (
            <div
              className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-xl"
              style={{ background: "#F6F2EA", border: "1px solid rgba(20,17,14,0.12)" }}
            >
              {results.map(food => (
                <button
                  key={food.name}
                  type="button"
                  onMouseDown={() => onSelect(food)}
                  className="w-full text-left px-3 py-2.5 transition-colors"
                  style={{ borderBottom: "1px solid rgba(20,17,14,0.05)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(181,101,30,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <span className="text-sm font-semibold" style={{ color: "#14110E" }}>
                    {food.name}
                  </span>
                  {/* Món do người dùng tự thêm (có id) — phân biệt với món hệ thống */}
                  {"id" in food && (
                    <span
                      className="text-xs ml-1.5 px-1.5 py-0.5 rounded font-bold"
                      style={{ background: "rgba(58,85,103,0.1)", color: "#3A5567", fontSize: "0.62rem" }}
                    >
                      TỰ THÊM
                    </span>
                  )}
                  <span className="text-xs ml-2" style={{ color: "rgba(20,17,14,0.4)" }}>
                    {food.gramsPerUnit
                      ? (() => {
                          const per = computeRowMacros(food, 1);
                          return `${per.calories} kcal · P:${per.protein}g F:${per.fat}g C:${per.carbs}g /${unitFor(food)} (~${food.gramsPerUnit}g)`;
                        })()
                      : `${food.calories} kcal · P:${food.protein}g F:${food.fat}g C:${food.carbs}g /100${unitFor(food)}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Gram input */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            type="number"
            value={gramsInput}
            min={1}
            onChange={e => {
              setGramsInput(e.target.value);
              const parsed = parseInt(e.target.value);
              if (!isNaN(parsed) && parsed >= 1) onGramsChange(parsed);
            }}
            className="dp-input text-center"
            style={{ width: "68px" }}
          />
          <span className="text-xs font-semibold" style={{ color: "rgba(20,17,14,0.4)" }}>{unitFor(row.food)}</span>
        </div>
        {/* Remove */}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg"
            style={{ background: "rgba(181,101,30,0.08)", color: "#B5651E" }}
            aria-label="Xoá nguyên liệu"
          >
            ×
          </button>
        )}
      </div>
      {/* Per-row macro preview */}
      {macros && (
        <div className="flex gap-3 pl-1 flex-wrap">
          {(
            [
              { label: "Calo", value: `${macros.calories} kcal`, color: "#B5651E" },
              { label: "P", value: `${macros.protein}g`, color: "#3A5567" },
              { label: "F", value: `${macros.fat}g`, color: "#A33A2A" },
              { label: "C", value: `${macros.carbs}g`, color: "#5C6E48" },
            ] as const
          ).map(item => (
            <span key={item.label} className="text-xs font-semibold" style={{ color: item.color }}>
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Spinner (defined outside component to avoid recreation on every render) ──

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <svg
      className="animate-spin"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12" cy="12" r="10"
        stroke={light ? "rgba(255,255,255,0.3)" : "rgba(20,17,14,0.15)"}
        strokeWidth="3"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke={light ? "#F6F2EA" : "#14110E"}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MealPlanSection({
  result,
  liveProtein,
  liveFat,
  liveCarbs,
  liveDer,
}: {
  result: NutritionResult;
  liveProtein: number;
  liveFat: number;
  liveCarbs: number;
  liveDer: number;
}) {
  const pdfRef = useRef<HTMLDivElement>(null);
  // Synchronous ref-based lock — set BEFORE any setState so no race condition
  // can allow a second call between the click and React re-rendering disabled
  const aiInFlight = useRef(false);

  const [activeTab, setActiveTab] = useState<Tab>("ai");
  const [mealCount, setMealCount] = useState<MealCount>(3);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCooldown, setAiCooldown] = useState(0); // seconds remaining after success
  const [aiError, setAiError] = useState<string | null>(null);

  // ── 7 ngày độc lập ──
  const [days, setDays] = useState<DayPlan[]>(makeEmptyDays);
  const [activeDay, setActiveDay] = useState(0);

  // Thực đơn của ngày đang mở
  const aiMeals = days[activeDay].aiMeals;
  const manualFoods = days[activeDay].manualFoods;

  // Setter chỉ ghi vào ngày đang mở — giữ nguyên chữ ký cũ để phần code dưới không đổi
  const setAiMeals = (val: AiMeal[] | null) =>
    setDays((prev) =>
      prev.map((d, i) => (i === activeDay ? { ...d, aiMeals: val } : d))
    );
  const setManualFoods = (
    updater: ManualFood[] | ((prev: ManualFood[]) => ManualFood[])
  ) =>
    setDays((prev) =>
      prev.map((d, i) =>
        i === activeDay
          ? {
              ...d,
              manualFoods:
                typeof updater === "function"
                  ? (updater as (p: ManualFood[]) => ManualFood[])(d.manualFoods)
                  : updater,
            }
          : d
      )
    );

  const [rows, setRows] = useState<IngredientRow[]>(() => [newRow()]);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);

  // ── Thư viện món custom (do người dùng tự thêm, dùng chung cả app) ──
  const [customFoods, setCustomFoods] = useState<SavedFood[]>([]);
  const [showAddFood, setShowAddFood] = useState(false);
  const [addFoodQuery, setAddFoodQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/foods")
      .then((r) => (r.ok ? r.json() : { foods: [] }))
      .then((d) => { if (!cancelled) setCustomFoods(d.foods ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [pdfLoading, setPdfLoading] = useState(false);

  // ── Xuất / chia sẻ ──
  const [pdfDaySel, setPdfDaySel] = useState<boolean[]>(() => DAY_LABELS.map(() => true));
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  // Đổi ngày → reset trình soạn thảo (rows/đang sửa) để không lẫn dữ liệu giữa các ngày
  function switchDay(idx: number) {
    if (idx === activeDay) return;
    setActiveDay(idx);
    setRows([newRow()]);
    setEditingMealId(null);
    setActiveDropdown(null);
    setAiError(null);
  }

  // Bữa đang được chỉnh sửa bị loại khỏi tracking để PT thấy ngân sách thực
  const totals = manualFoods
    .filter(f => f.id !== editingMealId)
    .reduce(
      (a, f) => ({
        calories: a.calories + f.calories,
        protein: a.protein + f.protein,
        fat: a.fat + f.fat,
        carbs: a.carbs + f.carbs,
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

  // ── AI generation ─────────────────────────────────────────────────────────

  const handleGenerateAI = useCallback(async () => {
    // Hard lock: ref is synchronous — immune to React batching delays
    if (aiInFlight.current) return;
    console.log("🚀 CHỈ KÍCH HOẠT KHI BẤM NÚT TẠO THỰC ĐƠN!");
    aiInFlight.current = true;
    setAiLoading(true);
    setAiError(null);
    setAiMeals(null);

    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          macros: { calories: liveDer, protein: liveProtein, fat: liveFat, carbs: liveCarbs },
          mealCount,
          preferences: { likes: result.likes, dislikes: result.dislikes },
        }),
      });

      if (res.status === 401) {
        const errData = await res.json() as { kicked?: boolean };
        window.location.replace(errData.kicked ? "/login?kicked=1" : "/login");
        return;
      }

      const data: { result?: string; error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Lỗi từ Gemini API");
      if (!data.result) throw new Error("Gemini không trả về nội dung");
      // Slice là tuyến phòng thủ cuối — loại bỏ bữa thừa dù AI có vượt rào
      const meals = parseAiResponse(data.result).slice(0, mealCount);
      // Mỗi ngày chỉ giữ MỘT loại thực đơn: tạo AI thì xoá thực đơn thủ công
      // của ngày đó, tránh cả 2 cùng lọt vào PDF / link gửi khách.
      setDays((prev) =>
        prev.map((d, i) =>
          i === activeDay ? { ...d, aiMeals: meals, manualFoods: [] } : d
        )
      );
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Đã xảy ra lỗi, vui lòng thử lại");
    } finally {
      setAiLoading(false);
      aiInFlight.current = false;

      // 5-second cooldown to prevent rapid re-clicks after a request
      setAiCooldown(5);
      const t = setInterval(() => {
        setAiCooldown((s) => {
          if (s <= 1) { clearInterval(t); return 0; }
          return s - 1;
        });
      }, 1000);
    }
    // Phải include cả macro sống: nếu thiếu, closure đóng băng ở giá trị mount
    // (P/F/C=0 vì useEffect cha chưa kịp set) → API nhận target macro = 0.
    // activeDay: để setAiMeals ghi đúng vào ngày đang mở (không bị stale closure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, mealCount, liveDer, liveProtein, liveFat, liveCarbs, activeDay]);

  // ── Manual food ────────────────────────────────────────────────────────────

  function handleConfirmMeal() {
    const filled = rows.filter((r): r is IngredientRow & { food: FoodItem } => r.food !== null);
    if (filled.length === 0) return;

    // Mỗi ngày chỉ giữ MỘT loại thực đơn: thêm bữa thủ công thì xoá thực đơn AI
    // của ngày đó, tránh cả 2 cùng lọt vào PDF / link gửi khách.
    if (aiMeals) setAiMeals(null);

    const total = filled.reduce(
      (acc, row) => {
        const m = computeRowMacros(row.food, row.grams);
        return {
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein,
          fat: acc.fat + m.fat,
          carbs: acc.carbs + m.carbs,
        };
      },
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    const ingredients: SavedIngredient[] = filled.map(r => ({ food: r.food, grams: r.grams }));

    if (editingMealId !== null) {
      // Cập nhật bữa đang sửa, giữ nguyên vị trí trong danh sách
      setManualFoods(prev => prev.map(f => {
        if (f.id !== editingMealId) return f;
        const idx = prev.findIndex(m => m.id === editingMealId);
        const mealName = `Bữa ${idx + 1}: ` + filled.map(r => `${r.food.name} (${r.grams}${unitFor(r.food)})`).join(" + ");
        return {
          ...f,
          name: mealName,
          calories: Math.round(total.calories),
          protein: Math.round(total.protein),
          fat: Math.round(total.fat),
          carbs: Math.round(total.carbs),
          ingredients,
        };
      }));
      setEditingMealId(null);
    } else {
      const mealOrder = manualFoods.length + 1;
      const mealName = `Bữa ${mealOrder}: ` + filled.map(r => `${r.food.name} (${r.grams}${unitFor(r.food)})`).join(" + ");
      setManualFoods(prev => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          name: mealName,
          calories: Math.round(total.calories),
          protein: Math.round(total.protein),
          fat: Math.round(total.fat),
          carbs: Math.round(total.carbs),
          ingredients,
        },
      ]);
    }

    setRows([newRow()]);
    setActiveDropdown(null);
  }

  function handleEditMeal(meal: ManualFood) {
    const restoredRows: IngredientRow[] = meal.ingredients.map(ing => ({
      id: `${Date.now()}-${Math.random()}`,
      query: ing.food.name,
      food: ing.food,
      grams: ing.grams,
    }));
    setRows(restoredRows.length > 0 ? restoredRows : [newRow()]);
    setEditingMealId(meal.id);
    setActiveDropdown(null);
  }

  function handleCancelEdit() {
    setEditingMealId(null);
    setRows([newRow()]);
    setActiveDropdown(null);
  }

  // ── PDF export ─────────────────────────────────────────────────────────────

  async function handleExportPDF() {
    if (!pdfRef.current) return;
    setPdfLoading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#F6F2EA",
        logging: false,
        scrollX: 0,
        scrollY: 0,
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const margin = 10;
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const contentW = pageW - margin * 2;
      const contentH = pageH - margin * 2;

      // Scale canvas px → mm
      const pxToMm = contentW / canvas.width;
      const totalImgH = canvas.height * pxToMm;
      const pageCount = Math.ceil(totalImgH / contentH);

      const imgData = canvas.toDataURL("image/png");

      for (let page = 0; page < pageCount; page++) {
        if (page > 0) pdf.addPage();
        // Each page offsets the image upward to show the next portion
        const yOffset = margin - page * contentH;
        pdf.addImage(imgData, "PNG", margin, yOffset, contentW, totalImgH);
      }

      pdf.save(`diet-plan-${result.name.replace(/\s+/g, "-")}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setPdfLoading(false);
    }
  }

  const today = new Date().toLocaleDateString("vi-VN");

  // Ngày nào đã có thực đơn (AI hoặc tự nhập)
  const anyDayHasData = days.some(dayHasData);

  // Những ngày được chọn để xuất PDF / chia sẻ (và phải có dữ liệu)
  const includedDays: PdfDay[] = days
    .map((d, i) => ({ label: DAY_LABELS[i], aiMeals: d.aiMeals, manualFoods: d.manualFoods, _i: i }))
    .filter((d) => pdfDaySel[d._i] && dayHasData(days[d._i]))
    .map(({ label, aiMeals, manualFoods }) => ({ label, aiMeals, manualFoods }));

  // ── Chia sẻ link cho khách (nhúng thẳng vào URL, không cần database) ──
  function buildSharePlan(): SharePlan {
    const aiToSlim = (m: AiMeal): SlimMeal => ({
      mealName: m.mealName, name: m.name,
      calories: m.calories, protein: m.protein, fat: m.fat, carbs: m.carbs,
    });
    const manualToSlim = (f: ManualFood): SlimMeal => ({
      name: f.name, calories: f.calories, protein: f.protein, fat: f.fat, carbs: f.carbs,
    });
    return {
      v: 1,
      client: {
        name: result.name, gender: result.gender, age: result.age,
        height: result.height, weight: result.weight, weightGoal: result.weightGoal,
        der: result.der, protein: result.protein, fat: result.fat, carbs: result.carbs,
        date: today,
      },
      days: includedDays.map((d) => ({
        label: d.label,
        aiMeals: (d.aiMeals ?? []).map(aiToSlim),
        manualFoods: d.manualFoods.map(manualToSlim),
      })),
    };
  }

  async function handleCreateShareLink() {
    if (includedDays.length === 0 || shareLoading) return;
    setShareLoading(true);
    setShareError(null);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: buildSharePlan() }),
      });
      if (res.status === 401) {
        const e = (await res.json()) as { kicked?: boolean };
        window.location.replace(e.kicked ? "/login?kicked=1" : "/login");
        return;
      }
      const data = (await res.json()) as { slug?: string; error?: string };
      if (!res.ok || !data.slug) throw new Error(data.error ?? "Không tạo được link");

      const url = `${window.location.origin}/p/${data.slug}`;
      setShareLink(url);
      setShareCopied(false);
      setQrDataUrl(null);
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(
          () => setShareCopied(true),
          () => {}
        );
      }
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : "Không tạo được link, vui lòng thử lại"
      );
    } finally {
      setShareLoading(false);
    }
  }

  // Tạo mã QR từ link (client-side, không gửi link ra dịch vụ ngoài)
  async function handleGenerateQr() {
    if (!shareLink || qrLoading) return;
    setQrLoading(true);
    try {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(shareLink, {
        width: 512,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#14110E", light: "#F6F2EA" },
      });
      setQrDataUrl(dataUrl);
    } catch {
      setShareError("Không tạo được mã QR, vui lòng thử lại");
    } finally {
      setQrLoading(false);
    }
  }

  return (
    <div id="meal-plan-section" className="mt-6 space-y-4">
      {/* ── Bộ chọn ngày trong tuần (mỗi ngày 1 thực đơn riêng) ── */}
      <div
        className="bg-white rounded-2xl shadow-sm p-4"
        style={{ border: "1px solid rgba(20,17,14,0.1)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(20,17,14,0.35)" }}>
            Thực đơn theo ngày
          </p>
          <span className="text-xs font-semibold" style={{ color: "#B5651E" }}>
            Đang soạn: {DAY_LABELS[activeDay]}
          </span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {DAY_LABELS.map((label, i) => {
            const active = i === activeDay;
            const filled = dayHasData(days[i]);
            return (
              <button
                key={label}
                type="button"
                onClick={() => switchDay(i)}
                className="relative py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                style={{
                  border: active ? "1px solid #B5651E" : "1px solid rgba(20,17,14,0.15)",
                  background: active ? "#B5651E" : "#F6F2EA",
                  color: active ? "#F6F2EA" : "#14110E",
                }}
              >
                {label}
                {filled && (
                  <span
                    className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                    style={{ background: active ? "#F6F2EA" : "#B5651E" }}
                    aria-label="đã có thực đơn"
                  />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs mt-3" style={{ color: "rgba(20,17,14,0.4)" }}>
          Mỗi ngày là một thực đơn riêng biệt, không ảnh hưởng tới các ngày khác. Chấm đỏ =
          ngày đã có thực đơn.
        </p>
      </div>

      {/* ── Tab container ── */}
      <div
        className="bg-white rounded-2xl shadow-sm"
        style={{ border: "1px solid rgba(20,17,14,0.1)" }}
      >
        {/* Tab bar */}
        <div className="flex" style={{ borderBottom: "1px solid rgba(20,17,14,0.08)" }}>
          {(["ai", "manual"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-3.5 text-sm font-semibold transition-all"
              style={{
                borderBottom: activeTab === tab ? "2px solid #B5651E" : "2px solid transparent",
                color: activeTab === tab ? "#B5651E" : "rgba(20,17,14,0.45)",
                background: "transparent",
              }}
            >
              {tab === "ai" ? "✨ AI Thực đơn" : "✏️ Tự nhập tay"}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ════ AI Tab ════ */}
          {activeTab === "ai" && (
            <div className="space-y-5">
              {/* Meal count */}
              <div>
                <p className="dp-label">Số bữa ăn trong ngày</p>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {([2, 3, 4, 5] as MealCount[]).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMealCount(n)}
                      className="py-2.5 rounded-xl text-sm font-bold transition-all"
                      style={{
                        border: mealCount === n ? "1px solid #B5651E" : "1px solid rgba(20,17,14,0.15)",
                        background: mealCount === n ? "#B5651E" : "#F6F2EA",
                        color: mealCount === n ? "#F6F2EA" : "#14110E",
                      }}
                    >
                      {n} bữa
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              {(() => {
                const blocked = aiLoading || aiCooldown > 0;
                return (
                  <button
                    type="button"
                    onClick={handleGenerateAI}
                    disabled={blocked}
                    className="w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                    style={{
                      background: blocked ? "rgba(20,17,14,0.55)" : "#14110E",
                      color: "#F6F2EA",
                      cursor: blocked ? "not-allowed" : "pointer",
                      pointerEvents: blocked ? "none" : "auto",
                    }}
                  >
                    {aiLoading ? (
                      <><Spinner light /> AI đang phân tích...</>
                    ) : aiCooldown > 0 ? (
                      `Chờ ${aiCooldown}s...`
                    ) : (
                      "✨ Gợi ý bằng AI"
                    )}
                  </button>
                );
              })()}

              {/* Error */}
              {aiError && (
                <div
                  className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
                  style={{ background: "rgba(181,101,30,0.06)", border: "1px solid rgba(181,101,30,0.2)", color: "#B5651E" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {aiError}
                </div>
              )}

              {/* AI results */}
              {aiMeals && (
                <div className="space-y-3">
                  <p
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(20,17,14,0.35)" }}
                  >
                    Thực đơn gợi ý
                  </p>
                  {aiMeals.map((meal, i) => (
                    <AiMealCard key={i} meal={meal} />
                  ))}

                  {/* Daily grand total */}
                  {(() => {
                    const gt = aiMeals.reduce(
                      (a, m) => ({ cal: a.cal + m.calories, p: a.p + m.protein, f: a.f + m.fat, c: a.c + m.carbs }),
                      { cal: 0, p: 0, f: 0, c: 0 }
                    );
                    return (
                      <div
                        className="rounded-xl p-4"
                        style={{ background: "rgba(20,17,14,0.03)", border: "1px solid rgba(20,17,14,0.08)" }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(20,17,14,0.35)" }}>
                          Tổng cả ngày
                        </p>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                          {[
                            { label: "Calo", value: gt.cal, unit: "kcal", color: "#B5651E" },
                            { label: "Protein", value: Math.round(gt.p), unit: "g", color: "#3A5567" },
                            { label: "Fat", value: Math.round(gt.f), unit: "g", color: "#A33A2A" },
                            { label: "Carbs", value: Math.round(gt.c), unit: "g", color: "#5C6E48" },
                          ].map((item) => (
                            <div
                              key={item.label}
                              className="text-center rounded-lg py-2.5 px-1"
                              style={{ background: "#F6F2EA", border: "1px solid rgba(20,17,14,0.07)" }}
                            >
                              <p className="text-xs" style={{ color: "rgba(20,17,14,0.4)" }}>{item.label}</p>
                              <p className="text-lg md:text-xl font-bold mt-0.5" style={{ color: item.color }}>
                                {item.value}
                                <span className="text-xs md:text-sm font-semibold ml-0.5">{item.unit}</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ════ Manual Tab ════ */}
          {activeTab === "manual" && (
            <div className="space-y-5">
              {/* Tracking Board */}
              <div
                className="rounded-xl p-4 space-y-3.5"
                style={{ background: "rgba(20,17,14,0.02)", border: "1px solid rgba(20,17,14,0.08)" }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(20,17,14,0.35)" }}>
                  Tracking Board
                </p>
                <TrackingBar
                  label={`Calo · ${totals.calories} / ${liveDer} kcal`}
                  current={totals.calories}
                  target={liveDer}
                  color="#B5651E"
                />
                <TrackingBar
                  label={`Protein · ${Math.round(totals.protein)} / ${liveProtein}g`}
                  current={totals.protein}
                  target={liveProtein}
                  color="#3A5567"
                />
                <TrackingBar
                  label={`Fat · ${Math.round(totals.fat)} / ${liveFat}g`}
                  current={totals.fat}
                  target={liveFat}
                  color="#A33A2A"
                />
                <TrackingBar
                  label={`Carbs · ${Math.round(totals.carbs)} / ${liveCarbs}g`}
                  current={totals.carbs}
                  target={liveCarbs}
                  color="#5C6E48"
                />
              </div>

              {/* Meal builder */}
              <div className="space-y-4">
                {editingMealId !== null && (
                  <div
                    className="px-3 py-2 rounded-lg text-xs font-bold"
                    style={{ background: "rgba(181,101,30,0.06)", color: "#B5651E", border: "1px solid rgba(181,101,30,0.18)" }}
                  >
                    ✏️ Đang chỉnh sửa — {manualFoods.find(f => f.id === editingMealId)?.name.split(':')[0] ?? 'Bữa ăn'}
                  </div>
                )}
                <p className="dp-label">Ghép bữa ăn từ nguyên liệu</p>
                <div className="space-y-4">
                  {rows.map((row) => (
                    <IngredientSearchRow
                      key={row.id}
                      row={row}
                      extraFoods={customFoods}
                      isActive={activeDropdown === row.id}
                      canRemove={rows.length > 1}
                      onQueryChange={(val) => {
                        setRows(prev =>
                          prev.map(r => r.id === row.id ? { ...r, query: val, food: null } : r)
                        );
                        setActiveDropdown(row.id);
                      }}
                      onSelect={(food) => {
                        setRows(prev =>
                          prev.map(r => r.id === row.id
                            ? { ...r, food, query: food.name, grams: food.gramsPerUnit ? 1 : r.grams }
                            : r)
                        );
                        setActiveDropdown(null);
                      }}
                      onGramsChange={(g) =>
                        setRows(prev =>
                          prev.map(r => r.id === row.id ? { ...r, grams: g } : r)
                        )
                      }
                      onRemove={() => setRows(prev => prev.filter(r => r.id !== row.id))}
                      onFocus={() => setActiveDropdown(row.id)}
                      onBlur={() =>
                        setTimeout(
                          () => setActiveDropdown(prev => (prev === row.id ? null : prev)),
                          150
                        )
                      }
                    />
                  ))}
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  {rows.length < 5 && (
                    <button
                      type="button"
                      onClick={() => setRows(prev => [...prev, newRow()])}
                      className="text-sm font-semibold"
                      style={{ color: "#B5651E" }}
                    >
                      + Thêm nguyên liệu ({rows.length}/5)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      // Gợi ý sẵn từ khoá đang gõ ở ô tìm chưa chọn được món
                      const pending = rows.find(r => !r.food && r.query.trim());
                      setAddFoodQuery(pending?.query.trim() ?? "");
                      setShowAddFood(true);
                    }}
                    className="text-sm font-semibold"
                    style={{ color: "#3A5567" }}
                  >
                    ＋ Thêm món mới vào thư viện
                  </button>
                </div>

                {/* Meal total preview */}
                {(() => {
                  const filled = rows.filter(
                    (r): r is IngredientRow & { food: FoodItem } => r.food !== null
                  );
                  if (filled.length === 0) return null;
                  const total = filled.reduce(
                    (acc, r) => {
                      const m = computeRowMacros(r.food, r.grams);
                      return {
                        calories: acc.calories + m.calories,
                        protein: acc.protein + m.protein,
                        fat: acc.fat + m.fat,
                        carbs: acc.carbs + m.carbs,
                      };
                    },
                    { calories: 0, protein: 0, fat: 0, carbs: 0 }
                  );
                  return (
                    <div
                      className="rounded-xl p-3"
                      style={{ background: "rgba(20,17,14,0.03)", border: "1px solid rgba(20,17,14,0.08)" }}
                    >
                      <p
                        className="text-xs font-semibold uppercase tracking-widest mb-2"
                        style={{ color: "rgba(20,17,14,0.35)" }}
                      >
                        Tổng bữa · {filled.length} nguyên liệu
                      </p>
                      <div className="flex gap-4 flex-wrap">
                        {[
                          { label: "Calo", value: `${Math.round(total.calories)} kcal`, color: "#B5651E" },
                          { label: "Protein", value: `${Math.round(total.protein)}g`, color: "#3A5567" },
                          { label: "Fat", value: `${Math.round(total.fat)}g`, color: "#A33A2A" },
                          { label: "Carbs", value: `${Math.round(total.carbs)}g`, color: "#5C6E48" },
                        ].map(item => (
                          <div key={item.label}>
                            <p className="text-xs" style={{ color: "rgba(20,17,14,0.4)" }}>{item.label}</p>
                            <p className="text-sm font-bold" style={{ color: item.color }}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmMeal}
                    disabled={rows.every(r => r.food === null)}
                    className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                    style={{
                      background: rows.some(r => r.food !== null) ? "#14110E" : "rgba(20,17,14,0.3)",
                      color: "#F6F2EA",
                      cursor: rows.some(r => r.food !== null) ? "pointer" : "not-allowed",
                    }}
                  >
                    {editingMealId !== null ? "↩ Cập nhật Bữa ăn" : "✓ Xác nhận gộp bữa"}
                  </button>
                  {editingMealId !== null && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="py-3 px-4 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                      style={{ background: "rgba(20,17,14,0.08)", color: "rgba(20,17,14,0.6)" }}
                    >
                      Hủy
                    </button>
                  )}
                </div>
              </div>

              {/* Food list */}
              {manualFoods.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(20,17,14,0.35)" }}>
                    Danh sách đã nhập ({manualFoods.length} bữa)
                  </p>
                  {manualFoods.map((food) => {
                    const isEditing = food.id === editingMealId;
                    return (
                      <div
                        key={food.id}
                        className="flex items-center gap-2 rounded-xl px-4 py-3"
                        style={{
                          background: isEditing ? "rgba(181,101,30,0.04)" : "rgba(20,17,14,0.025)",
                          border: isEditing ? "1px solid rgba(181,101,30,0.25)" : "1px solid rgba(20,17,14,0.07)",
                          opacity: isEditing ? 0.75 : 1,
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold truncate" style={{ color: "#14110E" }}>
                              {food.name}
                            </p>
                            {isEditing && (
                              <span
                                className="text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                                style={{ background: "rgba(181,101,30,0.1)", color: "#B5651E" }}
                              >
                                đang sửa
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: "rgba(20,17,14,0.4)" }}>
                            {Math.round(food.calories)} kcal &nbsp;·&nbsp; P:{Math.round(food.protein)}g F:{Math.round(food.fat)}g C:{Math.round(food.carbs)}g
                          </p>
                        </div>
                        {/* Nút chỉnh sửa ✏️ */}
                        <button
                          type="button"
                          onClick={() => handleEditMeal(food)}
                          disabled={isEditing}
                          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all"
                          style={{
                            background: isEditing ? "rgba(20,17,14,0.04)" : "rgba(20,17,14,0.07)",
                            color: isEditing ? "rgba(20,17,14,0.2)" : "rgba(20,17,14,0.5)",
                            cursor: isEditing ? "not-allowed" : "pointer",
                          }}
                          aria-label="Chỉnh sửa bữa"
                        >
                          ✏️
                        </button>
                        {/* Nút xoá */}
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingMealId(null);
                              setRows([newRow()]);
                            }
                            setManualFoods((prev) => prev.filter((f) => f.id !== food.id));
                          }}
                          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-base font-bold transition-all"
                          style={{ background: "rgba(181,101,30,0.08)", color: "#B5651E" }}
                          aria-label="Xoá bữa"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Xuất PDF / Chia sẻ link (chọn ngày) ── */}
      {anyDayHasData && (
        <div
          className="bg-white rounded-2xl shadow-sm p-5 space-y-4"
          style={{ border: "1px solid rgba(20,17,14,0.1)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(20,17,14,0.35)" }}>
            Chọn ngày để in PDF / gửi cho khách
          </p>

          {/* Checkbox chọn ngày — chỉ bật cho ngày đã có thực đơn */}
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {DAY_LABELS.map((label, i) => {
              const filled = dayHasData(days[i]);
              const checked = filled && pdfDaySel[i];
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!filled}
                  onClick={() =>
                    setPdfDaySel((prev) => prev.map((v, j) => (j === i ? !v : v)))
                  }
                  className="py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1"
                  style={{
                    border: checked ? "1px solid #B5651E" : "1px solid rgba(20,17,14,0.15)",
                    background: checked ? "rgba(181,101,30,0.08)" : "#F6F2EA",
                    color: !filled ? "rgba(20,17,14,0.25)" : checked ? "#B5651E" : "rgba(20,17,14,0.55)",
                    cursor: filled ? "pointer" : "not-allowed",
                  }}
                >
                  {checked ? "✓ " : ""}{label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={pdfLoading || includedDays.length === 0}
              className="flex-1 py-3.5 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
              style={{
                background: pdfLoading || includedDays.length === 0 ? "rgba(20,17,14,0.4)" : "#14110E",
                color: "#F6F2EA",
                cursor: pdfLoading || includedDays.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              {pdfLoading ? (
                <><Spinner light /> Đang tạo PDF...</>
              ) : (
                <>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Tải PDF ({includedDays.length} ngày)
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCreateShareLink}
              disabled={includedDays.length === 0 || shareLoading}
              className="flex-1 py-3.5 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
              style={{
                background: includedDays.length === 0 || shareLoading ? "rgba(181,101,30,0.4)" : "#B5651E",
                color: "#F6F2EA",
                cursor: includedDays.length === 0 || shareLoading ? "not-allowed" : "pointer",
              }}
            >
              {shareLoading ? (
                <><Spinner light /> Đang tạo link...</>
              ) : (
                <>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  Tạo link gửi khách
                </>
              )}
            </button>
          </div>

          {shareError && (
            <div
              className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
              style={{ background: "rgba(181,101,30,0.06)", border: "1px solid rgba(181,101,30,0.2)", color: "#B5651E" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {shareError}
            </div>
          )}
        </div>
      )}

      {/* ── Modal hiển thị link chia sẻ ── */}
      {shareLink && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{ background: "rgba(20,17,14,0.55)", backdropFilter: "blur(3px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShareLink(null); setQrDataUrl(null); } }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
            style={{ background: "#F6F2EA", border: "1px solid rgba(20,17,14,0.08)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold" style={{ color: "#14110E" }}>
                Link thực đơn cho khách
              </h3>
              <button
                onClick={() => { setShareLink(null); setQrDataUrl(null); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg"
                style={{ color: "rgba(20,17,14,0.4)", background: "rgba(20,17,14,0.05)" }}
                aria-label="Đóng"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <p className="text-sm mb-3" style={{ color: "rgba(20,17,14,0.55)" }}>
              Gửi link này cho khách — họ mở ra là xem được thực đơn {includedDays.length} ngày,
              không cần đăng nhập.
            </p>

            <div
              className="rounded-xl px-3 py-2.5 mb-3 break-all text-xs"
              style={{ background: "rgba(20,17,14,0.04)", border: "1px solid rgba(20,17,14,0.1)", color: "#14110E", maxHeight: "120px", overflowY: "auto" }}
            >
              {shareLink}
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(shareLink).then(
                      () => setShareCopied(true),
                      () => {}
                    );
                  }
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                style={{ background: shareCopied ? "#14110E" : "#B5651E", color: "#F6F2EA" }}
              >
                {shareCopied ? "✓ Đã sao chép" : "Sao chép link"}
              </button>
              <a
                href={shareLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-center transition-all active:scale-[0.98]"
                style={{ border: "1px solid rgba(20,17,14,0.15)", color: "rgba(20,17,14,0.7)", background: "transparent" }}
              >
                Xem thử
              </a>
            </div>

            {/* ── Mã QR: khách quét là mở link, khỏi lo link gãy khi copy ── */}
            {!qrDataUrl ? (
              <button
                type="button"
                onClick={handleGenerateQr}
                disabled={qrLoading}
                className="w-full mt-2.5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                style={{
                  border: "1px solid rgba(20,17,14,0.15)",
                  color: "rgba(20,17,14,0.7)",
                  background: "transparent",
                  cursor: qrLoading ? "wait" : "pointer",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" /><line x1="14" y1="14" x2="14" y2="17" />
                  <line x1="17" y1="14" x2="21" y2="14" /><line x1="21" y1="17" x2="21" y2="21" /><line x1="14" y1="21" x2="17" y2="21" />
                </svg>
                {qrLoading ? "Đang tạo mã QR…" : "Tạo mã QR"}
              </button>
            ) : (
              <div className="mt-3 flex flex-col items-center">
                <p className="text-xs mb-2 text-center" style={{ color: "rgba(20,17,14,0.55)" }}>
                  Khách dùng camera điện thoại quét mã là mở được thực đơn.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="Mã QR thực đơn"
                  width={200}
                  height={200}
                  className="rounded-xl"
                  style={{ border: "1px solid rgba(20,17,14,0.1)", background: "#F6F2EA" }}
                />
                <a
                  href={qrDataUrl}
                  download={`thuc-don-qr-${shareLink.split("/p/")[1] ?? "khach"}.png`}
                  className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-center transition-all active:scale-[0.98]"
                  style={{ background: "#B5651E", color: "#F6F2EA" }}
                >
                  Tải ảnh mã QR
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal thêm món mới vào thư viện chung ── */}
      {showAddFood && (
        <AddFoodModal
          initialQuery={addFoodQuery}
          customFoods={customFoods}
          onClose={() => setShowAddFood(false)}
          onDeleted={(id) => {
            setCustomFoods(prev => prev.filter(f => f.id !== id));
            // Bỏ chọn ở ô nguyên liệu đang dùng món vừa xoá (bữa đã lưu không đổi
            // vì macro của chúng đã được chốt lúc lưu)
            setRows(prev =>
              prev.map(r =>
                r.food && "id" in r.food && (r.food as SavedFood).id === id
                  ? { ...r, food: null }
                  : r
              )
            );
          }}
          onAdded={(food) => {
            setCustomFoods(prev => [food, ...prev]);
            // Điền luôn món vừa thêm vào ô nguyên liệu đang bỏ trống (nếu có)
            setRows(prev => {
              const target =
                prev.find(r => !r.food && r.query.trim()) ?? prev.find(r => !r.food);
              if (!target) return prev;
              return prev.map(r =>
                r.id === target.id
                  ? { ...r, food, query: food.name, grams: food.gramsPerUnit ? 1 : r.grams }
                  : r
              );
            });
            setShowAddFood(false);
          }}
        />
      )}

      {/* ── Hidden PDF template (off-screen for html2canvas) ── */}
      <div
        ref={pdfRef}
        style={{
          position: "absolute",
          top: 0,
          left: "-9999px",
          width: "794px",
          background: "#F6F2EA",
          fontFamily: "Montserrat, sans-serif",
          zIndex: -1,
        }}
      >
        <PdfTemplate
          result={result}
          days={includedDays}
          date={today}
        />
      </div>
    </div>
  );
}

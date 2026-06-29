"use client";

import { useState } from "react";
import type { SharePlan, SlimMeal } from "@/lib/share";
import { getCookingTip } from "@/lib/cooking-tips";

const GOAL_LABEL: Record<string, string> = {
  lose: "Giảm cân", gain: "Tăng cân", maintain: "Duy trì",
};

function sumMeals(meals: SlimMeal[]) {
  return meals.reduce(
    (a, m) => ({ cal: a.cal + m.calories, p: a.p + m.protein, f: a.f + m.fat, c: a.c + m.carbs }),
    { cal: 0, p: 0, f: 0, c: 0 }
  );
}

export default function SharedPlanView({ plan }: { plan: SharePlan }) {
  const [activeDay, setActiveDay] = useState(0);
  const { client, days } = plan;
  const day = days[Math.min(activeDay, days.length - 1)];

  return (
    <div className="min-h-screen bg-white">
      {/* ── Header ── */}
      <div style={{ background: "#14110E", padding: "26px 20px 22px" }}>
        <div className="max-w-2xl mx-auto">
          <div style={{ fontSize: "26px", fontWeight: 900, color: "#F6F2EA", letterSpacing: "-0.03em", lineHeight: 1 }}>
            DIET PLAN
          </div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", marginTop: "5px" }}>
            Thực đơn dành cho <span style={{ fontWeight: 700, color: "#F6F2EA" }}>{client.name}</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* ── Thông tin & mục tiêu ── */}
        <div
          className="rounded-2xl p-4"
          style={{ border: "1px solid rgba(20,17,14,0.1)" }}
        >
          <div className="flex flex-wrap gap-x-6 gap-y-3 mb-4">
            {[
              { label: "Mục tiêu", value: GOAL_LABEL[client.weightGoal] ?? client.weightGoal },
              { label: "Thông số", value: `${client.gender === "male" ? "Nam" : "Nữ"} · ${client.age}t · ${client.height}cm · ${client.weight}kg` },
              { label: "Ngày tạo", value: client.date },
            ].map((it) => (
              <div key={it.label}>
                <div style={{ fontSize: "9px", color: "rgba(20,17,14,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "3px" }}>
                  {it.label}
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#14110E" }}>{it.value}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Calo", value: `${client.der.toLocaleString("vi-VN")}`, unit: "kcal", color: "#B5651E" },
              { label: "Protein", value: `${client.protein}`, unit: "g", color: "#3A5567" },
              { label: "Fat", value: `${client.fat}`, unit: "g", color: "#A33A2A" },
              { label: "Carbs", value: `${client.carbs}`, unit: "g", color: "#5C6E48" },
            ].map((it) => (
              <div
                key={it.label}
                className="text-center rounded-xl py-2.5"
                style={{ background: "rgba(20,17,14,0.03)", border: "1px solid rgba(20,17,14,0.07)" }}
              >
                <p className="text-xs" style={{ color: "rgba(20,17,14,0.4)" }}>{it.label}</p>
                <p className="text-lg font-bold mt-0.5" style={{ color: it.color }}>
                  {it.value}<span className="text-xs font-semibold ml-0.5">{it.unit}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Chọn ngày ── */}
        {days.length > 1 && (
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {days.map((d, i) => {
              const active = i === activeDay;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveDay(i)}
                  className="py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                  style={{
                    border: active ? "1px solid #B5651E" : "1px solid rgba(20,17,14,0.15)",
                    background: active ? "#B5651E" : "#F6F2EA",
                    color: active ? "#F6F2EA" : "#14110E",
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Thực đơn ngày đang chọn ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              style={{
                display: "inline-block", background: "#14110E", color: "#F6F2EA",
                fontSize: "14px", fontWeight: 800, padding: "5px 14px", borderRadius: "999px",
              }}
            >
              📅 {day.label}
            </span>
          </div>

          {[...day.aiMeals, ...day.manualFoods].length === 0 && (
            <p className="text-sm" style={{ color: "rgba(20,17,14,0.5)" }}>
              Ngày này chưa có thực đơn.
            </p>
          )}

          {/* AI / từng bữa */}
          {day.aiMeals.map((meal, i) => {
            const tip = getCookingTip(meal.name);
            return (
              <div key={`ai-${i}`} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(20,17,14,0.1)" }}>
                <div className="px-4 py-2 flex items-center justify-between" style={{ background: "rgba(181,101,30,0.05)" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#B5651E" }}>{meal.mealName ?? `Bữa ${i + 1}`}</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#14110E" }}>{meal.calories} kcal</span>
                </div>
                <div className="px-4 py-3 flex items-start justify-between gap-3">
                  <p style={{ fontSize: "0.875rem", color: "#14110E", lineHeight: 1.55, flex: 1 }}>{meal.name}</p>
                  <p className="flex-shrink-0 text-right" style={{ fontSize: "0.75rem", color: "rgba(20,17,14,0.45)", lineHeight: 1.8 }}>
                    P: {Math.round(meal.protein)}g<br />F: {Math.round(meal.fat)}g<br />C: {Math.round(meal.carbs)}g
                  </p>
                </div>
                {tip && (
                  <div className="px-4 py-2.5 flex items-start gap-2" style={{ borderTop: "1px dashed rgba(20,17,14,0.12)", background: "rgba(20,17,14,0.015)" }}>
                    <span style={{ fontSize: "0.8rem", lineHeight: 1.5 }} aria-hidden="true">👨‍🍳</span>
                    <p style={{ fontSize: "0.75rem", color: "rgba(20,17,14,0.55)", lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700, color: "#B5651E" }}>Gợi ý chế biến: </span>{tip}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Món tự nhập */}
          {day.manualFoods.map((food, i) => (
            <div key={`m-${i}`} className="rounded-xl px-4 py-3" style={{ border: "1px solid rgba(20,17,14,0.1)" }}>
              <div className="flex items-start justify-between gap-3">
                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#14110E", lineHeight: 1.5, flex: 1 }}>{food.name}</p>
                <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#B5651E" }}>{food.calories} kcal</span>
              </div>
              <p className="mt-1 text-xs" style={{ color: "rgba(20,17,14,0.45)" }}>
                P:{Math.round(food.protein)}g · F:{Math.round(food.fat)}g · C:{Math.round(food.carbs)}g
              </p>
            </div>
          ))}

          {/* Tổng cả ngày */}
          {[...day.aiMeals, ...day.manualFoods].length > 0 && (() => {
            const t = sumMeals([...day.aiMeals, ...day.manualFoods]);
            return (
              <div className="rounded-xl p-4" style={{ background: "rgba(20,17,14,0.03)", border: "1px solid rgba(20,17,14,0.08)" }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(20,17,14,0.35)" }}>
                  Tổng cả ngày
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Calo", value: Math.round(t.cal), color: "#B5651E" },
                    { label: "Protein", value: Math.round(t.p), color: "#3A5567" },
                    { label: "Fat", value: Math.round(t.f), color: "#A33A2A" },
                    { label: "Carbs", value: Math.round(t.c), color: "#5C6E48" },
                  ].map((it) => (
                    <div key={it.label} className="text-center rounded-lg py-2" style={{ background: "#F6F2EA", border: "1px solid rgba(20,17,14,0.07)" }}>
                      <p className="text-xs" style={{ color: "rgba(20,17,14,0.4)" }}>{it.label}</p>
                      <p className="text-base font-bold mt-0.5" style={{ color: it.color }}>{it.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Footer ── */}
        <div className="pt-4 pb-8 text-center" style={{ borderTop: "1px solid rgba(20,17,14,0.08)" }}>
          <p style={{ fontSize: "11px", color: "rgba(20,17,14,0.35)", fontStyle: "italic" }}>
            Được tạo bởi Diet Plan · Máy Tính Dinh Dưỡng Chuyên Sâu
          </p>
        </div>
      </div>
    </div>
  );
}

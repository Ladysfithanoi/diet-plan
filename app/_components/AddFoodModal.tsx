"use client";

import { useState } from "react";
import { FOOD_TAGS, FOOD_TAG_LABELS, type FoodItem, type FoodTag } from "@/lib/foods-data";

export type SavedFood = FoodItem & { id: string };

// Kết quả tra cứu từ Gemini (đã chuẩn hoá /100g).
type LookupResult = {
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

type FormState = {
  name: string;
  nameEn: string;
  tag: FoodTag;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  fiber: string;
  unit: string;
  gramsPerUnit: string;
};

const EMPTY_FORM: FormState = {
  name: "", nameEn: "", tag: "protein",
  calories: "", protein: "", fat: "", carbs: "", fiber: "",
  unit: "", gramsPerUnit: "",
};

const numStr = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export default function AddFoodModal({
  onClose,
  onAdded,
  onDeleted,
  customFoods,
}: {
  onClose: () => void;
  onAdded: (food: SavedFood) => void;
  onDeleted: (id: string) => void;
  customFoods: SavedFood[];
}) {
  const [query, setQuery] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [results, setResults] = useState<LookupResult[] | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false); // form vừa được điền từ AI

  // Quản lý món đã thêm: id đang chờ xác nhận xoá / id đang gọi API xoá
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function doLookup() {
    const q = query.trim();
    if (!q) return;
    setLookupLoading(true);
    setLookupError(null);
    setResults(null);
    try {
      const res = await fetch("/api/foods/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLookupError(data?.error ?? "Tra cứu thất bại");
        return;
      }
      const list: LookupResult[] = data.results ?? [];
      setResults(list);
      if (list.length === 0) setLookupError("AI không tìm thấy món phù hợp. Bạn có thể nhập tay bên dưới.");
    } catch {
      setLookupError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setLookupLoading(false);
    }
  }

  function pickResult(r: LookupResult) {
    setForm({
      name: r.name,
      nameEn: r.nameEn ?? "",
      tag: (FOOD_TAGS.includes(r.tag as FoodTag) ? r.tag : "protein") as FoodTag,
      calories: numStr(r.calories),
      protein: numStr(r.protein),
      fat: numStr(r.fat),
      carbs: numStr(r.carbs),
      fiber: numStr(r.fiber),
      unit: r.unit ?? "",
      gramsPerUnit: numStr(r.gramsPerUnit),
    });
    setPrefilled(true);
    setSaveError(null);
  }

  async function doSave() {
    setSaving(true);
    setSaveError(null);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          nameEn: form.nameEn || undefined,
          tag: form.tag,
          calories: form.calories,
          protein: form.protein,
          fat: form.fat,
          carbs: form.carbs,
          fiber: form.fiber || undefined,
          unit: form.unit || undefined,
          gramsPerUnit: form.gramsPerUnit || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data?.error ?? "Không lưu được món ăn");
        return;
      }
      const saved = data.food as SavedFood;
      onAdded(saved);
      // Modal là nơi quản lý thư viện nên giữ nguyên để thêm tiếp — dọn form và
      // kết quả tra cứu cũ, tránh bấm Lưu lần hai rồi bị báo trùng tên.
      setForm(EMPTY_FORM);
      setPrefilled(false);
      setResults(null);
      setQuery("");
      setSavedMsg(`Đã thêm "${saved.name}" vào thư viện`);
    } catch {
      setSaveError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/foods/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setDeleteError(data?.error ?? "Không xoá được món ăn");
        return;
      }
      setConfirmDeleteId(null);
      onDeleted(id);
    } catch {
      setDeleteError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setDeletingId(null);
    }
  }

  const canSave =
    form.name.trim() !== "" &&
    form.calories !== "" && form.protein !== "" && form.fat !== "" && form.carbs !== "";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4"
      style={{ background: "rgba(20,17,14,0.45)" }}
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl my-8 shadow-2xl"
        style={{ background: "#F6F2EA", border: "1px solid rgba(20,17,14,0.12)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(20,17,14,0.08)" }}
        >
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#14110E" }}>Thư viện món ăn</h3>
            <p style={{ fontSize: "0.75rem", color: "rgba(20,17,14,0.45)", marginTop: 2 }}>
              Món thêm ở đây dùng chung cho cả app, chỉ số tính trên 100g
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0"
            style={{ background: "rgba(20,17,14,0.06)", color: "#14110E" }}
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* ── Tra cứu bằng AI ── */}
          <div>
            <p className="dp-label" style={{ marginBottom: 8 }}>🔍 Tra cứu bằng AI (Gemini)</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="VD: ức gà áp chảo, hàu sữa, phô mai tách béo..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doLookup(); } }}
                className="dp-input flex-1 min-w-0"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={doLookup}
                disabled={lookupLoading || !query.trim()}
                className="flex-shrink-0 px-4 rounded-xl font-semibold text-sm"
                style={{
                  background: lookupLoading || !query.trim() ? "rgba(20,17,14,0.12)" : "#14110E",
                  color: "#F6F2EA",
                  cursor: lookupLoading || !query.trim() ? "not-allowed" : "pointer",
                }}
              >
                {lookupLoading ? "Đang tra..." : "Tra cứu"}
              </button>
            </div>
            {lookupError && (
              <p style={{ fontSize: "0.78rem", color: "#A33A2A", marginTop: 8 }}>{lookupError}</p>
            )}

            {results && results.length > 0 && (
              <div className="mt-3 space-y-2">
                <p style={{ fontSize: "0.72rem", color: "rgba(20,17,14,0.45)" }}>
                  Chọn kết quả để điền vào form bên dưới, chỉnh lại nếu cần rồi Lưu:
                </p>
                {results.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickResult(r)}
                    className="w-full text-left px-3 py-2.5 rounded-xl transition-colors"
                    style={{
                      background: form.name === r.name && prefilled ? "rgba(181,101,30,0.08)" : "#fff",
                      border: "1px solid rgba(20,17,14,0.1)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#14110E" }}>{r.name}</span>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#B5651E" }}>{Math.round(r.calories)} kcal</span>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "rgba(20,17,14,0.5)", marginTop: 2 }}>
                      P:{r.protein}g · F:{r.fat}g · C:{r.carbs}g
                      {r.fiber ? ` · Xơ:${r.fiber}g` : ""} · {FOOD_TAG_LABELS[(r.tag as FoodTag)] ?? r.tag}
                      {r.gramsPerUnit ? ` · 1 ${r.unit ?? "đv"}≈${r.gramsPerUnit}g` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "rgba(20,17,14,0.08)" }} />

          {/* ── Form nhập / chỉnh tay ── */}
          <div className="space-y-3">
            <p className="dp-label">✍️ Thông tin món (nhập tay hoặc từ kết quả AI)</p>

            <div className="space-y-1">
              <label style={labelStyle}>Tên món *</label>
              <input className="dp-input w-full" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="VD: Ức gà áp chảo" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label style={labelStyle}>Tên tiếng Anh</label>
                <input className="dp-input w-full" value={form.nameEn} onChange={(e) => setField("nameEn", e.target.value)} placeholder="(tuỳ chọn)" />
              </div>
              <div className="space-y-1">
                <label style={labelStyle}>Nhóm *</label>
                <select className="dp-input w-full" value={form.tag} onChange={(e) => setField("tag", e.target.value as FoodTag)}>
                  {FOOD_TAGS.map((t) => (
                    <option key={t} value={t}>{FOOD_TAG_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumField label="Calo /100g *" value={form.calories} onChange={(v) => setField("calories", v)} />
              <NumField label="Đạm (P) g *" value={form.protein} onChange={(v) => setField("protein", v)} />
              <NumField label="Béo (F) g *" value={form.fat} onChange={(v) => setField("fat", v)} />
              <NumField label="Tinh bột (C) g *" value={form.carbs} onChange={(v) => setField("carbs", v)} />
              <NumField label="Chất xơ g" value={form.fiber} onChange={(v) => setField("fiber", v)} />
            </div>

            <details style={{ fontSize: "0.8rem" }}>
              <summary style={{ cursor: "pointer", color: "rgba(20,17,14,0.5)", fontWeight: 600 }}>
                Đếm theo đơn vị (trứng, chuối...) — tuỳ chọn
              </summary>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="space-y-1">
                  <label style={labelStyle}>Đơn vị đếm</label>
                  <input className="dp-input w-full" value={form.unit} onChange={(e) => setField("unit", e.target.value)} placeholder="VD: quả, cái" />
                </div>
                <NumField label="Khối lượng 1 đơn vị (g)" value={form.gramsPerUnit} onChange={(v) => setField("gramsPerUnit", v)} />
              </div>
            </details>
          </div>

          {saveError && (
            <p style={{ fontSize: "0.82rem", color: "#A33A2A", fontWeight: 600 }}>{saveError}</p>
          )}
          {savedMsg && (
            <p
              className="px-3 py-2 rounded-xl"
              style={{ fontSize: "0.82rem", color: "#5C6E48", fontWeight: 600, background: "rgba(92,110,72,0.08)" }}
            >
              ✓ {savedMsg} — có thể thêm món tiếp hoặc đóng lại.
            </p>
          )}

          {/* ── Món đã tự thêm: xem lại / xoá ── */}
          {customFoods.length > 0 && (
            <>
              <div style={{ height: 1, background: "rgba(20,17,14,0.08)" }} />
              <details style={{ fontSize: "0.8rem" }}>
                <summary style={{ cursor: "pointer", color: "rgba(20,17,14,0.5)", fontWeight: 600 }}>
                  📚 Món đã thêm vào thư viện ({customFoods.length})
                </summary>
                {deleteError && (
                  <p style={{ fontSize: "0.78rem", color: "#A33A2A", marginTop: 8, fontWeight: 600 }}>{deleteError}</p>
                )}
                <div className="mt-2 space-y-1.5" style={{ maxHeight: 220, overflowY: "auto" }}>
                  {customFoods.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl"
                      style={{ background: "#fff", border: "1px solid rgba(20,17,14,0.1)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#14110E" }} className="truncate">
                          {f.name}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "rgba(20,17,14,0.5)" }} className="truncate">
                          {Math.round(f.calories)} kcal · P:{f.protein}g F:{f.fat}g C:{f.carbs}g ·{" "}
                          {FOOD_TAG_LABELS[f.tag] ?? f.tag}
                        </div>
                      </div>
                      {confirmDeleteId === f.id ? (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => doDelete(f.id)}
                            disabled={deletingId === f.id}
                            className="px-2.5 py-1 rounded-lg font-bold"
                            style={{
                              fontSize: "0.72rem",
                              background: "#A33A2A",
                              color: "#fff",
                              cursor: deletingId === f.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {deletingId === f.id ? "..." : "Xoá"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1 rounded-lg font-semibold"
                            style={{ fontSize: "0.72rem", background: "rgba(20,17,14,0.06)", color: "#14110E" }}
                          >
                            Huỷ
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setConfirmDeleteId(f.id); setDeleteError(null); }}
                          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold"
                          style={{ background: "rgba(163,58,42,0.08)", color: "#A33A2A" }}
                          aria-label={`Xoá ${f.name}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4" style={{ borderTop: "1px solid rgba(20,17,14,0.08)" }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
            style={{ background: "rgba(20,17,14,0.06)", color: "#14110E" }}
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={doSave}
            disabled={!canSave || saving}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
            style={{
              background: !canSave || saving ? "rgba(20,17,14,0.12)" : "#B5651E",
              color: "#fff",
              cursor: !canSave || saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Đang lưu..." : "Lưu vào thư viện"}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "rgba(20,17,14,0.5)",
};

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        className="dp-input w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

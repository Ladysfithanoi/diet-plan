import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { FOOD_TAGS, FOOD_TAG_LABELS, validateFoodInput, type CleanFood } from "@/lib/foods-db";

export const dynamic = "force-dynamic";

// ─── Gemini config (độc lập với route sinh thực đơn để không ảnh hưởng lẫn nhau) ──

const API_KEYS: string[] = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(",").map((k) => k.trim()).filter(Boolean)
  : [];

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 503;
}

async function callGemini(prompt: string, systemInstruction: string): Promise<string> {
  if (API_KEYS.length === 0) {
    throw new Error("Chưa cấu hình GEMINI_API_KEYS trong .env.local");
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
            temperature: 0.3,
            // gemini-2.5-flash mặc định "suy nghĩ" trước khi trả lời và thought token
            // ĂN VÀO maxOutputTokens → với budget nhỏ, JSON bị cắt giữa dòng và parse lỗi.
            // Tra cứu dinh dưỡng không cần suy luận nhiều bước nên tắt hẳn thinking:
            // nhanh hơn, rẻ hơn và luôn đủ chỗ cho 6 kết quả.
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: 2048,
          },
        }),
      });
    } catch {
      continue;
    }
    if (isRetryableStatus(response.status)) {
      lastStatus = response.status;
      continue;
    }
    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Gemini API lỗi HTTP ${response.status}: ${bodyText}`);
    }
    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini không trả về nội dung hợp lệ");
    return text;
  }
  throw new Error(
    `Tất cả ${API_KEYS.length} key đều không khả dụng (lỗi cuối: HTTP ${lastStatus}). Thử lại sau.`
  );
}

function stripFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  return s;
}

const TAG_GUIDE = FOOD_TAGS.map((t) => `"${t}" (${FOOD_TAG_LABELS[t]})`).join(", ");

const SYSTEM_INSTRUCTION = `Bạn là chuyên gia dinh dưỡng kiêm cơ sở dữ liệu thực phẩm Việt Nam.
Người dùng nhập tên/mô tả một món ăn hoặc nguyên liệu. Hãy trả về danh sách tối đa 6 thực phẩm PHÙ HỢP NHẤT (ưu tiên món phổ biến ở Việt Nam), mỗi món kèm chỉ số dinh dưỡng TRÊN 100g phần ăn được.

QUY TẮC:
- Chỉ số là số thực dương, tính trên 100g (đồ uống tính trên 100ml). Ước lượng hợp lý theo dữ liệu dinh dưỡng chuẩn.
- "tag" PHẢI là đúng một trong: ${TAG_GUIDE}.
- "name": tên tiếng Việt. "nameEn": tên tiếng Anh (nếu có).
- Với thực phẩm đếm theo quả/cái (vd trứng, chuối) mới điền "unit" (đơn vị tiếng Việt như "quả", "cái") và "gramsPerUnit" (khối lượng trung bình 1 đơn vị, gram). Còn lại BỎ TRỐNG 2 trường này.
- Nếu không tìm ra món phù hợp, trả về mảng rỗng.

Trả về DUY NHẤT JSON đúng cấu trúc:
{"results":[{"name":"...","nameEn":"...","calories":0,"protein":0,"fat":0,"carbs":0,"fiber":0,"tag":"...","unit":null,"gramsPerUnit":null}]}`;

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.kicked ? "Tài khoản của bạn đang được đăng nhập ở một thiết bị khác!" : "Chưa đăng nhập", kicked: auth.kicked },
      { status: 401 }
    );
  }

  let query = "";
  try {
    const body = (await req.json()) as { query?: unknown };
    query = typeof body.query === "string" ? body.query.trim() : "";
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  if (!query) {
    return NextResponse.json({ error: "Vui lòng nhập tên món cần tra cứu" }, { status: 400 });
  }
  if (query.length > 120) {
    return NextResponse.json({ error: "Từ khoá quá dài" }, { status: 400 });
  }

  try {
    const raw = await callGemini(`Tra cứu dinh dưỡng cho: "${query}"`, SYSTEM_INSTRUCTION);
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFence(raw));
    } catch {
      return NextResponse.json({ error: "Không đọc được kết quả từ AI, vui lòng thử lại" }, { status: 502 });
    }

    const rawResults = Array.isArray((parsed as { results?: unknown })?.results)
      ? (parsed as { results: unknown[] }).results
      : [];

    // Chỉ giữ kết quả hợp lệ (validate bằng cùng bộ quy tắc lúc lưu).
    const results: CleanFood[] = [];
    for (const item of rawResults) {
      if (!item || typeof item !== "object") continue;
      const v = validateFoodInput(item as Record<string, unknown>);
      if ("food" in v) results.push(v.food);
      if (results.length >= 6) break;
    }

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định khi tra cứu";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

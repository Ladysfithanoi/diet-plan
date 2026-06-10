// Gợi ý cách chế biến nhanh cho thực đơn AI.
//
// Suy ra trực tiếp từ chuỗi tên món (meal.name, ví dụ
// "Ức gà không da, không xương 180g + Cơm lứt 200g + Rau cải 150g")
// bằng cách dò từ khoá nguồn đạm chính — KHÔNG gọi thêm AI, zero cost,
// hiển thị ngay trên thẻ bữa ăn và trong PDF.

interface TipRule {
  keywords: string[];
  tip: string;
}

// Thứ tự QUAN TRỌNG: rule cụ thể đặt trước rule chung
// (vd "cá hồi" trước "cá", "ức gà" trước "gà") để rule cụ thể thắng.
const PROTEIN_TIPS: TipRule[] = [
  { keywords: ['whey'],
    tip: 'Pha với 250–300ml nước lạnh, lắc đều; uống ngay sau buổi tập để hấp thu nhanh.' },
  { keywords: ['ức gà', 'lườn gà'],
    tip: 'Ướp muối + tiêu + tỏi 10 phút rồi áp chảo chống dính không dầu hoặc luộc/hấp; vắt thêm chanh cho mềm, đỡ khô.' },
  { keywords: ['gà'],
    tip: 'Lọc bỏ da, luộc hoặc hấp gừng–sả; tránh chiên rán để giữ ít béo.' },
  { keywords: ['cá hồi'],
    tip: 'Áp chảo da giòn hoặc nướng giấy bạc với thì là — không cần thêm dầu vì cá đã sẵn béo.' },
  { keywords: ['cá'],
    tip: 'Hấp gừng–hành hoặc kho lạt ít đường; hạn chế chiên ngập dầu.' },
  { keywords: ['tôm'],
    tip: 'Hấp/luộc hoặc rang chảo không dầu, giữ nguyên vị ngọt tự nhiên.' },
  { keywords: ['mực'],
    tip: 'Hấp gừng hoặc xào nhanh lửa lớn, không nấu lâu kẻo dai.' },
  { keywords: ['bò'],
    tip: 'Áp chảo/xào nhanh lửa lớn với hành tây, ớt chuông; không xào quá kỹ kẻo dai.' },
  { keywords: ['trứng'],
    tip: 'Luộc lòng đào hoặc ốp la trên chảo chống dính không dầu.' },
  { keywords: ['đậu phụ', 'đậu hũ'],
    tip: 'Hấp hoặc sốt cà chua thay vì chiên ngập dầu để bớt hút mỡ.' },
  { keywords: ['vịt', 'ngan'],
    tip: 'Lọc bỏ da, luộc hoặc hấp; tránh quay để giảm lượng mỡ.' },
  { keywords: ['lợn', 'heo', 'nạc'],
    tip: 'Chọn phần nạc, luộc hoặc áp chảo không dầu; hạn chế chiên xào nhiều dầu.' },
];

/**
 * Trả về gợi ý cách chế biến cho một bữa, dựa trên nguồn đạm chính
 * trong tên món. Trả về null nếu không khớp nguyên liệu nào.
 */
export function getCookingTip(mealName: string): string | null {
  const lower = mealName.toLowerCase();
  for (const rule of PROTEIN_TIPS) {
    if (rule.keywords.some(k => lower.includes(k))) return rule.tip;
  }
  return null;
}

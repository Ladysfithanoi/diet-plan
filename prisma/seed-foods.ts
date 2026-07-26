// Seed toàn bộ món gốc từ lib/foods-data.ts lên bảng Food của Supabase (source="builtin").
// Chạy: npx tsx prisma/seed-foods.ts
// An toàn khi chạy lại: upsert theo name, không tạo trùng.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { readFileSync } from "fs";
import { resolve } from "path";
import { FOODS } from "../lib/foods-data";

function loadEnv(filePath: string, opts: { override?: boolean } = {}): void {
  try {
    const lines = readFileSync(filePath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      const isPlaceholder = /\[.+\]/.test(val);
      if (!isPlaceholder && (opts.override || !process.env[key])) {
        process.env[key] = val;
      }
    }
  } catch {}
}

loadEnv(resolve(process.cwd(), ".env"));
loadEnv(resolve(process.cwd(), ".env.local"), { override: true });

const pool = new Pool({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  let created = 0;
  let updated = 0;
  for (const f of FOODS) {
    const data = {
      nameEn: f.nameEn ?? null,
      calories: f.calories,
      protein: f.protein,
      fat: f.fat,
      carbs: f.carbs,
      fiber: f.fiber ?? null,
      unit: f.unit ?? null,
      gramsPerUnit: f.gramsPerUnit ?? null,
      tag: f.tag,
      source: "builtin",
    };
    const existing = await prisma.food.findUnique({ where: { name: f.name } });
    if (existing) {
      await prisma.food.update({ where: { name: f.name }, data });
      updated++;
    } else {
      await prisma.food.create({ data: { name: f.name, ...data } });
      created++;
    }
  }
  const total = await prisma.food.count();
  console.log(`✓ Seed xong: +${created} mới, ${updated} cập nhật. Tổng Food trong DB: ${total}`);
}

main()
  .catch((e) => {
    console.error("SEED FOODS ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

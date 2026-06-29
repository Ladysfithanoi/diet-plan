import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import type { SharePlan } from "@/lib/share";
import SharedPlanView from "../_components/SharedPlanView";

export const dynamic = "force-dynamic";

async function getPlan(slug: string): Promise<SharePlan | null> {
  const row = await prisma.sharedPlan.findUnique({ where: { id: slug } });
  if (!row) return null;
  return row.data as unknown as SharePlan;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const plan = await getPlan(slug);
  const title = plan ? `Thực đơn của ${plan.client.name}` : "Thực đơn không tồn tại";
  return { title, description: "Thực đơn dinh dưỡng cá nhân hoá" };
}

export default async function SharedPlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const plan = await getPlan(slug);

  if (!plan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center max-w-sm">
          <div
            className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "rgba(181,101,30,0.08)" }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B5651E" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-lg font-bold mb-1.5" style={{ color: "#14110E" }}>
            Không tìm thấy thực đơn
          </h1>
          <p className="text-sm" style={{ color: "rgba(20,17,14,0.55)" }}>
            Link có thể đã hết hạn hoặc sai. Vui lòng nhờ huấn luyện viên gửi lại đường link mới.
          </p>
        </div>
      </div>
    );
  }

  return <SharedPlanView plan={plan} />;
}

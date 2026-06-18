import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/jwt";
import prisma from "@/lib/prisma";
import { isTrialExpired, ROLE_TRIAL } from "@/lib/trial";
import DietForm from "./_components/DietForm";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) redirect("/login");

  let session;
  try {
    session = await verifySession(token);
  } catch {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || user.currentSessionToken !== session.sid) {
    redirect("/login?kicked=1");
  }

  // Phiên trải nghiệm đã hết hạn → đẩy về trang đăng nhập kèm thông báo
  if (isTrialExpired(user.role, user.trialExpiresAt)) {
    redirect("/login?expired=1");
  }

  return (
    <DietForm
      userName={user.name}
      trialExpiresAt={
        user.role === ROLE_TRIAL && user.trialExpiresAt
          ? user.trialExpiresAt.toISOString()
          : null
      }
    />
  );
}

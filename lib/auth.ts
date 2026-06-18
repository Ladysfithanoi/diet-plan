import { cookies } from "next/headers";
import { verifySession, COOKIE_NAME } from "@/lib/jwt";
import prisma from "@/lib/prisma";
import { isTrialExpired } from "@/lib/trial";

export type JWTPayload = { sub: string; email: string; role: string; sid: string };
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  currentSessionToken: string | null;
  trialExpiresAt: Date | null;
};

export type AuthResult =
  | { ok: true; session: JWTPayload; user: AuthUser }
  | { ok: false; kicked: boolean; expired?: boolean };

export async function getAuth(): Promise<AuthResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return { ok: false, kicked: false };

  let session: JWTPayload;
  try {
    session = await verifySession(token);
  } catch {
    return { ok: false, kicked: false };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, name: true, email: true, role: true, currentSessionToken: true, trialExpiresAt: true },
  });

  if (!user) return { ok: false, kicked: false };

  if (user.currentSessionToken !== session.sid) {
    return { ok: false, kicked: true };
  }

  // Phiên trải nghiệm đã hết hạn → khoá phiên đăng nhập hiện tại
  if (isTrialExpired(user.role, user.trialExpiresAt)) {
    return { ok: false, kicked: false, expired: true };
  }

  return { ok: true, session, user };
}

export async function getAdminAuth(): Promise<AuthResult> {
  const result = await getAuth();
  if (!result.ok) return result;
  if (result.session.role !== "ADMIN") return { ok: false, kicked: false };
  return result;
}

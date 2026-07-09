// Stateless, signed password-reset tokens — server-only.
//
// A reset link must prove "the person holding this link asked to reset THIS
// account, recently" without us storing anything in the DB (keeps the flow
// migration-free). We reuse the same jose HS256 signing as the login session
// (lib/jwt.ts), but with a distinct `purpose: "pwreset"` claim so a session
// cookie can never be replayed as a reset token, and a short 1-hour expiry.
//
// Trade-off: the token stays valid until it expires (not single-use), so we
// keep the window short. Good enough for a small internal tool.

import { SignJWT, jwtVerify } from "jose";

const TTL = "1h";
const PURPOSE = "pwreset";

function secret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET ?? "diet-plan-fallback-secret-change-me"
  );
}

/** Mints a reset token bound to a user id + email. */
export async function signResetToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret());
}

/**
 * Verifies a reset token. Returns { userId, email } when the signature is valid,
 * the purpose matches and the token hasn't expired; otherwise null. Never throws.
 */
export async function verifyResetToken(
  token: string | null | undefined
): Promise<{ userId: string; email: string } | null> {
  if (!token || typeof token !== "string") return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.purpose !== PURPOSE) return null;
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

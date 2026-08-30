import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const auth = await getAdminAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, trialExpiresAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const serialized = users.map((u) => ({
    ...u,
    trialExpiresAt: u.trialExpiresAt ? u.trialExpiresAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  }));

  return NextResponse.json({ users: serialized });
}

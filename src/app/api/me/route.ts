import { NextResponse } from "next/server";
import { getAppUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    },
  });
}

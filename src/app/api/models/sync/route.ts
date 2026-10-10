import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { syncSeedanceCatalog } from "@/lib/seedance-catalog";

export const dynamic = "force-dynamic";

function hasSchedulerAccess(request: Request) {
  const expected = process.env.SUPABASE_SECRET_KEY || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return Boolean(expected && left.length === right.length && timingSafeEqual(left, right));
}

export async function POST(request: Request) {
  if (!hasSchedulerAccess(request)) {
    const gate = await requireAdmin();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  try {
    return NextResponse.json({ ok: true, ...(await syncSeedanceCatalog()) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "模型同步失败" },
      { status: 502 },
    );
  }
}

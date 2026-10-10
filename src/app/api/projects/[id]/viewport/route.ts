import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/backend/server";

type Context = { params: Promise<{ id: string }> };

const input = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().min(0.25).max(2),
});

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params, supabase = await createClient();
  if (!supabase) return NextResponse.json({ demo: true });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "视口数据无效" }, { status: 400 });
  const { error } = await supabase.from("project_viewports").upsert({
    user_id: user.id,
    project_id: id,
    ...parsed.data,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,project_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

import type { Row } from "@/lib/backend/types";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/backend/server";

type Context = { params: Promise<{ voiceId: string }> };

const renameInput = z.object({ name: z.string().trim().min(1).max(80) });

const mapVoice = (row: Row) => ({
  id: row.id,
  projectId: row.project_id,
  projectName: row.project_name,
  name: row.name,
  voiceId: row.voice_id,
  sourceModel: row.source_model,
  lastUsedAt: row.last_used_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function PATCH(request: Request, { params }: Context) {
  const { voiceId } = await params;
  const parsed = renameInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "音色名称无效" }, { status: 400 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Cloudflare 后端尚未配置" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { data, error } = await supabase
    .from("voice_profiles")
    .update({ name: parsed.data.name, updated_at: new Date().toISOString() })
    .eq("voice_id", voiceId)
    .select("id,project_id,project_name,name,voice_id,source_model,last_used_at,created_at,updated_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "音色不存在" }, { status: 404 });
  return NextResponse.json({ voice: mapVoice(data) });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { voiceId } = await params;
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Cloudflare 后端尚未配置" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { data, error } = await supabase
    .from("voice_profiles")
    .delete()
    .eq("voice_id", voiceId)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "音色不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

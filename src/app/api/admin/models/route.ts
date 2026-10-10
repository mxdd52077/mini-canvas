import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { createClient } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

/** 模型与渠道管理：仅管理员可读写 model_configs / provider_configs。 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Cloudflare 后端尚未配置" }, { status: 503 });

  const [{ data: providers, error: pErr }, { data: models, error: mErr }] = await Promise.all([
    supabase.from("provider_configs").select("id,slug,name,base_url,adapter,enabled").order("name"),
    supabase
      .from("model_configs")
      .select("id,provider_id,model_id,display_name,kind,capabilities,pricing,enabled,updated_at")
      .order("display_name"),
  ]);
  if (pErr || mErr) {
    return NextResponse.json({ error: pErr?.message || mErr?.message || "加载失败" }, { status: 500 });
  }
  return NextResponse.json({ providers: providers || [], models: models || [] });
}

const patchInput = z.object({
  id: z.uuid(),
  enabled: z.boolean().optional(),
  display_name: z.string().min(1).max(120).optional(),
  pricing: z.record(z.string(), z.number()).optional(),
  base_url: z.url().optional(),
  provider_enabled: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Cloudflare 后端尚未配置" }, { status: 503 });

  let body: z.infer<typeof patchInput>;
  try {
    body = patchInput.parse(await req.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "参数无效" }, { status: 400 });
  }

  const modelPatch: Record<string, unknown> = {};
  if (body.enabled !== undefined) modelPatch.enabled = body.enabled;
  if (body.display_name !== undefined) modelPatch.display_name = body.display_name;
  if (body.pricing !== undefined) modelPatch.pricing = body.pricing;

  if (Object.keys(modelPatch).length) {
    const { error } = await supabase.from("model_configs").update(modelPatch).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.base_url !== undefined || body.provider_enabled !== undefined) {
    const providerPatch: Record<string, unknown> = {};
    if (body.base_url !== undefined) providerPatch.base_url = body.base_url;
    if (body.provider_enabled !== undefined) providerPatch.enabled = body.provider_enabled;
    const { error } = await supabase.from("provider_configs").update(providerPatch).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

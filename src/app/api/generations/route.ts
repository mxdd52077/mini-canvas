import { NextResponse } from "next/server";
import { z } from "zod";
import { submitGeneration, queryGeneration } from "@/lib/generation";
import { modelCompatibility } from "@/lib/model-compatibility";
import { canEditProject } from "@/lib/project-access";
import { createClient } from "@/lib/supabase/server";

const mediaKind = z.enum(["image", "video", "audio"]);
const input = z.object({
  projectId: z.uuid(),
  provider: z.enum(["seedance-nz", "volcengine"]),
  kind: mediaKind,
  model: z.string().min(1).max(160),
  prompt: z.string().min(1),
  references: z.array(z.object({ url: z.url(), kind: mediaKind })).max(50).optional(),
  resolution: z.string(),
  ratio: z.string().max(20).optional(),
  seconds: z.number().int().min(2).max(60).optional(),
  sound: z.boolean().optional(),
  voice: z.string().max(120).optional(),
  idempotencyKey: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const data = input.parse(await request.json());
    if (!await canEditProject(data.projectId))
      return NextResponse.json({ error: "无权编辑此项目" }, { status: 403 });

    const supabase = await createClient();
    if (!supabase) return NextResponse.json({ error: "未配置 Supabase" }, { status: 503 });
    const { data: model, error: modelError } = await supabase
      .from("model_configs")
      .select("model_id,kind,capabilities,provider_configs!inner(slug,enabled)")
      .eq("model_id", data.model)
      .eq("kind", data.kind)
      .eq("enabled", true)
      .eq("provider_configs.slug", data.provider)
      .eq("provider_configs.enabled", true)
      .maybeSingle();
    if (modelError) throw modelError;
    if (!model) return NextResponse.json({ error: "模型不存在或已停用" }, { status: 400 });

    const references = data.references || [];
    const compatibility = modelCompatibility(model, {
      image: references.filter((item) => item.kind === "image").length,
      video: references.filter((item) => item.kind === "video").length,
      audio: references.filter((item) => item.kind === "audio").length,
    });
    if (!compatibility.compatible)
      return NextResponse.json({ error: compatibility.reason }, { status: 400 });
    const parameters = model.capabilities?.parameters as { resolutions?: string[]; ratios?: string[]; duration?: { min: number; max: number }; voice_required?: boolean } | undefined;
    if (parameters?.resolutions?.length && !parameters.resolutions.includes(data.resolution))
      return NextResponse.json({ error: `该模型不支持分辨率 ${data.resolution}` }, { status: 400 });
    if (data.ratio && parameters?.ratios?.length && !parameters.ratios.includes(data.ratio))
      return NextResponse.json({ error: `该模型不支持画面比例 ${data.ratio}` }, { status: 400 });
    if (data.seconds && parameters?.duration && (data.seconds < parameters.duration.min || data.seconds > parameters.duration.max))
      return NextResponse.json({ error: `该模型时长范围为 ${parameters.duration.min}–${parameters.duration.max} 秒` }, { status: 400 });
    if (parameters?.voice_required && !data.voice?.trim())
      return NextResponse.json({ error: "该音频模型需要填写音色 ID" }, { status: 400 });

    const key = data.provider === "seedance-nz" ? process.env.SEEDANCE_API_KEY : process.env.VOLCENGINE_API_KEY;
    if (!key) return NextResponse.json({ error: `${data.provider} 尚未配置服务端密钥` }, { status: 503 });
    const result = await submitGeneration(data, key);
    if (data.kind === "audio" && data.voice?.trim())
      await supabase.from("voice_profiles").update({ last_used_at: new Date().toISOString() }).eq("voice_id", data.voice.trim());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "提交失败" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = z.object({ projectId: z.uuid(), kind: mediaKind, id: z.string().min(1).max(200), model: z.string().max(160).optional() }).safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  if (!await canEditProject(parsed.data.projectId)) return NextResponse.json({ error: "无权查看此项目任务" }, { status: 403 });
  const key = process.env.SEEDANCE_API_KEY;
  if (!key) return NextResponse.json({ error: "Seedance NZ 密钥未配置" }, { status: 503 });
  try {
    return NextResponse.json(await queryGeneration("seedance-nz", parsed.data.kind, parsed.data.id, key, parsed.data.model));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "查询失败" }, { status: 502 });
  }
}

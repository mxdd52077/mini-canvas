import { NextResponse } from "next/server";
import { z } from "zod";
import { submitMidjourneyAction } from "@/lib/generation";
import { canEditProject } from "@/lib/project-access";

const input = z.object({
  projectId: z.uuid(),
  taskId: z.string().min(1).max(200).regex(/^[\w-]+$/),
  action: z.enum(["upscale", "variation", "reroll", "high-variation", "low-variation", "zoom"]),
  index: z.number().int().min(1).max(4).optional(),
  zoomRatio: z.number().min(1).max(2).optional(),
});

export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Midjourney 操作参数无效" }, { status: 400 });
  if (!await canEditProject(parsed.data.projectId)) return NextResponse.json({ error: "无权编辑此项目" }, { status: 403 });
  const key = process.env.SEEDANCE_API_KEY;
  if (!key) return NextResponse.json({ error: "Seedance NZ 密钥未配置" }, { status: 503 });
  try {
    return NextResponse.json(await submitMidjourneyAction(parsed.data.action, parsed.data.taskId, key, parsed.data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Midjourney 操作失败" }, { status: 502 });
  }
}

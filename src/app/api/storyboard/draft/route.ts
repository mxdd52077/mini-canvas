import { NextResponse } from "next/server";
import { z } from "zod";
import { canEditProject } from "@/lib/project-access";
import { chatCompletionText } from "@/lib/chat-completion";

const input = z.object({
  projectId: z.uuid(),
  prompt: z.string().min(1).max(8000),
  answers: z.record(z.string(), z.string().max(500)).default({}),
  feedback: z.string().max(2000).optional(),
  previousDraft: z
    .object({ assets: z.array(z.unknown()), shots: z.array(z.unknown()) })
    .optional(),
});

const spec = z.object({
  assets: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        category: z.string().max(20).default(""),
        prompt: z.string().min(1).max(2000),
      }),
    )
    .max(16),
  shots: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        prompt: z.string().min(1).max(2000),
        seconds: z.number().int().min(4).max(30).optional(),
        assets: z.array(z.string()).max(12).default([]),
      }),
    )
    .max(12),
});

const systemPrompt = `你是分镜拆解助手。用户会给你一段分镜脚本或创意描述，以及用户对风格、比例、模型等问题的回答，请拆解为：
1. assets：需要预先生成的视觉资产，给出简洁中文 name、category（character/product/prop/scene 等）和详细的图片生成提示词 prompt。人物规则：
   - 同一人物出现在 2 个及以上分镜时，为该人物生成一条设定图资产：name 为「角色名·设定图」，category 为 character，prompt 要求在同一张图内同时包含三视图（正面、侧面、背面并排）和头部特写，形象统一，用于全片人物一致性参考；
   - 只出现 1 次的人物生成一条普通形象图即可；
2. shots：每个分镜一个条目，给出简洁中文 name、详细的视频生成提示词 prompt、时长 seconds、以及该分镜用到的资产 name 列表 assets（必须来自上面的 assets，引用人物时引用其设定图）。
   - seconds 由你根据该分镜的动作复杂度、台词量、镜头运动在 4-15 秒整数内自主决定，简单静态镜头用 4-6 秒，动作或叙事复杂的镜头用 8-15 秒；
3. 把用户选择的画面风格融入到每条 prompt 中，保持全片风格统一；
4. 如果用户给出了修改反馈和上一次草稿，请在草稿基础上按反馈修改，输出完整的修改后结果。
只输出 JSON，格式为 {"assets":[{"name":"","category":"character","prompt":""}],"shots":[{"name":"","prompt":"","seconds":5,"assets":[""]}]}，不要输出任何其他文字。`;

export async function POST(req: Request) {
  try {
    const data = input.parse(await req.json());
    if (!(await canEditProject(data.projectId)))
      return NextResponse.json({ error: "无权编辑此项目" }, { status: 403 });
    const apiKey = process.env.KIMI_API_KEY || process.env.SEEDANCE_API_KEY,
      baseUrl = process.env.KIMI_BASE_URL || "https://api.seedance.nz/v1",
      model = process.env.KIMI_MODEL_ID || "zhenzhen/g5.6-luna";
    if (!apiKey)
      return NextResponse.json(
        { error: "分镜拆解尚未配置 API Key(KIMI_API_KEY 或 SEEDANCE_API_KEY)" },
        { status: 503 },
      );
    const answerLines = Object.entries(data.answers)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `- ${k}：${v}`)
      .join("\n");
    let prompt = `【脚本】\n${data.prompt}`;
    if (answerLines) prompt += `\n\n【用户选择】\n${answerLines}`;
    if (data.feedback?.trim() && data.previousDraft)
      prompt += `\n\n【上一次草稿】\n${JSON.stringify(data.previousDraft)}\n\n【修改反馈】\n${data.feedback}`;
    const raw = await chatCompletionText({
      baseUrl,
      apiKey,
      model,
      system: systemPrompt,
      prompt,
      maxTokens: 8192,
    });
    const match = raw.trim().match(/\{[\s\S]*\}/);
    if (!match)
      return NextResponse.json(
        { error: "模型没有返回有效的拆解结果" },
        { status: 502 },
      );
    let parsed;
    try {
      parsed = spec.parse(JSON.parse(match[0]));
    } catch {
      return NextResponse.json(
        { error: "拆解结果格式无效，请重试" },
        { status: 502 },
      );
    }
    const names = new Set(parsed.assets.map((a) => a.name));
    for (const shot of parsed.shots)
      shot.assets = shot.assets.filter((n) => names.has(n));
    return NextResponse.json(parsed);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
    console.error("[storyboard/draft]", error);
    return NextResponse.json(
      {
        error: `模型服务连接失败，请重试(${error instanceof Error ? error.message : "未知错误"})`,
      },
      { status: 502 },
    );
  }
}

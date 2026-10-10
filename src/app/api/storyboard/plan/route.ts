import { NextResponse } from "next/server";
import { z } from "zod";
import { canEditProject } from "@/lib/project-access";
import { chatCompletionText } from "@/lib/chat-completion";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_VIDEO_RATIO,
  IMAGE_MODELS,
  VIDEO_MODELS,
  VIDEO_RATIOS,
} from "@/lib/models";
import type { StoryboardQuestion } from "@/lib/storyboard";

const input = z.object({
  projectId: z.uuid(),
  prompt: z.string().min(1).max(8000),
});

const llmSpec = z.object({
  summary: z.string().max(300).default(""),
  styleOptions: z.array(z.string().min(1).max(40)).min(2).max(8),
  recommendedStyle: z.string().max(40).default(""),
  recommendedRatio: z.string().max(10).default(""),
  recommendedImageModel: z.string().max(80).default(""),
  recommendedVideoModel: z.string().max(80).default(""),
});

const buildSystemPrompt = () => `你是视频创作顾问。用户会给你一段分镜脚本或创意描述，请分析并输出 JSON：
1. summary：一句话概括这个视频的内容与调性（30 字以内）；
2. styleOptions：4-6 个适合该内容的画面风格选项，每个 4-12 个字（例如"写实电影感"、"日系动漫"、"赛博朋克"）；
3. recommendedStyle：从 styleOptions 中选一个最推荐的；
4. recommendedRatio：从 [${VIDEO_RATIOS.join(", ")}] 中选一个最适合分发场景的视频比例；
5. recommendedImageModel：从 [${IMAGE_MODELS.map((m) => m.value).join(", ")}] 中选一个生图模型（画质要求高选 ${IMAGE_MODELS[1]?.value ?? IMAGE_MODELS[0].value}，追求性价比选 ${IMAGE_MODELS[0].value}）；
6. recommendedVideoModel：从 [${VIDEO_MODELS.map((m) => m.value).join(", ")}] 中选一个生视频模型（综合质量选 ${VIDEO_MODELS[0].value}，快速出稿选 seedance-2.0-fast，低成本选 seedance-2.0-mini）。
只输出 JSON，格式为 {"summary":"","styleOptions":[""],"recommendedStyle":"","recommendedRatio":"","recommendedImageModel":"","recommendedVideoModel":""}，不要输出任何其他文字。`;

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
    const raw = await chatCompletionText({
      baseUrl,
      apiKey,
      model,
      system: buildSystemPrompt(),
      prompt: data.prompt,
      maxTokens: 2048,
    });
    const match = raw.trim().match(/\{[\s\S]*\}/);
    if (!match)
      return NextResponse.json(
        { error: "模型没有返回有效的分析结果" },
        { status: 502 },
      );
    let parsed;
    try {
      parsed = llmSpec.parse(JSON.parse(match[0]));
    } catch {
      return NextResponse.json(
        { error: "分析结果格式无效，请重试" },
        { status: 502 },
      );
    }
    const styleOptions = [...new Set(parsed.styleOptions)].slice(0, 8);
    const recommendedStyle = styleOptions.includes(parsed.recommendedStyle)
      ? parsed.recommendedStyle
      : styleOptions[0];
    const recommendedRatio = VIDEO_RATIOS.includes(parsed.recommendedRatio)
      ? parsed.recommendedRatio
      : DEFAULT_VIDEO_RATIO;
    const recommendedImageModel = IMAGE_MODELS.some(
      (m) => m.value === parsed.recommendedImageModel,
    )
      ? parsed.recommendedImageModel
      : DEFAULT_IMAGE_MODEL;
    const recommendedVideoModel = VIDEO_MODELS.some(
      (m) => m.value === parsed.recommendedVideoModel,
    )
      ? parsed.recommendedVideoModel
      : DEFAULT_VIDEO_MODEL;
    const questions: StoryboardQuestion[] = [
      {
        key: "style",
        label: "画面风格",
        type: "chips",
        options: styleOptions.map((v) => ({ value: v, label: v })),
        recommended: recommendedStyle,
        allowCustom: true,
      },
      {
        key: "ratio",
        label: "视频比例",
        type: "chips",
        options: VIDEO_RATIOS.map((v) => ({ value: v, label: v })),
        recommended: recommendedRatio,
      },
      {
        key: "imageModel",
        label: "生图模型",
        type: "chips",
        options: IMAGE_MODELS,
        recommended: recommendedImageModel,
      },
      {
        key: "videoModel",
        label: "生视频模型",
        type: "chips",
        options: VIDEO_MODELS,
        recommended: recommendedVideoModel,
      },
      { key: "extra", label: "其他要求（可选）", type: "text" },
    ];
    return NextResponse.json({ summary: parsed.summary, questions });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
    console.error("[storyboard/plan]", error);
    return NextResponse.json(
      {
        error: `模型服务连接失败，请重试(${error instanceof Error ? error.message : "未知错误"})`,
      },
      { status: 502 },
    );
  }
}

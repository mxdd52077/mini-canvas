import {
  Agent,
  type AgentEvent,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import { streamSimple } from "@earendil-works/pi-ai/api/openai-completions";
import type { Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
type Command =
  | { type: "update"; patch: Record<string, unknown> }
  | { type: "create"; kind: string; x?: number; y?: number }
  | { type: "delete"; ids: string[] }
  | { type: "connect"; from: string; to: string };
export async function runCanvasAgent(prompt: string, selected: unknown[]) {
  const apiKey = process.env.KIMI_API_KEY || process.env.SEEDANCE_API_KEY,
    baseUrl = process.env.KIMI_BASE_URL || "https://api.seedance.nz/v1",
    modelId = process.env.KIMI_MODEL_ID || "zhenzhen/g5.6-luna";
  if (!apiKey) throw new Error("画布助手尚未配置 API Key(KIMI_API_KEY 或 SEEDANCE_API_KEY)");
  const commands: Command[] = [];
  const tool = (
    name: string,
    description: string,
    parameters: ReturnType<typeof Type.Object>,
  ): AgentTool => ({
    name,
    label: name,
    description,
    parameters,
    executionMode: "sequential",
    execute: async (_id, params) => {
      commands.push(params as unknown as Command);
      return {
        content: [{ type: "text", text: "画布命令已加入事务" }],
        details: params,
      };
    },
  });
  const tools = [
    tool(
      "update",
      "修改当前选中元素。patch 可含 fill、stroke、x、y、width、height、rotation、content。",
      Type.Object({
        type: Type.Literal("update"),
        patch: Type.Record(Type.String(), Type.Unknown()),
      }),
    ),
    tool(
      "create",
      "创建画布元素。",
      Type.Object({
        type: Type.Literal("create"),
        kind: Type.Union([
          Type.Literal("rect"),
          Type.Literal("ellipse"),
          Type.Literal("text"),
          Type.Literal("frame"),
          Type.Literal("image-gen"),
          Type.Literal("video-gen"),
          Type.Literal("audio-gen"),
        ]),
        x: Type.Optional(Type.Number()),
        y: Type.Optional(Type.Number()),
      }),
    ),
    tool(
      "delete",
      "删除指定元素。",
      Type.Object({
        type: Type.Literal("delete"),
        ids: Type.Array(Type.String()),
      }),
    ),
    tool(
      "connect",
      "连接两个元素。",
      Type.Object({
        type: Type.Literal("connect"),
        from: Type.String(),
        to: Type.String(),
      }),
    ),
  ];
  const model: Model<"openai-completions"> = {
    id: modelId,
    name: "G5.6 Luna",
    api: "openai-completions",
    provider: "seedance-nz",
    baseUrl,
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1050000,
    maxTokens: 32768,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: "max_tokens",
      supportsStrictMode: false,
      thinkingFormat: "openai",
    },
    thinkingLevelMap: { off: null, low: "low", high: "high", max: "max" },
  };
  let text = "";
  const agent = new Agent({
    initialState: {
      systemPrompt:
        "你是 Mini Canvas 的设计助手。使用工具操作画布。只修改用户选择的对象，除非用户明确要求创建。用简洁中文总结实际执行内容。",
      model,
      thinkingLevel: "low",
      tools,
      messages: [],
    },
    streamFn: (m, c, o) =>
      streamSimple(m as Model<"openai-completions">, c, { ...o, apiKey }),
    toolExecution: "sequential",
  });
  agent.subscribe((event: AgentEvent) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent?.type === "text_delta"
    )
      text += event.assistantMessageEvent.delta;
  });
  await agent.prompt(`${prompt}\n当前选中元素：${JSON.stringify(selected)}`);
  return { message: text || "已完成画布操作。", commands };
}

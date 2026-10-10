type ChatCompletionOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  imageDataUrl?: string;
  maxTokens?: number;
};

const request = async (options: ChatCompletionOptions): Promise<string> => {
  const response = await fetch(`${options.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.imageDataUrl ? [
          { type: "text", text: options.prompt },
          { type: "image_url", image_url: { url: options.imageDataUrl } },
        ] : options.prompt },
      ],
      max_tokens: options.maxTokens ?? 4096,
      reasoning_effort: "low",
      stream: true,
    }),
  });
  if (!response.ok) {
    let message = "模型请求失败";
    try {
      message = (await response.json())?.error?.message || message;
    } catch {}
    throw new Error(message);
  }
  if (!response.body) throw new Error("模型服务没有返回数据流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        text += JSON.parse(data).choices?.[0]?.delta?.content || "";
      } catch {}
    }
  }
  return text;
};

// 走流式 SSE：推理模型响应慢，非流式请求会被中间代理按 60s 空闲超时掐断。
export const chatCompletionText = async (
  options: ChatCompletionOptions,
  retries = 3,
): Promise<string> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await request(options);
    } catch (error) {
      lastError = error;
      console.error(`[chat-completion] 模型请求失败(第 ${attempt + 1} 次)`, error);
    }
  }
  throw lastError;
};

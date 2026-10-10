export type GenerationReference = { url: string; kind: "image" | "video" | "audio" };
export type GenerationInput = {
  provider: "seedance-nz" | "volcengine";
  kind: "image" | "video" | "audio";
  model: string;
  prompt: string;
  references?: GenerationReference[];
  resolution: string;
  ratio?: string;
  seconds?: number;
  sound?: boolean;
  voice?: string;
};

export type MidjourneyAction = "upscale" | "variation" | "reroll" | "high-variation" | "low-variation" | "zoom";

const seedreamSize = (resolution: string, ratio?: string) => {
  if (!ratio) return { resolution };
  const base = resolution === "2k" ? 2048 : 1024;
  const [width, height] = ratio.split(":").map(Number);
  if (!width || !height) return { resolution };
  return width >= height
    ? { width: base, height: Math.round(base * height / width) }
    : { width: Math.round(base * width / height), height: base };
};

export async function submitGeneration(input: GenerationInput, key: string) {
  if (input.provider === "seedance-nz") {
    const midjourney = input.kind === "image" && input.model === "midjourney-imagine";
    const path = midjourney ? "/v1/midjourney/generations/imagine" : input.kind === "image" ? "/v1/image/generations" : input.kind === "video" ? "/v1/videos" : "/v1/audio/generations";
    const references = input.references || [];
    const imageRefs = references.filter((item) => item.kind === "image").map((item) => item.url);
    const videoRefs = references.filter((item) => item.kind === "video").map((item) => item.url);
    const audioRefs = references.filter((item) => item.kind === "audio").map((item) => item.url);
    let payload: Record<string, unknown>;
    if (input.kind === "image") {
      const zhenzhenImage = input.model.startsWith("zhenzhen-image-");
      payload = midjourney
        ? {
            prompt: input.prompt,
            ...(imageRefs.length ? { image_urls: imageRefs } : {}),
            ...(input.ratio ? { size: input.ratio } : {}),
          }
        : {
            model: input.model,
            prompt: input.prompt,
            ...(imageRefs.length ? { images: imageRefs } : {}),
            ...(zhenzhenImage
              ? { resolution: input.resolution, size: input.ratio || "auto", n: 1 }
              : { metadata: { ...seedreamSize(input.resolution, input.ratio), output_format: "jpeg" } }),
          };
    } else if (input.kind === "video") {
      const content = [
        ...imageRefs.map((url) => ({ type: "image_url", image_url: { url } })),
        ...videoRefs.map((url) => ({ type: "video_url", video_url: { url } })),
        ...audioRefs.map((url) => ({ type: "audio_url", audio_url: { url } })),
      ];
      const useImages = /-i2v(?:$|-)|start-end/.test(input.model);
      const useContent = /-multi(?:$|-)|-r2v(?:$|-)|reference|upscal|v2v|-edit$|motion|elements/.test(input.model);
      payload = {
        model: input.model,
        prompt: input.prompt,
        seconds: String(input.seconds || 5),
        ...(useImages && imageRefs.length ? { images: imageRefs } : {}),
        metadata: {
          resolution: input.resolution,
          ratio: input.ratio || "adaptive",
          generate_audio: input.sound ?? true,
          ...(useContent && content.length ? { content } : {}),
        },
      };
    } else {
      const metadata: Record<string, unknown> = {};
      if (input.model === "doubao-seed-audio-1.0") {
        if (input.voice) metadata.speaker = input.voice;
        else if (audioRefs.length) metadata.audio_url = audioRefs;
      } else if (input.model.includes("voice-clone")) {
        metadata.audio_url = audioRefs[0];
        metadata.custom_voice_id = input.voice;
      } else if (input.model.includes("speech-2.8")) {
        metadata.voice_id = input.voice;
      } else if (input.model.includes("qwen3-tts")) {
        metadata.voice = input.voice;
      } else if (/mureka-(v9|o2)-song/.test(input.model)) {
        metadata.lyrics = input.prompt;
      } else if (input.model === "minimax-music-2.6") {
        metadata.lyrics = input.prompt;
      }
      payload = {
        model: input.model,
        prompt: input.prompt,
        ...(imageRefs.length ? { images: imageRefs.slice(0, 1) } : {}),
        ...(Object.keys(metadata).length ? { metadata } : {}),
      };
    }

    const response = await fetch(`https://api.seedance.nz${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { error?: { message?: string } | string; message?: string; detail?: string } | null;
      const message = typeof detail?.error === "string" ? detail.error : detail?.error?.message || detail?.message || detail?.detail;
      throw new Error(message || `Seedance 提交失败 (${response.status})`);
    }
    return response.json();
  }

  const endpoint = process.env.VOLCENGINE_ENDPOINT;
  if (!endpoint) throw new Error("火山引擎 Endpoint 尚未配置");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`火山引擎提交失败 (${response.status})`);
  return response.json();
}

export async function submitMidjourneyAction(action: MidjourneyAction, taskId: string, key: string, options: { index?: number; zoomRatio?: number } = {}) {
  const response = await fetch(`https://api.seedance.nz/v1/midjourney/generations/${action}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      task_id: taskId,
      ...(options.index ? { index: options.index } : {}),
      ...(options.zoomRatio ? { zoom_ratio: options.zoomRatio } : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: { message?: string } | string } | null;
    const message = typeof detail?.error === "string" ? detail.error : detail?.error?.message;
    throw new Error(message || `Midjourney 操作失败 (${response.status})`);
  }
  return response.json();
}

export async function queryGeneration(provider: GenerationInput["provider"], kind: GenerationInput["kind"], taskId: string, key: string, model?: string) {
  const path = model?.startsWith("midjourney-") ? "/v1/midjourney" : kind === "image" ? "/v1/image/generations" : kind === "video" ? "/v1/videos" : "/v1/audio/generations";
  const url = provider === "seedance-nz" ? `https://api.seedance.nz${path}/${encodeURIComponent(taskId)}` : `${process.env.VOLCENGINE_ENDPOINT}/${encodeURIComponent(taskId)}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: { message?: string } | string; message?: string; detail?: string } | null;
    const message = typeof detail?.error === "string" ? detail.error : detail?.error?.message || detail?.message || detail?.detail;
    throw new Error(message || `查询任务失败 (${response.status})`);
  }
  return response.json();
}

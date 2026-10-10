export type MediaInputCounts = { image: number; video: number; audio: number };

export type ModelRequirements = {
  min_images?: number;
  max_images?: number;
  min_videos?: number;
  max_videos?: number;
  min_audio?: number;
  max_audio?: number;
  min_total?: number;
  max_total?: number;
};

export type CompatibleModel = {
  model_id: string;
  kind: string;
  capabilities?: {
    canvas_supported?: boolean;
    unsupported_reason?: string;
    requirements?: ModelRequirements;
  };
};

export function modelCompatibility(model: CompatibleModel, counts: MediaInputCounts) {
  if (model.capabilities?.canvas_supported === false)
    return { compatible: false, reason: model.capabilities.unsupported_reason || "当前画布尚不支持这个模型的专用参数" };
  const rules = model.capabilities?.requirements || {};
  const total = counts.image + counts.video + counts.audio;
  const checks: [number, number | undefined, number | undefined, string][] = [
    [counts.image, rules.min_images, rules.max_images, "图片"],
    [counts.video, rules.min_videos, rules.max_videos, "视频"],
    [counts.audio, rules.min_audio, rules.max_audio, "音频"],
    [total, rules.min_total, rules.max_total, "素材"],
  ];
  for (const [actual, min, max, label] of checks) {
    if (min !== undefined && actual < min) return { compatible: false, reason: `至少需要 ${min} 个${label}输入` };
    if (max !== undefined && actual > max) return { compatible: false, reason: `最多支持 ${max} 个${label}输入` };
  }
  return { compatible: true, reason: "" };
}

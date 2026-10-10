import { createClient } from "@supabase/supabase-js";

const PRICING_URL = "https://api.seedance.nz/api/pricing";

type PricingModel = {
  model_name?: unknown;
  description?: unknown;
  tags?: unknown;
  vendor_id?: unknown;
  quota_type?: unknown;
  model_ratio?: unknown;
  model_price?: unknown;
  owner_by?: unknown;
  completion_ratio?: unknown;
  enable_groups?: unknown;
  supported_endpoint_types?: unknown;
  pricing_version?: unknown;
  created_time?: unknown;
};

type PricingPayload = {
  success?: unknown;
  data?: unknown;
  pricing_version?: unknown;
};

export type CatalogKind = "image" | "video" | "audio";

export function invocationProfile(kind: CatalogKind, modelId: string, category: string) {
  const id = modelId.toLowerCase();
  const normalizedCategory = category.toLowerCase();
  const requirements = { min_images: 0, max_images: 0, min_videos: 0, max_videos: 0, min_audio: 0, max_audio: 0, min_total: 0 };
  let endpoint = kind === "image" ? "/v1/image/generations" : kind === "video" ? "/v1/videos" : "/v1/audio/generations";
  let canvasSupported = true;
  let unsupportedReason = "";
  const parameters: {
    resolutions?: string[];
    ratios?: string[];
    duration?: { min: number; max: number; default: number };
    voice_supported?: boolean;
    voice_required?: boolean;
  } = {};

  if (kind === "image") {
    parameters.resolutions = /zhenzhen-image-g2|gk-v15|nb-2-lite/.test(id) ? ["1k"] : /zhenzhen-image|nb-|flux-3-image/.test(id) ? ["1k", "2k", "4k"] : /flash/.test(id) ? ["1k", "1.5k", "2k"] : ["1k", "2k"];
    parameters.ratios = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"];
    if (id.startsWith("midjourney-")) {
      endpoint = id === "midjourney-imagine" ? "/v1/midjourney/generations/imagine" : `/v1/midjourney/generations/${id.slice("midjourney-".length)}`;
      if (id === "midjourney-imagine") {
        requirements.max_images = 16;
      } else {
        canvasSupported = false;
        unsupportedReason = "这是 Midjourney 结果操作，请在生成结果上的操作按钮中使用";
      }
    } else if (normalizedCategory === "image_edit" || /-i2i(?:$|-)|-edit(?:$|-)|layer-decomposition|segment/.test(id)) {
      requirements.min_images = 1;
      requirements.max_images = /layer-decomposition/.test(id) ? 1 : /qwen-image/.test(id) ? 3 : /seedream/.test(id) ? 10 : /wan-2\.7-global/.test(id) ? 9 : 16;
      requirements.min_total = 1;
    } else if (/-t2i(?:$|-)|gk-v2$/.test(id)) {
      requirements.max_images = 0;
    } else {
      requirements.max_images = 16;
    }
  } else if (kind === "video") {
    parameters.resolutions = /happyhorse|wan-2\.7-spicy/.test(id) ? ["720p", "1080p"] : /hailuo-h3|max-turbo/.test(id) ? ["480p", "768p"] : /seedance-2\.5/.test(id) ? ["480p", "720p", "1080p", "2k", "4k", "native1080p"] : ["480p", "720p", "1080p", "2k", "4k"];
    parameters.ratios = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
    parameters.duration = /happyhorse/.test(id) ? { min: 3, max: 15, default: 5 } : /wan-2\.7-spicy/.test(id) ? { min: 2, max: 15, default: 5 } : /seedance-2\.5|wan-3\.0/.test(id) ? { min: 4, max: 30, default: 5 } : { min: 4, max: 15, default: 5 };
    if (/upscal|v2v|video-edit|-edit$/.test(id)) {
      requirements.min_videos = 1;
      requirements.max_videos = 1;
      requirements.min_total = 1;
    } else if (/motion/.test(id)) {
      requirements.min_images = 1;
      requirements.max_images = 1;
      requirements.min_videos = 1;
      requirements.max_videos = 1;
      requirements.min_total = 2;
    } else if (/-i2v(?:$|-)|start-end/.test(id)) {
      requirements.min_images = 1;
      requirements.max_images = /happyhorse|hailuo/.test(id) ? 2 : /flux-3/.test(id) ? 10 : 2;
      requirements.min_total = 1;
    } else if (/-multi(?:$|-)|-r2v(?:$|-)|reference|elements/.test(id)) {
      requirements.max_images = /seedance-2\.5/.test(id) ? 30 : 10;
      requirements.max_videos = /seedance-2\.5/.test(id) ? 10 : 5;
      requirements.max_audio = /seedance-2\.5/.test(id) ? 10 : 5;
      requirements.min_total = 1;
    } else if (/-t2v(?:$|-)/.test(id)) {
      // 文生视频不接受参考素材。
    } else {
      canvasSupported = false;
      unsupportedReason = "模型需要文档中的专用参数，暂不在通用视频节点中展示";
    }
    if (/context-ir|draft-enhance|lip-sync/.test(id)) {
      canvasSupported = false;
      unsupportedReason = "模型依赖专用任务或中间结果";
    }
  } else {
    const directAudio = /^(doubao-seed-audio|mureka-(v8|v9)-bgm|minimax-(speech-2\.8|voice-clone|music-2\.6)|mureka-(v9|o2)-song|qwen3-tts)/.test(id);
    if (!directAudio) {
      canvasSupported = false;
      endpoint = id === "whisper-1" ? "/v1/audio/transcriptions" : "/v1/music/generations";
      unsupportedReason = "该模型使用上传、任务引用或音乐专用参数，请在模型管理中查看";
    } else {
      requirements.max_images = id === "doubao-seed-audio-1.0" ? 1 : 0;
      requirements.max_audio = id === "doubao-seed-audio-1.0" ? 3 : 0;
      if (/voice-clone/.test(id)) {
        requirements.min_audio = 1;
        requirements.max_audio = 1;
        requirements.min_total = 1;
      }
      parameters.voice_supported = /doubao-seed-audio|speech|tts|voice-clone/.test(id);
      parameters.voice_required = /(speech|tts|voice-clone)/.test(id);
    }
  }
  return { endpoint, canvas_supported: canvasSupported, unsupported_reason: unsupportedReason, requirements, parameters, operation: category };
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const stringList = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function tagsOf(model: PricingModel) {
  const tags = Array.isArray(model.tags)
    ? stringList(model.tags)
    : text(model.tags).split(",");
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function kindOf(tags: string[]): CatalogKind | null {
  if (tags.includes("audio")) return "audio";
  if (tags.includes("video")) return "video";
  if (tags.includes("image")) return "image";
  return null;
}

function categoryOf(kind: CatalogKind, modelName: string, description: string, tags: string[]) {
  const haystack = `${modelName} ${description} ${tags.join(" ")}`.toLowerCase();
  if (kind === "audio") {
    if (/\b(bgm|background music)\b|背景音乐|配乐/.test(haystack))
      return ["bgm_generation", "BGM 生成"] as const;
    if (/clone|cloning|voice.?copy|create.?voice|复刻|克隆/.test(haystack))
      return ["voice_clone", "声音克隆"] as const;
    if (/stem|separat|concat|fade|remaster|lyrics|vocal|instrumental|transcri|whisper|download|upload|crop|mashup|midi|\bbpm\b|wav|video.?clip|remove.?section|adjust.?speed|分离|拼接|淡出|歌词|人声|转写/.test(haystack))
      return ["audio_processing", "音频处理"] as const;
    if (/tts|speech|voice|narrat|语音|朗读|配音|音色|说话/.test(haystack))
      return ["speech_generation", "语音生成"] as const;
    if (/music|song|suno|mureka|歌曲|音乐|作曲|伴奏/.test(haystack))
      return ["music_generation", "音乐生成"] as const;
    return ["audio_other", "其他音频"] as const;
  }
  if (/upscal|enhanc|超分|高清/.test(haystack)) return ["upscale", "高清增强"] as const;
  if (kind === "image") {
    if (/edit|i2i|image.?to.?image|图生图|编辑/.test(haystack)) return ["image_edit", "图片编辑"] as const;
    return ["image_generation", "图片生成"] as const;
  }
  if (/multi|omni|reference|r2v|多模态|参考/.test(haystack)) return ["multimodal_video", "多模态视频"] as const;
  if (/i2v|image.?to.?video|图生视频/.test(haystack)) return ["image_to_video", "图生视频"] as const;
  return ["text_to_video", "文生视频"] as const;
}

function serviceClient() {
  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("服务端尚未配置 Supabase 管理密钥");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function syncSeedanceCatalog() {
  const response = await fetch(PRICING_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Seedance 价格接口返回 ${response.status}`);
  const payload = (await response.json()) as PricingPayload;
  if (payload.success === false || !Array.isArray(payload.data)) throw new Error("Seedance 价格接口数据格式无效");

  const supabase = serviceClient();
  const { data: provider, error: providerError } = await supabase
    .from("provider_configs")
    .select("id")
    .eq("slug", "seedance-nz")
    .single();
  if (providerError || !provider) throw new Error(providerError?.message || "未找到 seedance-nz 渠道");

  const { data: existing, error: existingError } = await supabase
    .from("model_configs")
    .select("id,model_id,display_name,capabilities")
    .eq("provider_id", provider.id);
  if (existingError) throw new Error(existingError.message);
  const existingByModel = new Map((existing || []).map((model) => [model.model_id, model]));

  const syncedAt = new Date().toISOString();
  const rows = (payload.data as PricingModel[]).flatMap((model) => {
    const modelId = text(model.model_name);
    const tags = tagsOf(model);
    const kind = kindOf(tags);
    if (!modelId || !kind) return [];
    const description = text(model.description);
    const [category, categoryLabel] = categoryOf(kind, modelId, description, tags);
    const invocation = invocationProfile(kind, modelId, category);
    return [{
      provider_id: provider.id,
      model_id: modelId,
      display_name: existingByModel.get(modelId)?.display_name || modelId,
      kind,
      capabilities: {
        source: "seedance-pricing",
        source_url: PRICING_URL,
        tags,
        category,
        category_label: categoryLabel,
        description,
        vendor_id: model.vendor_id ?? null,
        owner: text(model.owner_by),
        endpoint_types: stringList(model.supported_endpoint_types),
        groups: stringList(model.enable_groups),
        upstream_created_time: model.created_time ?? null,
        pricing_version: text(model.pricing_version) || text(payload.pricing_version),
        synced_at: syncedAt,
        ...invocation,
      },
      pricing: {
        model_ratio: model.model_ratio ?? null,
        model_price: model.model_price ?? null,
        completion_ratio: model.completion_ratio ?? null,
        quota_type: model.quota_type ?? null,
      },
      updated_at: syncedAt,
    }];
  });
  if (!rows.length) throw new Error("Seedance 价格接口没有返回图片、视频或音频模型");

  for (let offset = 0; offset < rows.length; offset += 100) {
    const { error } = await supabase
      .from("model_configs")
      .upsert(rows.slice(offset, offset + 100), { onConflict: "provider_id,model_id" });
    if (error) throw new Error(error.message);
  }

  const received = new Set(rows.map((row) => row.model_id));
  const staleIds = (existing || [])
    .filter((row) => row.capabilities?.source === "seedance-pricing" && !received.has(row.model_id))
    .map((row) => row.id);
  if (staleIds.length) {
    const { error } = await supabase.from("model_configs").update({ enabled: false, updated_at: syncedAt }).in("id", staleIds);
    if (error) throw new Error(error.message);
  }

  const counts = rows.reduce<Record<string, number>>((result, row) => {
    result[row.kind] = (result[row.kind] || 0) + 1;
    return result;
  }, {});
  return { syncedAt, total: rows.length, counts, disabled: staleIds.length, pricingVersion: text(payload.pricing_version) };
}

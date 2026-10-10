export type ModelOption = { value: string; label: string };

export const IMAGE_MODELS: ModelOption[] = [
  { value: "zhenzhen-image-g-v2.5-lowprice", label: "Zhenzhen Image G v2.5 · 低价版" },
  { value: "seedream-v5-pro-t2i", label: "Seedream 5 Pro" },
];

// 视频模型基础 id，不含 -t2v/-i2v/-multi 后缀；落到节点时按是否有资产输入补后缀
export const VIDEO_MODELS: ModelOption[] = [
  { value: "seedance-2.5-standard", label: "Seedance 2.5 Standard" },
  { value: "seedance-2.0-standard", label: "Seedance 2.0 Standard" },
  { value: "seedance-2.0-fast", label: "Seedance 2.0 Fast" },
  { value: "seedance-2.0-mini", label: "Seedance 2.0 Mini" },
];

export const VIDEO_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

export const DEFAULT_IMAGE_MODEL = IMAGE_MODELS[0].value;
export const DEFAULT_VIDEO_MODEL = VIDEO_MODELS[0].value;
export const DEFAULT_VIDEO_RATIO = "16:9";

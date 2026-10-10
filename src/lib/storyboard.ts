export type StoryboardAsset = {
  name: string;
  category: string;
  prompt: string;
};

export type StoryboardShot = {
  name: string;
  prompt: string;
  seconds?: number;
  assets: string[];
};

export type StoryboardDraft = {
  assets: StoryboardAsset[];
  shots: StoryboardShot[];
};

export type StoryboardQuestion = {
  key: "style" | "ratio" | "imageModel" | "videoModel" | "extra";
  label: string;
  type: "chips" | "text";
  options?: { value: string; label: string }[];
  recommended?: string;
  allowCustom?: boolean;
};

export type StoryboardAnswers = Record<string, string>;

export type StoryboardSettings = {
  imageModel?: string;
  videoModel?: string;
  ratio?: string;
};

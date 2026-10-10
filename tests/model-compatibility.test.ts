import assert from "node:assert/strict";
import test from "node:test";
import { modelCompatibility } from "../src/lib/model-compatibility";
import { invocationProfile } from "../src/lib/seedance-catalog";

const model = (requirements: Record<string, number>, canvasSupported = true) => ({
  model_id: "test-model",
  kind: "video",
  capabilities: { canvas_supported: canvasSupported, requirements },
});

test("图生模型只有接入图片后才可用", () => {
  const imageToVideo = model({ min_images: 1, max_images: 2, max_videos: 0, max_audio: 0, min_total: 1 });
  assert.equal(modelCompatibility(imageToVideo, { image: 0, video: 0, audio: 0 }).compatible, false);
  assert.equal(modelCompatibility(imageToVideo, { image: 1, video: 0, audio: 0 }).compatible, true);
  assert.equal(modelCompatibility(imageToVideo, { image: 1, video: 1, audio: 0 }).compatible, false);
});

test("多模态模型接受图片、视频或音频，但要求至少一种素材", () => {
  const multimodal = model({ max_images: 30, max_videos: 10, max_audio: 10, min_total: 1 });
  assert.equal(modelCompatibility(multimodal, { image: 0, video: 0, audio: 0 }).compatible, false);
  assert.equal(modelCompatibility(multimodal, { image: 0, video: 0, audio: 1 }).compatible, true);
  assert.equal(modelCompatibility(multimodal, { image: 1, video: 1, audio: 1 }).compatible, true);
});

test("文生模型在有参考素材时被过滤", () => {
  const textOnly = model({ max_images: 0, max_videos: 0, max_audio: 0, min_total: 0 });
  assert.equal(modelCompatibility(textOnly, { image: 0, video: 0, audio: 0 }).compatible, true);
  assert.equal(modelCompatibility(textOnly, { image: 1, video: 0, audio: 0 }).compatible, false);
});

test("专用端点模型不会进入通用画布", () => {
  const dedicated = model({}, false);
  assert.equal(modelCompatibility(dedicated, { image: 0, video: 0, audio: 0 }).compatible, false);
});

test("文档模型被映射为正确的素材和参数约束", () => {
  const i2v = invocationProfile("video", "seedance-2.5-standard-i2v", "image_to_video");
  assert.equal(i2v.requirements.min_images, 1);
  assert.equal(i2v.requirements.max_videos, 0);
  assert.deepEqual(i2v.parameters.duration, { min: 4, max: 30, default: 5 });

  const multimodal = invocationProfile("video", "seedance-2.5-standard-multi", "multimodal_video");
  assert.equal(multimodal.requirements.min_total, 1);
  assert.equal(multimodal.requirements.max_audio, 10);

  const imageEdit = invocationProfile("image", "seedream-v5-pro-i2i", "image_edit");
  assert.equal(imageEdit.requirements.min_images, 1);
  assert.equal(imageEdit.requirements.max_images, 10);

  const clone = invocationProfile("audio", "minimax-voice-clone", "voice_clone");
  assert.equal(clone.requirements.min_audio, 1);
  assert.equal(clone.requirements.max_audio, 1);
  assert.equal(clone.parameters.voice_supported, true);
  assert.equal(clone.parameters.voice_required, true);

  const seedAudio = invocationProfile("audio", "doubao-seed-audio-1.0", "audio_other");
  assert.equal(seedAudio.parameters.voice_supported, true);
  assert.equal(seedAudio.parameters.voice_required, false);
});

test("图片编辑分类即使模型名没有 edit 后缀也必须有图片", () => {
  const edit = invocationProfile("image", "vendor-special-v1", "image_edit");
  assert.equal(edit.requirements.min_images, 1);
  assert.equal(edit.requirements.min_total, 1);
  assert.equal(modelCompatibility({ model_id: "vendor-special-v1", kind: "image", capabilities: edit }, { image: 0, video: 0, audio: 0 }).compatible, false);
});

test("Midjourney 只有 Imagine 进入模型下拉框，二次操作使用结果按钮", () => {
  const imagine = invocationProfile("image", "midjourney-imagine", "image_generation");
  const upscale = invocationProfile("image", "midjourney-upscale", "upscale");
  const variation = invocationProfile("image", "midjourney-variation", "image_generation");
  assert.equal(imagine.canvas_supported, true);
  assert.equal(imagine.endpoint, "/v1/midjourney/generations/imagine");
  assert.equal(upscale.canvas_supported, false);
  assert.equal(variation.canvas_supported, false);
  assert.match(upscale.unsupported_reason, /操作按钮/);
});

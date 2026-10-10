import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/backend/server";
import { canEditProject } from "@/lib/project-access";
import { queryGeneration } from "@/lib/generation";

const input = z.object({ projectId: z.uuid(), kind: z.enum(["image", "video", "audio"]), taskId: z.string().min(1).max(200).regex(/^[\w-]+$/), model: z.string().max(160).optional() });

export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const { projectId, kind, taskId, model } = parsed.data;
  if (!await canEditProject(projectId)) return NextResponse.json({ error: "无权编辑此项目" }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = await supabase!.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const key = process.env.SEEDANCE_API_KEY;
  if (!key) return NextResponse.json({ error: "生成服务密钥未配置" }, { status: 503 });
  try {
    const result = await queryGeneration("seedance-nz", kind, taskId, key, model);
    const task = Array.isArray(result.data) ? result.data[0] : result.data || result;
    const status = String(task?.status || "").toUpperCase();
    if (status !== "SUCCESS" && status !== "COMPLETED") return NextResponse.json({ error: "生成任务尚未完成" }, { status: 409 });
    const source = kind === "image"
      ? task?.grid_image_url || task?.image_urls?.[0] || task?.result_url || task?.data?.content?.image_url
      : kind === "audio"
        ? task?.result_url || task?.data?.content?.audio_url || task?.data?.content?.audio_urls?.[0]
        : task?.metadata?.url;
    if (typeof source !== "string") throw new Error("生成结果没有可用地址");
    const sourceUrl = new URL(source);
    if (sourceUrl.protocol !== "https:") throw new Error("生成结果地址无效");
    const path = `${projectId}/generation/${kind}-${taskId}`;
    const storage = supabase!.storage.from("project-assets");
    const existing = await supabase!.from("assets").select("id,storage_path").eq("storage_path", path).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      const signed = await storage.createSignedUrl(path, 7 * 86400);
      if (signed.error) throw signed.error;
      return NextResponse.json({ assetId: existing.data.id, path, url: signed.data.signedUrl });
    }
    const downloaded = await fetch(sourceUrl, { redirect: "follow", signal: AbortSignal.timeout(120000) });
    if (!downloaded.ok) throw new Error(`下载生成结果失败 (${downloaded.status})`);
    const responseMime = downloaded.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const mime = !responseMime || responseMime === "application/octet-stream"
      ? kind === "image" ? "image/jpeg" : kind === "audio" ? "audio/mpeg" : "video/mp4"
      : responseMime;
    const allowed = kind === "image" ? ["image/jpeg", "image/png", "image/webp"] : kind === "audio" ? ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4", "audio/aac", "audio/flac"] : ["video/mp4", "video/webm"];
    if (!allowed.includes(mime)) throw new Error("生成结果文件类型不受支持");
    const limit = kind === "image" ? 30_000_000 : kind === "audio" ? 100_000_000 : 524_288_000;
    const advertisedSize = Number(downloaded.headers.get("content-length") || 0);
    if (advertisedSize > limit) throw new Error("生成结果超过存储大小限制");
    const bytes = await downloaded.arrayBuffer();
    if (bytes.byteLength > limit) throw new Error("生成结果超过存储大小限制");
    const uploaded = await storage.upload(path, new Blob([bytes], { type: mime }), { contentType: mime });
    if (uploaded.error) throw uploaded.error;
    const saved = await supabase!.from("assets").insert({ project_id: projectId, owner_id: user.id, kind, storage_path: path, mime_type: mime, byte_size: bytes.byteLength, source: "generation" }).select("id").single();
    if (saved.error || !saved.data) {
      await storage.remove([path]);
      throw saved.error || new Error("保存素材记录失败");
    }
    const signed = await storage.createSignedUrl(path, 7 * 86400);
    if (signed.error) throw signed.error;
    return NextResponse.json({ assetId: saved.data.id, path, url: signed.data.signedUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存生成结果失败" }, { status: 502 });
  }
}

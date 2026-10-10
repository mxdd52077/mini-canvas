import { NextResponse } from "next/server";
import { createClient } from "@/lib/backend/server";
import { hydrateSceneImageUrls } from "@/lib/scene-storage";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params, supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Cloudflare 后端尚未配置" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { data: member } = await supabase
    .from("project_members").select("role").eq("project_id", id).eq("user_id", user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });

  const versionParam = new URL(request.url).searchParams.get("version");
  if (versionParam !== null) {
    const version = Number(versionParam);
    if (!Number.isInteger(version) || version < 1)
      return NextResponse.json({ error: "版本号无效" }, { status: 400 });
    const { data, error } = await supabase
      .from("canvas_snapshots").select("payload,project_version")
      .eq("project_id", id).eq("project_version", version).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "历史版本不存在" }, { status: 404 });
    const scene = (data.payload || { nodes: [], edges: [] }) as { nodes: Record<string, unknown>[]; edges: unknown[] };
    const nodes = await Promise.all(scene.nodes.map(async (node) => {
      const hydrated = { ...node };
      for (const [pathKey, urlKey] of [["srcPath", "src"], ["referencePath", "reference"]] as const) {
        const path = node[pathKey];
        if (typeof path === "string" && path.startsWith(`${id}/`)) {
          const signed = await supabase.storage.from("project-assets").createSignedUrl(path, 7 * 86400);
          if (!signed.error) hydrated[urlKey] = signed.data.signedUrl;
        }
      }
      return hydrateSceneImageUrls(hydrated,id,async path=>{
        const signed=await supabase.storage.from("project-assets").createSignedUrl(path,7*86400);
        return signed.error?undefined:signed.data.signedUrl;
      });
    }));
    return NextResponse.json({ version: data.project_version, scene: { nodes, edges: scene.edges } });
  }

  const { data, error } = await supabase
    .from("canvas_snapshots")
    .select("project_version,created_at,created_by,profiles!canvas_snapshots_created_by_fkey(display_name)")
    .eq("project_id", id)
    .order("project_version", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const history = (data || []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      version: row.project_version,
      createdAt: row.created_at,
      author: profile && typeof profile === "object" && "display_name" in profile ? String(profile.display_name) : "成员",
    };
  });
  return NextResponse.json({ history });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

const profileOf = (value: unknown) => {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object"
    ? (item as { email?: string; display_name?: string })
    : {};
};

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params, supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase 尚未配置" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { data: me } = await supabase
    .from("project_members").select("role").eq("project_id", id).eq("user_id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
  const { data: rows, error } = await supabase
    .from("project_members")
    .select("user_id,role,created_at,profiles!project_members_user_id_fkey(email,display_name)")
    .eq("project_id", id)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const members = (rows || []).map((row) => {
    const profile = profileOf(row.profiles);
    return {
      userId: row.user_id,
      role: row.role,
      name: profile.display_name || profile.email?.split("@")[0] || "成员",
      email: profile.email || "",
    };
  });
  const mine = members.find((member) => member.userId === user.id);
  return NextResponse.json({ members, me: { id: user.id, role: me.role, name: mine?.name || "我" } });
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params, supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase 尚未配置" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const parsed = z.object({
    userId: z.string().uuid().optional(),
    userIds: z.array(z.string().uuid()).max(50).optional(),
  }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const ids = [...new Set([...(parsed.data.userId ? [parsed.data.userId] : []), ...(parsed.data.userIds || [])])];
  if (!ids.length) return NextResponse.json({ error: "请选择要移除的成员" }, { status: 400 });
  const { data: me } = await supabase
    .from("project_members").select("role").eq("project_id", id).eq("user_id", user.id).maybeSingle();
  if (me?.role !== "owner") return NextResponse.json({ error: "只有项目所有者可以移除成员" }, { status: 403 });
  const { data: targets } = await supabase
    .from("project_members").select("user_id,role").eq("project_id", id).in("user_id", ids);
  if (!targets?.length) return NextResponse.json({ error: "成员不存在" }, { status: 404 });
  if (targets.some((target) => target.role === "owner"))
    return NextResponse.json({ error: "不能移除项目所有者" }, { status: 400 });
  const { error } = await supabase
    .from("project_members").delete().eq("project_id", id).in("user_id", targets.map((target) => target.user_id));
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, removed: targets.length });
}

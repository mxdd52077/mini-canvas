import type { User } from "@/lib/backend/types";
import { createClient } from "@/lib/backend/server";

export type AppUser = User & { role: "user" | "admin"; displayName: string };

/** 读取当前登录用户与 profiles.role；未登录或Cloudflare 后端尚未配置 返回 null。 */
export async function getAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,display_name")
    .eq("id", user.id)
    .single();
  return {
    ...user,
    role: profile?.role === "admin" ? "admin" : "user",
    displayName: profile?.display_name || user.email || "用户",
  };
}

export async function isAdmin(): Promise<boolean> {
  return (await getAppUser())?.role === "admin";
}

/** API 路由用：非管理员时返回可直接 return 的错误响应。 */
export async function requireAdmin(): Promise<
  { ok: true; user: AppUser } | { ok: false; status: 401 | 403 | 503; error: string }
> {
  const user = await getAppUser();
  if (!user) {
    const supabase = await createClient();
    if (!supabase) return { ok: false, status: 503, error: "Cloudflare 后端尚未配置" };
    return { ok: false, status: 401, error: "请先登录" };
  }
  if (user.role !== "admin") return { ok: false, status: 403, error: "需要管理员权限" };
  return { ok: true, user };
}

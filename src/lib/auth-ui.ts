"use client";
import { create } from "zustand";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";

type AuthUIState = {
  open: boolean;
  onSuccess?: () => void;
  openLogin: (opts?: { onSuccess?: () => void }) => void;
  closeLogin: () => void;
};

export const useAuthUI = create<AuthUIState>((set) => ({
  open: false,
  onSuccess: undefined,
  openLogin: (opts) => set({ open: true, onSuccess: opts?.onSuccess }),
  closeLogin: () => set({ open: false, onSuccess: undefined }),
}));

/** 演示模式视为已登录；否则检查会话，未登录时弹出登录框并返回 false。 */
export async function ensureLogin(onSuccess?: () => void): Promise<boolean> {
  if (!hasSupabaseConfig) return true;
  const client = createClient();
  if (!client) return true;
  const { data: { session } } = await client.auth.getSession();
  const user = session?.user;
  if (user) return true;
  useAuthUI.getState().openLogin({ onSuccess });
  return false;
}

/**
 * 带登录拦截的 fetch：401 或「未登录却被 canEditProject 判 403」时弹登录框。
 * 登录成功后可选自动重试（传入 retry）。
 */
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  retry?: () => void,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401 && res.status !== 403) return res;
  const client = createClient();
  const { data: { session } } = client ? await client.auth.getSession() : { data: { session: null } };
  const user = session?.user;
  if (!user || res.status === 401) {
    useAuthUI.getState().openLogin({ onSuccess: retry });
    throw new Error("请先登录");
  }
  throw new Error("无权执行此操作");
}

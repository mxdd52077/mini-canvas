"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/logo";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { safeReturnPath } from "@/lib/auth-redirect";
export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login"),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!hasSupabaseConfig) return;
    const client = createClient();
    if (!client) return;
    client.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) router.replace(safeReturnPath(new URLSearchParams(window.location.search).get("next")));
    });
  }, [router]);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      email = String(fd.get("email")),
      password = String(fd.get("password") || "");
    const next=safeReturnPath(new URLSearchParams(window.location.search).get("next"));
    if (!hasSupabaseConfig) {
      setNotice("演示模式：已登录，正在进入项目库…");
      setTimeout(() => router.push(next), 500);
      return;
    }
    setBusy(true);
    const supabase = createClient();
    if (mode === "forgot") {
      const { error } = await supabase!.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/reset`,
      });
      setNotice(error?.message || "重置邮件已发送");
    } else if (mode === "register") {
      const { data, error } = await supabase!.auth.signUp({
        email,
        password,
        options: { data: { display_name: String(fd.get("name")) } },
      });
      if (error) setNotice(error.message);
      else if (data.session) {
        // 自托管 GoTrue 开了 MAILER_AUTOCONFIRM，注册即登录，无需验证邮件
        setNotice("注册成功，正在进入…");
        window.location.replace(next);
        return;
      } else {
        setNotice("注册成功，请检查验证邮件");
      }
    } else {
      const { error } = await supabase!.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setNotice(error.message);
      else window.location.replace(next);
    }
    setBusy(false);
  };
  return (
    <main className="grid min-h-screen place-items-center bg-(--bg) p-6">
      <div className="w-full max-w-[420px] rounded-[24px] border border-(--line) bg-white p-8 shadow-[0_18px_60px_rgba(0,0,0,.07)]">
        <div className="mb-10 flex justify-center">
          <Logo />
        </div>
        <h1 className="text-center text-2xl font-semibold">
          {mode === "login"
            ? "欢迎回来"
            : mode === "register"
              ? "创建你的账户"
              : "找回密码"}
        </h1>
        <p className="mt-2 text-center text-sm text-(--muted)">
          {mode === "forgot"
            ? "我们会向你的邮箱发送重置链接"
            : "登录后继续你的创作"}
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "register" && (
            <input name="name" required placeholder="昵称" className="field" />
          )}
          <input
            name="email"
            required
            type="email"
            placeholder="邮箱"
            className="field"
          />
          {mode !== "forgot" && (
            <div className="relative">
              <input
                name="password"
                required
                minLength={8}
                type={show ? "text" : "password"}
                placeholder="密码（至少 8 位）"
                className="field pr-11"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-2 top-1.5 icon-btn"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )}
          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-(--btn) py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy
              ? "请稍候"
              : mode === "login"
                ? "登录"
                : mode === "register"
                  ? "注册"
                  : "发送重置邮件"}
            <ArrowRight size={16} />
          </button>
        </form>
        {notice && (
          <p className="mt-4 rounded-lg bg-(--accent-tint) p-3 text-sm text-(--accent-strong)">
            {notice}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-4 text-xs text-(--muted)">
          {mode !== "login" && (
            <button onClick={() => setMode("login")}>返回登录</button>
          )}
          {mode === "login" && (
            <>
              <button onClick={() => setMode("register")}>注册账户</button>
              <button onClick={() => setMode("forgot")}>忘记密码</button>
            </>
          )}
        </div>
        <p className="mt-8 text-center text-[11px] text-(--muted)">
          {hasSupabaseConfig
            ? "Supabase 安全认证"
            : "未配置 Supabase，当前为本地演示模式"}
        </p>
        <Link href="/" className="mt-3 block text-center text-xs text-(--muted)">
          先看看演示项目
        </Link>
      </div>
    </main>
  );
}

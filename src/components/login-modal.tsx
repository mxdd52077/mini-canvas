"use client";
import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { createClient, hasBackendConfig } from "@/lib/backend/client";
import { useAuthUI } from "@/lib/auth-ui";

export function LoginModal() {
  const { open, onSuccess, closeLogin } = useAuthUI();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  if (!open) return null;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!hasBackendConfig) {
      closeLogin();
      onSuccess?.();
      return;
    }
    const client = createClient();
    if (!client) return;
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password") || "");
    setBusy(true);
    setNotice("");
    if (mode === "register") {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { display_name: String(fd.get("name") || "") } },
      });
      if (error) setNotice(error.message);
      else if (data.session) {
        closeLogin();
        onSuccess?.();
      } else setNotice("注册成功，请检查验证邮件");
    } else {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) setNotice(error.message);
      else {
        closeLogin();
        onSuccess?.();
      }
    }
    setBusy(false);
  };

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-black/35 p-6"
      onClick={closeLogin}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="登录"
        className="w-full max-w-[400px] rounded-[24px] border border-(--line) bg-white p-8 shadow-[0_18px_60px_rgba(0,0,0,.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between">
          <Logo />
          <button type="button" className="icon-btn" onClick={closeLogin} title="关闭">
            <X size={16} />
          </button>
        </div>
        <h2 className="text-xl font-semibold">
          {mode === "login" ? "登录后继续" : "创建账户"}
        </h2>
        <p className="mt-1 text-sm text-(--muted)">
          此操作需要登录。登录后可保存项目、使用 AI 生成与协作。
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === "register" && (
            <input name="name" required placeholder="昵称" className="field" />
          )}
          <input name="email" required type="email" placeholder="邮箱" className="field" />
          <input
            name="password"
            required
            minLength={8}
            type="password"
            placeholder="密码（至少 8 位）"
            className="field"
          />
          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-(--btn) py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "请稍候" : mode === "login" ? "登录" : "注册"}
            <ArrowRight size={16} />
          </button>
        </form>
        {notice && (
          <p className="mt-3 rounded-lg bg-(--accent-tint) p-3 text-sm text-(--accent-strong)">
            {notice}
          </p>
        )}
        <div className="mt-4 flex justify-center gap-4 text-xs text-(--muted)">
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setNotice(""); }}>
            {mode === "login" ? "注册账户" : "返回登录"}
          </button>
        </div>
      </div>
    </div>
  );
}

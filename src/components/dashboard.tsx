"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ArrowUp, Folder, Home, MessageSquare, Plus, Search, Settings, Sparkles } from "lucide-react";
import { Logo } from "./logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ensureLogin, useAuthUI } from "@/lib/auth-ui";
import { createClient } from "@/lib/supabase/client";

type Project = { id: string; name: string; updated_at?: string };
type Me = { id: string; email?: string; displayName?: string; role?: string } | null;

export function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [q, setQ] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [me, setMe] = useState<Me>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userMenu, setUserMenu] = useState(false);
  const openLogin = useAuthUI((state) => state.openLogin);
  const isAdminUser = me?.role === "admin";

  useEffect(() => {
    if (!userMenu) return;
    const close = () => setUserMenu(false);
    addEventListener("pointerdown", close);
    return () => removeEventListener("pointerdown", close);
  }, [userMenu]);

  useEffect(() => {
    let active = true;
    const draft = sessionStorage.getItem("mini-canvas-draft");
    if (draft) {
      sessionStorage.removeItem("mini-canvas-draft");
      queueMicrotask(() => { if (active) setPrompt(draft); });
    }
    const client = createClient();
    const resolveIdentity = async (eventUser?: User | null) => {
      setAuthLoading(true);
      const browserUser = eventUser === undefined
        ? client ? (await client.auth.getSession()).data.session?.user ?? null : null
        : eventUser;
      if (!active) return;
      if (!browserUser) {
        setMe(null);
        setNeedLogin(true);
        setAuthLoading(false);
        return;
      }
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        const data = response.ok ? await response.json() : { user: null };
        if (!active) return;
        if (data.user) {
          setMe(data.user);
        } else {
          const profile = await client?.from("profiles").select("role,display_name").eq("id", browserUser.id).maybeSingle();
          if (!active) return;
          setMe({
            id: browserUser.id,
            email: browserUser.email,
            displayName: profile?.data?.display_name || browserUser.user_metadata?.display_name || browserUser.email,
            role: profile?.data?.role === "admin" ? "admin" : "user",
          });
        }
        setNeedLogin(false);
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    void resolveIdentity();
    const subscription = client?.auth.onAuthStateChange((_event, session) => { void resolveIdentity(session?.user ?? null); }).data.subscription;
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/projects")
      .then(async (response) => {
        if (response.status === 401) return { projects: [] };
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "项目加载失败");
        return data;
      })
      .then((data) => { if (active) setProjects(data.projects || []); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "项目加载失败"); });
    return () => { active = false; };
  }, []);

  const list = useMemo(() => projects.filter((project) => project.name.toLowerCase().includes(q.toLowerCase())), [projects, q]);

  const logout = async () => {
    setUserMenu(false);
    const client = createClient();
    await client?.auth.signOut();
    setMe(null);
    setNeedLogin(true);
  };

  const create = async (withPrompt = false) => {
    if (busy) return;
    if (!(await ensureLogin(() => void create(withPrompt)))) return;
    setBusy(true);
    setError("");
    setNeedLogin(false);
    try {
      const name = withPrompt && prompt.trim() ? prompt.trim().slice(0, 40) : "未命名项目";
      const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      if (response.status === 401) {
        if (withPrompt && prompt.trim()) sessionStorage.setItem("mini-canvas-draft", prompt.trim());
        openLogin({ onSuccess: () => void create(withPrompt) });
        return;
      }
      const data = await response.json();
      if (!response.ok || !data.id) throw new Error(data.error || "创建项目失败");
      if (withPrompt && prompt.trim()) sessionStorage.setItem(`mini-canvas-prompt:${data.id}`, prompt.trim());
      router.push(`/project/${data.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
      setBusy(false);
    }
  };

  return <main className="min-h-screen bg-(--bg)">
    <aside className="left-rail fixed inset-y-0 left-0 z-10 flex w-[76px] flex-col items-center border-r border-(--line) bg-white py-5">
      <Logo label={false}/>
      <nav className="mt-8 flex flex-col gap-3">
        <Link className="icon-btn active" href="/" title="主页"><Home size={19}/></Link>
        <button className="icon-btn" title="新建项目" onClick={() => create()}><Plus size={19}/></button>
        <a className="icon-btn" href="#projects" title="项目"><Folder size={19}/></a>
        <a className="icon-btn" href="#create" title="开始对话"><MessageSquare size={19}/></a>
      </nav>
      {isAdminUser&&<Link href="/admin" className="icon-btn mt-auto" title="模型管理"><Settings size={19}/></Link>}
      <div className={`relative mt-3 ${isAdminUser?"":"mt-auto"}`} onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" disabled={authLoading} title={me?(me.displayName||me.email||"账户"):"登录"} onClick={()=>{if(authLoading)return;if(!me){openLogin();return}setUserMenu((open)=>!open)}} className="grid h-9 w-9 place-items-center rounded-full bg-(--accent-tint) text-xs font-semibold text-(--accent-strong) disabled:opacity-60">
          {authLoading?"…":me?((me.displayName||me.email||"我").slice(0,1)):"登录"}
        </button>
        {me&&userMenu&&<div className="absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 rounded-xl border border-(--line) bg-white p-2 shadow-lg">
          <p className="truncate px-2 py-1 text-xs text-(--muted)">{me.displayName||me.email}</p>
          {isAdminUser&&<Link href="/admin" onClick={()=>setUserMenu(false)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-(--bg)"><Settings size={14}/>模型管理</Link>}
          <button type="button" onClick={logout} className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-(--bg)">退出登录</button>
        </div>}
      </div>
    </aside>
    <div className="ml-[76px] px-[7vw] py-8">
      <header className="flex items-center justify-between">
        <div><p className="text-sm text-(--muted)">创作空间</p><h1 className="mt-1 text-2xl font-semibold">让灵感自由生长</h1></div>
        <div className="flex items-center gap-3">
          {isAdminUser&&<Link href="/admin" className="subtle-btn flex items-center gap-2 text-sm"><Settings size={15}/>模型管理</Link>}
          <ThemeToggle/>
          <button onClick={()=>create()} disabled={busy} className="rounded-xl bg-(--btn) px-4 py-2.5 text-sm text-white">新建项目</button>
        </div>
      </header>
      <section id="create" className="mx-auto mt-20 max-w-[780px] text-center">
        <div className="mb-4 flex items-center justify-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-black text-white"><Sparkles size={19}/></span><h2 className="text-3xl font-semibold tracking-tight">今天想创造什么？</h2></div>
        <p className="text-(--muted)">输入需求后创建项目，并在画布助手中继续对话</p>
        <div className="mt-7 rounded-[22px] border border-(--line) bg-white p-4 text-left shadow-[0_10px_35px_rgba(0,0,0,.06)]">
          <textarea className="min-h-20 w-full resize-none outline-none" placeholder="设计一张简洁、高级的护肤品主视觉海报…" value={prompt} onChange={(event)=>setPrompt(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void create(true)}}}/>
          <div className="flex justify-end"><button aria-label="发送并创建项目" onClick={()=>void create(true)} disabled={busy||!prompt.trim()} className="grid h-9 w-9 place-items-center rounded-full bg-(--btn) text-white disabled:opacity-40"><ArrowUp size={17}/></button></div>
        </div>
        {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      </section>
      <section id="projects" className="mt-24">
        <div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-semibold">最近项目</h3><div className="relative"><Search className="absolute left-3 top-2.5 text-(--muted)" size={16}/><input value={q} onChange={(event)=>setQ(event.target.value)} placeholder="搜索项目" className="rounded-xl border border-(--line) bg-white py-2 pl-9 pr-3 text-sm outline-none"/></div></div>
        {needLogin&&<div className="mb-5 flex items-center justify-between rounded-2xl border border-(--line) bg-white px-5 py-4"><p className="text-sm text-(--muted)">登录后可保存并查看你的项目</p><button onClick={()=>openLogin()} className="rounded-xl bg-(--btn) px-4 py-2 text-sm text-white">登录</button></div>}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <button onClick={()=>void create()} className="project-card group flex aspect-[1.35] flex-col items-center justify-center rounded-2xl border border-dashed border-(--line) bg-white text-sm text-(--muted)"><Plus className="mb-3"/>新建项目</button>
          {list.map((project)=><Link href={`/project/${project.id}`} key={project.id} className="project-card group"><div className="relative aspect-[1.35] overflow-hidden rounded-2xl border border-(--line) bg-gradient-to-br from-[#eadccf] to-[#c3a589]"><div className="absolute inset-5 rounded-xl border border-white/45 bg-white/25 backdrop-blur-sm"/></div><div className="mt-3"><p className="font-medium">{project.name}</p><p className="mt-1 text-xs text-(--muted)">{project.updated_at?new Date(project.updated_at).toLocaleString("zh-CN"):"本地项目"}</p></div></Link>)}
        </div>
      </section>
    </div>
  </main>;
}

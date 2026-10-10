"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Coins,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Logo } from "@/components/logo";

type Provider = {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  adapter: string;
  enabled: boolean;
};
type Model = {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  kind: "image" | "video" | "audio" | "chat";
  capabilities: {
    tags?: string[];
    category?: string;
    category_label?: string;
    description?: string;
    synced_at?: string;
    canvas_supported?: boolean;
    unsupported_reason?: string;
    endpoint?: string;
    requirements?: {
      min_images?: number; max_images?: number;
      min_videos?: number; max_videos?: number;
      min_audio?: number; max_audio?: number;
      min_total?: number;
    };
  };
  pricing: Record<string, number>;
  enabled: boolean;
  updated_at?: string;
};

const KIND_LABEL: Record<string, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  chat: "对话",
};

function requirementText(model: Model) {
  const rules = model.capabilities?.requirements;
  if (!rules) return "参数规则待同步";
  const parts: string[] = [];
  for (const [label, min, max] of [
    ["图片", rules.min_images, rules.max_images],
    ["视频", rules.min_videos, rules.max_videos],
    ["音频", rules.min_audio, rules.max_audio],
  ] as const) {
    if (min) parts.push(`${label}≥${min}`);
    else if (max === 0) parts.push(`无${label}`);
    else if (max) parts.push(`${label}≤${max}`);
  }
  return parts.join(" · ") || "无需素材";
}

export default function AdminPage() {
  const [tab, setTab] = useState("models"),
    [providers, setProviders] = useState<Provider[]>([]),
    [models, setModels] = useState<Model[]>([]),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busyId, setBusyId] = useState(""),
    [syncing, setSyncing] = useState(false),
    [kindFilter, setKindFilter] = useState("all"),
    [search, setSearch] = useState("");

  const visibleModels = models.filter((model) => {
    if (kindFilter !== "all" && model.kind !== kindFilter) return false;
    const needle = search.trim().toLowerCase();
    return !needle || `${model.display_name} ${model.model_id} ${(model.capabilities?.tags || []).join(" ")} ${model.capabilities?.category_label || ""}`.toLowerCase().includes(needle);
  });
  const latestSync = models
    .map((model) => model.capabilities?.synced_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  const load = async () => {
    try {
      const response = await fetch("/api/admin/models");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "加载失败");
      setProviders(data.providers || []);
      setModels(data.models || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleModel = async (m: Model) => {
    setBusyId(m.id);
    try {
      const response = await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: m.id, enabled: !m.enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      setModels((list) =>
        list.map((x) => (x.id === m.id ? { ...x, enabled: !m.enabled } : x)),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusyId("");
    }
  };

  const syncModels = async () => {
    setSyncing(true);
    setError("");
    try {
      const response = await fetch("/api/models/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "同步失败");
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <main className="min-h-screen bg-(--bg)">
      <header className="flex h-16 items-center justify-between border-b border-(--line) bg-white px-7">
        <div className="flex items-center gap-4">
          <Link href="/" className="icon-btn">
            <ArrowLeft size={17} />
          </Link>
          <Logo />
          <span className="rounded-full bg-(--accent-tint) px-2 py-1 text-[10px] text-(--accent-strong)">
            管理员
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {error && <span className="text-red-600">{error}</span>}
          {saved && (
            <span className="text-(--accent-strong)">
              <Check size={14} className="mr-1 inline" />
              已保存
            </span>
          )}
        </div>
      </header>
      <div className="mx-auto flex max-w-[1180px] gap-8 px-7 py-8">
        <aside className="w-52 shrink-0 space-y-1">
          {[
            ["models", KeyRound, "模型与渠道"],
            ["users", Users, "用户管理"],
            ["credits", Coins, "积分流水"],
          ].map(([id, Icon, label]) => (
            <button
              key={id as string}
              onClick={() => setTab(id as string)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${tab === id ? "bg-white font-medium shadow-sm" : "text-(--muted)"}`}
            >
              <Icon size={17} />
              {label as string}
            </button>
          ))}
        </aside>
        <section className="min-w-0 flex-1">
          {tab === "models" && (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-semibold">模型与渠道</h1>
                  <p className="mt-1 text-sm text-(--muted)">
                    仅管理员可见并配置。启用/停用会立即对所有用户生效。
                  </p>
                </div>
                <button className="subtle-btn text-sm" disabled={syncing} onClick={() => void syncModels()}>
                  <RefreshCw size={15} className={`mr-1 inline ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "同步中" : "立即同步"}
                </button>
              </div>
              <div className="mt-7 rounded-2xl border border-(--line) bg-white p-5">
                <div className="mb-2 text-xs font-semibold text-(--muted)">渠道</div>
                <div className="space-y-3">
                  {providers.map((p) => (
                    <div
                      key={p.id}
                      className="grid grid-cols-[1.2fr_1.4fr_.7fr] items-center gap-3 text-sm"
                    >
                      <div>
                        <b>{p.name}</b>
                        <p className="mt-0.5 text-[11px] text-(--muted)">{p.adapter}</p>
                      </div>
                      <code className="truncate text-xs text-(--muted)">{p.base_url}</code>
                      <span className={p.enabled ? "text-(--accent-strong)" : "text-(--muted)"}>
                        {p.enabled ? "启用" : "停用"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[10px] text-(--muted)">
                  渠道密钥仅保存在服务端环境变量，浏览器不会读取明文。
                </p>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {[
                  ["all", "全部"],
                  ["image", "图片"],
                  ["video", "视频"],
                  ["audio", "音频"],
                  ["chat", "对话"],
                ].map(([value, label]) => (
                  <button key={value} onClick={() => setKindFilter(value)} className={`rounded-full px-3 py-1.5 text-xs ${kindFilter === value ? "bg-(--btn) text-white" : "border border-(--line) bg-white"}`}>
                    {label} · {value === "all" ? models.length : models.filter((model) => model.kind === value).length}
                  </button>
                ))}
                <label className="ml-auto flex min-w-56 items-center gap-2 rounded-xl border border-(--line) bg-white px-3 py-2">
                  <Search size={14} className="text-(--muted)" />
                  <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="搜索模型、分类或标签" value={search} onChange={(event) => setSearch(event.target.value)} />
                </label>
                {latestSync && <span className="w-full text-right text-[10px] text-(--muted)">最近同步 {new Date(latestSync).toLocaleString("zh-CN")}</span>}
              </div>
              <div className="mt-5 overflow-hidden rounded-2xl border border-(--line) bg-white">
                <div className="grid grid-cols-[1.35fr_1.25fr_.5fr_1.1fr_.7fr_.35fr] border-b border-(--accent-tint) px-5 py-3 text-xs text-(--muted)">
                  <span>模型</span>
                  <span>模型 ID / 渠道</span>
                  <span>类型</span>
                  <span>分类 / 标签</span>
                  <span>积分</span>
                  <span>启用</span>
                </div>
                {visibleModels.map((m) => (
                  <div
                    key={m.id}
                    className="grid grid-cols-[1.35fr_1.25fr_.5fr_1.1fr_.7fr_.35fr] items-center border-b border-(--line) px-5 py-4 text-sm last:border-0"
                  >
                    <div>
                      <b>{m.display_name}</b>
                      <p className="mt-1 text-[11px] text-(--muted)">
                        {m.kind === "video"
                          ? "视频生成"
                          : m.kind === "audio"
                            ? m.capabilities?.category_label || "音频模型"
                          : m.kind === "chat"
                            ? "对话"
                            : "图片生成"}
                      </p>
                    </div>
                    <div>
                      <code className="text-xs">{m.model_id}</code>
                      <p className="mt-1 text-[11px] text-(--muted)">
                        {providers.find((p) => p.id === m.provider_id)?.name || "—"}
                      </p>
                    </div>
                    <span>{KIND_LABEL[m.kind] || m.kind}</span>
                    <div className="min-w-0">
                      <b className="text-xs">{m.capabilities?.category_label || "—"}</b>
                      <p className="mt-1 truncate text-[10px] text-(--muted)" title={(m.capabilities?.tags || []).join(", ")}>
                        {(m.capabilities?.tags || []).join(" · ") || "无标签"}
                      </p>
                      <p className={`mt-1 text-[10px] ${m.capabilities?.canvas_supported===false?"text-amber-600":"text-(--accent-strong)"}`} title={m.capabilities?.unsupported_reason||m.capabilities?.endpoint}>
                        {m.capabilities?.canvas_supported===false?"仅目录展示":requirementText(m)}
                      </p>
                    </div>
                    <span>
                      {m.pricing && Object.keys(m.pricing).length
                        ? Object.entries(m.pricing)
                            .map(([k, v]) => `${k} ${v}`)
                            .join(" · ")
                        : "按量"}
                    </span>
                    <button
                      disabled={busyId === m.id}
                      onClick={() => void toggleModel(m)}
                      className={`h-6 w-11 rounded-full p-1 disabled:opacity-50 ${m.enabled ? "bg-(--accent)" : "bg-(--line)"}`}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full bg-white transition ${m.enabled ? "translate-x-5" : ""}`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "users" && (
            <>
              <h1 className="text-2xl font-semibold">用户管理</h1>
              <p className="mt-1 text-sm text-(--muted)">
                添加积分、禁用或启用账户
              </p>
              <div className="mt-7 overflow-hidden rounded-2xl border border-(--line) bg-white">
                <div className="grid grid-cols-[1.5fr_1fr_.6fr_.7fr] px-5 py-3 text-xs text-(--muted)">
                  <span>用户</span>
                  <span>角色</span>
                  <span>积分</span>
                  <span>状态</span>
                </div>
                {[
                  ["吴先生", "wu@example.com", "管理员", "1280"],
                  ["林晚", "lin@example.com", "用户", "360"],
                ].map((u, i) => (
                  <div
                    key={u[1]}
                    className="grid grid-cols-[1.5fr_1fr_.6fr_.7fr] items-center border-t border-(--accent-tint) px-5 py-4 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-(--accent-tint)">
                        {u[0][0]}
                      </span>
                      <div>
                        <b>{u[0]}</b>
                        <p className="text-xs text-(--muted)">{u[1]}</p>
                      </div>
                    </div>
                    <span>
                      {i === 0 ? (
                        <>
                          <ShieldCheck
                            size={14}
                            className="mr-1 inline text-(--accent)"
                          />
                          {u[2]}
                        </>
                      ) : (
                        u[2]
                      )}
                    </span>
                    <b>{u[3]}</b>
                    <button className="subtle-btn w-fit !py-1.5 text-xs">
                      {i === 0 ? "增加积分" : "禁用账户"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "credits" && (
            <>
              <h1 className="text-2xl font-semibold">积分流水</h1>
              <p className="mt-1 text-sm text-(--muted)">
                所有预扣、结算、退款与管理员调整记录
              </p>
              <div className="mt-7 rounded-2xl border border-(--line) bg-white p-12 text-center text-sm text-(--muted)">
                执行 Supabase SQL 后，积分流水会显示在这里。
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

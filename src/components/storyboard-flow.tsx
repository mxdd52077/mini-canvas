"use client";
import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw, Send, X } from "lucide-react";
import { useCanvas } from "@/store/canvas";
import { settingsFromAnswers, useAssistantUI } from "@/store/assistant";
import type { StoryboardDraft } from "@/lib/storyboard";
import { authFetch } from "@/lib/auth-ui";

const QUESTION_LABELS: Record<string, string> = {
  style: "画面风格",
  ratio: "视频比例",
  imageModel: "生图模型",
  videoModel: "生视频模型",
  extra: "其他要求",
};

function QuestionsCard({
  projectId,
  onNote,
}: {
  projectId: string;
  onNote?: (text: string) => void;
}) {
  const ui = useAssistantUI();
  const session = ui.storyboard;
  const [customStyle, setCustomStyle] = useState("");
  if (!session?.questions) return null;
  const answers = session.answers;
  const setAnswer = (key: string, value: string) =>
    ui.patchStoryboard({ answers: { ...answers, [key]: value } });
  const confirm = async () => {
    ui.patchStoryboard({ phase: "loading-draft", error: undefined });
    onNote?.(
      `已确认：${Object.entries(answers)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => `${QUESTION_LABELS[k] ?? k}=${v}`)
        .join("，") || "全部使用推荐设置"}，正在生成分镜草稿…`,
    );
    try {
      const response = await authFetch("/api/storyboard/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          prompt: session.script,
          answers: Object.fromEntries(
            Object.entries(answers).map(([k, v]) => [
              QUESTION_LABELS[k] ?? k,
              v,
            ]),
          ),
        }),
      }, () => void confirm());
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "草稿生成失败");
      ui.patchStoryboard({ phase: "draft", draft: result });
      onNote?.(
        `分镜草稿已生成：${result.assets?.length ?? 0} 个资产、${result.shots?.length ?? 0} 个分镜。可以直接编辑，或输入反馈重新生成，确认后点击「添加到画布」。`,
      );
    } catch (error) {
      ui.patchStoryboard({
        phase: "questions",
        error: error instanceof Error ? error.message : "草稿生成失败",
      });
    }
  };
  return (
    <div className="rounded-2xl border border-(--line) bg-white p-3 text-xs shadow-sm">
      <b className="text-sm">拆解前请确认以下设置</b>
      {session.summary && (
        <p className="mt-1 text-(--muted)">{session.summary}</p>
      )}
      {session.questions.map((q) => (
        <div key={q.key} className="mt-3">
          <p className="mb-1.5 font-medium">{q.label}</p>
          {q.type === "chips" && q.options && (
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((opt) => {
                const active = (answers[q.key] ?? q.recommended) === opt.value;
                return (
                  <button
                    key={opt.value}
                    className={`rounded-full border px-2.5 py-1 ${active ? "border-(--accent) bg-(--accent-tint) text-(--accent)" : "border-(--line) hover:bg-(--bg)"}`}
                    onClick={() => setAnswer(q.key, opt.value)}
                  >
                    {opt.label}
                    {opt.value === q.recommended && (
                      <span className="ml-1 text-[10px] text-(--muted)">
                        推荐
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {q.type === "chips" && q.allowCustom && (
            <input
              className="field mt-1.5 !py-1.5"
              placeholder="自定义风格…"
              value={customStyle}
              onChange={(e) => {
                setCustomStyle(e.target.value);
                if (e.target.value.trim()) setAnswer(q.key, e.target.value.trim());
              }}
            />
          )}
          {q.type === "text" && (
            <textarea
              className="field min-h-12 w-full resize-y !py-1.5"
              placeholder="例如：节奏要快、多特写镜头…"
              value={answers[q.key] ?? ""}
              onChange={(e) => setAnswer(q.key, e.target.value)}
            />
          )}
        </div>
      ))}
      {session.error && (
        <p role="status" className="mt-2 text-[#b44]">
          {session.error}
        </p>
      )}
      <button
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-(--btn) py-2 text-white disabled:opacity-50"
        onClick={confirm}
      >
        <Send size={13} />
        生成分镜草稿
      </button>
    </div>
  );
}

function DraftCard({
  projectId,
  onNote,
}: {
  projectId: string;
  onNote?: (text: string) => void;
}) {
  const ui = useAssistantUI();
  const s = useCanvas();
  const session = ui.storyboard;
  const [feedback, setFeedback] = useState("");
  if (!session?.draft) return null;
  const draft = session.draft;
  const patchDraft = (patch: Partial<StoryboardDraft>) =>
    ui.patchStoryboard({ draft: { ...draft, ...patch } });
  const patchAsset = (i: number, patch: Partial<StoryboardDraft["assets"][number]>) =>
    patchDraft({
      assets: draft.assets.map((a, j) => (j === i ? { ...a, ...patch } : a)),
    });
  const patchShot = (i: number, patch: Partial<StoryboardDraft["shots"][number]>) =>
    patchDraft({
      shots: draft.shots.map((sh, j) => (j === i ? { ...sh, ...patch } : sh)),
    });
  const regenerate = async () => {
    if (!feedback.trim()) return;
    ui.patchStoryboard({ phase: "loading-draft", error: undefined });
    setFeedback("");
    try {
      const response = await authFetch("/api/storyboard/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          prompt: session.script,
          answers: Object.fromEntries(
            Object.entries(session.answers).map(([k, v]) => [
              QUESTION_LABELS[k] ?? k,
              v,
            ]),
          ),
          feedback: feedback.trim(),
          previousDraft: draft,
        }),
      }, () => void regenerate());
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "重新生成失败");
      ui.patchStoryboard({ phase: "draft", draft: result });
      onNote?.("已按反馈重新生成分镜草稿。");
    } catch (error) {
      ui.patchStoryboard({
        phase: "draft",
        error: error instanceof Error ? error.message : "重新生成失败",
      });
    }
  };
  const apply = () => {
    s.addStoryboard(
      draft.assets,
      draft.shots,
      session.origin,
      settingsFromAnswers(session.answers),
    );
    ui.patchStoryboard({ phase: "applied" });
    onNote?.(
      `已把 ${draft.assets.length} 个资产和 ${draft.shots.length} 个分镜添加到画布，模型与比例已按你的选择设置好。`,
    );
  };
  return (
    <div className="rounded-2xl border border-(--line) bg-white p-3 text-xs shadow-sm">
      <b className="text-sm">分镜草稿（可编辑）</b>
      <p className="mt-1 text-(--muted)">资产 {draft.assets.length} · 分镜 {draft.shots.length}</p>
      {draft.assets.length > 0 && (
        <div className="mt-2 space-y-2">
          <p className="font-medium text-(--muted)">视觉资产</p>
          {draft.assets.map((asset, i) => (
            <div key={i} className="rounded-lg bg-(--bg) p-2">
              <div className="flex items-center gap-1.5">
                <input
                  aria-label="资产名称"
                  className="field min-w-0 flex-1 !py-1"
                  value={asset.name}
                  onChange={(e) => patchAsset(i, { name: e.target.value })}
                />
                {asset.category === "character" && (
                  <span className="shrink-0 rounded-full bg-(--accent-tint) px-2 py-0.5 text-[10px] text-(--accent)">
                    人物
                  </span>
                )}
                <button
                  title="删除资产"
                  className="shrink-0 text-(--muted) hover:text-[#b44]"
                  onClick={() =>
                    patchDraft({
                      assets: draft.assets.filter((_, j) => j !== i),
                      shots: draft.shots.map((sh) => ({
                        ...sh,
                        assets: sh.assets.filter((n) => n !== asset.name),
                      })),
                    })
                  }
                >
                  <X size={13} />
                </button>
              </div>
              <textarea
                aria-label="资产提示词"
                className="field mt-1.5 min-h-12 w-full resize-y !py-1"
                value={asset.prompt}
                onChange={(e) => patchAsset(i, { prompt: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 space-y-2">
        <p className="font-medium text-(--muted)">分镜</p>
        {draft.shots.map((shot, i) => (
          <div key={i} className="rounded-lg bg-(--bg) p-2">
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-(--muted)">{i + 1}.</span>
              <input
                aria-label="分镜名称"
                className="field min-w-0 flex-1 !py-1"
                value={shot.name}
                onChange={(e) => patchShot(i, { name: e.target.value })}
              />
              <label className="flex shrink-0 items-center gap-1 text-(--muted)">
                <input
                  aria-label="分镜时长"
                  type="number"
                  min={4}
                  max={30}
                  className="field !w-14 !px-1.5 !py-1"
                  value={shot.seconds ?? 5}
                  onChange={(e) =>
                    patchShot(i, {
                      seconds: Math.max(
                        4,
                        Math.min(30, Number(e.target.value) || 5),
                      ),
                    })
                  }
                />
                秒
              </label>
              <button
                title="删除分镜"
                className="shrink-0 text-(--muted) hover:text-[#b44]"
                onClick={() =>
                  patchDraft({ shots: draft.shots.filter((_, j) => j !== i) })
                }
              >
                <X size={13} />
              </button>
            </div>
            <textarea
              aria-label="分镜提示词"
              className="field mt-1.5 min-h-12 w-full resize-y !py-1"
              value={shot.prompt}
              onChange={(e) => patchShot(i, { prompt: e.target.value })}
            />
            {shot.assets.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {shot.assets.map((name) => (
                  <span
                    key={name}
                    className="flex items-center gap-0.5 rounded-full bg-(--accent-tint) px-2 py-0.5 text-[10px] text-(--accent)"
                  >
                    {name}
                    <button
                      title="移除引用"
                      onClick={() =>
                        patchShot(i, {
                          assets: shot.assets.filter((n) => n !== name),
                        })
                      }
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {session.error && (
        <p role="status" className="mt-2 text-[#b44]">
          {session.error}
        </p>
      )}
      <div className="mt-3 flex gap-1.5">
        <input
          aria-label="修改反馈"
          className="field min-w-0 flex-1 !py-1.5"
          placeholder="输入修改意见，如：第二个分镜改成近景"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void regenerate();
          }}
        />
        <button
          className="flex shrink-0 items-center gap-1 rounded-lg border border-(--line) px-2.5 disabled:opacity-50"
          disabled={!feedback.trim()}
          onClick={() => void regenerate()}
        >
          <RefreshCw size={12} />
          重新生成
        </button>
      </div>
      <button
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-(--btn) py-2 text-white"
        onClick={apply}
      >
        <Check size={13} />
        添加到画布
      </button>
    </div>
  );
}

export function StoryboardFlow({
  projectId,
  onNote,
}: {
  projectId: string;
  onNote?: (text: string) => void;
}) {
  const ui = useAssistantUI();
  const session = ui.storyboard;
  const fetching = useRef<string | null>(null);
  useEffect(() => {
    if (!session || session.phase !== "loading-questions") return;
    const key = `${session.seq}:${session.nodeId}:${session.script.length}`;
    if (fetching.current === key) return;
    fetching.current = key;
    void (async () => {
      try {
        const response = await authFetch("/api/storyboard/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId, prompt: session.script }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "分析失败");
        useAssistantUI.getState().patchStoryboard({
          phase: "questions",
          summary: result.summary,
          questions: result.questions,
        });
      } catch (error) {
        useAssistantUI.getState().patchStoryboard({
          phase: "failed",
          error: error instanceof Error ? error.message : "分析失败",
        });
      }
    })();
  }, [session, projectId]);
  if (!session) return null;
  if (session.phase === "loading-questions" || session.phase === "loading-draft")
    return (
      <div className="w-fit rounded-2xl bg-(--bg) px-4 py-3 text-xs text-(--muted)">
        {session.phase === "loading-questions"
          ? "正在分析脚本，准备问题…"
          : "正在生成分镜草稿…"}
      </div>
    );
  if (session.phase === "failed")
    return (
      <div className="rounded-2xl border border-(--line) bg-white p-3 text-xs">
        <p className="text-[#b44]">{session.error || "拆解失败"}</p>
        <button
          className="mt-2 rounded-lg border border-(--line) px-3 py-1.5"
          onClick={() => {
            fetching.current = null;
            ui.patchStoryboard({ phase: "loading-questions", error: undefined });
          }}
        >
          重试
        </button>
      </div>
    );
  if (session.phase === "questions")
    return <QuestionsCard projectId={projectId} onNote={onNote} />;
  if (session.phase === "draft")
    return <DraftCard projectId={projectId} onNote={onNote} />;
  return (
    <div className="rounded-2xl border border-(--line) bg-white p-3 text-xs text-(--muted)">
      分镜已添加到画布。如需调整可直接在节点上修改，或
      <button
        className="ml-1 text-(--accent) underline"
        onClick={ui.clearStoryboard}
      >
        关闭此流程
      </button>
      。
    </div>
  );
}

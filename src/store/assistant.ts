"use client";
import { create } from "zustand";
import type {
  StoryboardAnswers,
  StoryboardDraft,
  StoryboardQuestion,
  StoryboardSettings,
} from "@/lib/storyboard";

export type StoryboardPhase =
  | "loading-questions"
  | "questions"
  | "loading-draft"
  | "draft"
  | "applied"
  | "failed";

export type StoryboardSession = {
  phase: StoryboardPhase;
  seq: number;
  nodeId: string;
  script: string;
  origin: { x: number; y: number; width: number; height: number };
  summary?: string;
  questions?: StoryboardQuestion[];
  answers: StoryboardAnswers;
  draft?: StoryboardDraft;
  error?: string;
};

type AssistantUI = {
  open: boolean;
  storyboard: StoryboardSession | null;
  setOpen: (open: boolean) => void;
  startStoryboard: (session: Omit<StoryboardSession, "phase" | "answers" | "seq">) => void;
  patchStoryboard: (patch: Partial<StoryboardSession>) => void;
  clearStoryboard: () => void;
};

export const settingsFromAnswers = (
  answers: StoryboardAnswers,
): StoryboardSettings => ({
  imageModel: answers.imageModel || undefined,
  videoModel: answers.videoModel || undefined,
  ratio: answers.ratio || undefined,
});

export const useAssistantUI = create<AssistantUI>()((set) => ({
  open: true,
  storyboard: null,
  setOpen: (open) => set({ open }),
  startStoryboard: (session) =>
    set((s) => ({
      open: true,
      storyboard: {
        ...session,
        phase: "loading-questions",
        answers: {},
        seq: (s.storyboard?.seq ?? 0) + 1,
      },
    })),
  patchStoryboard: (patch) =>
    set((s) =>
      s.storyboard ? { storyboard: { ...s.storyboard, ...patch } } : {},
    ),
  clearStoryboard: () => set({ storyboard: null }),
}));

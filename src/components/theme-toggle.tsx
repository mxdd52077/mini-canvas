"use client";

import { useSyncExternalStore } from "react";
import { Palette } from "lucide-react";

type Theme = "pink" | "classic";
const KEY = "mc-theme";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function getSnapshot(): Theme {
  return localStorage.getItem(KEY) === "classic" ? "classic" : "pink";
}

const getServerSnapshot = (): Theme => "pink";

export function ThemeToggle({ className = "icon-btn" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next: Theme = theme === "pink" ? "classic" : "pink";
    localStorage.setItem(KEY, next);
    document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "pink" ? "切换到经典主题" : "切换到粉色主题"}
      aria-label="切换主题"
      className={className}
    >
      <Palette size={16} />
    </button>
  );
}

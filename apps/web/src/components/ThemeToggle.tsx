"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "./icons";

type Theme = "light" | "dark";

function resolveTheme(attr: Theme | undefined): Theme {
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Reads the resolved theme (set pre-paint by the layout script) and toggles/persists it. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const attr = document.documentElement.dataset.theme as Theme | undefined;
    setTheme(resolveTheme(attr));
  }, []);

  function toggle() {
    const current = theme ?? resolveTheme(document.documentElement.dataset.theme as Theme | undefined);
    const next: Theme = current === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage unavailable — session-only theme */
    }
  }

  const resolved = theme ?? null;
  const isDark = resolved === "dark";
  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon"
      onClick={toggle}
      aria-label={isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      aria-pressed={resolved === null ? undefined : isDark}
      title={isDark ? "โหมดสว่าง" : "โหมดมืด"}
    >
      {/* Render nothing until mounted to avoid a hydration/icon mismatch. */}
      {resolved === null ? <span className="theme-toggle__placeholder" aria-hidden /> : isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

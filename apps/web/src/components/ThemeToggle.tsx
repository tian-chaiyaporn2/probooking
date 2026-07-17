"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "./icons";

type Theme = "light" | "dark";

/** Reads the resolved theme (set pre-paint by the layout script) and toggles/persists it. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const attr = document.documentElement.dataset.theme as Theme | undefined;
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(attr ?? system);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage unavailable — session-only theme */
    }
  }

  const isDark = theme === "dark";
  return (
    <button
      className="btn btn--ghost btn--icon"
      onClick={toggle}
      aria-label={isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      aria-pressed={isDark}
      title={isDark ? "โหมดสว่าง" : "โหมดมืด"}
    >
      {/* Render nothing until mounted to avoid a hydration/icon mismatch. */}
      {theme === null ? <span style={{ width: "1.05em" }} /> : isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "./icons";
import { th } from "../lib/strings";

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
      aria-label={isDark ? th.a11y.switchToLight : th.a11y.switchToDark}
      aria-pressed={isDark}
      title={isDark ? th.a11y.lightMode : th.a11y.darkMode}
    >
      {/* Render nothing until mounted to avoid a hydration/icon mismatch. */}
      {theme === null ? <span className="theme-toggle__slot" aria-hidden /> : isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

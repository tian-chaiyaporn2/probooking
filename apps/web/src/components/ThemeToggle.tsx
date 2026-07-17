"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "./icons";
import { th } from "../lib/strings";

type Theme = "light" | "dark";

function readStoredTheme(): Theme | null {
  try {
    const t = localStorage.getItem("theme");
    return t === "dark" || t === "light" ? t : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** Reads the resolved theme (set pre-paint by the layout script) and toggles/persists it. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = readStoredTheme();
    const initial = stored ?? systemTheme();
    applyTheme(initial);
    setTheme(initial);

    // Follow OS changes only while the user has not pinned a preference.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (readStoredTheme()) return;
      const next = mq.matches ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onSystem);
      return () => mq.removeEventListener("change", onSystem);
    }
    mq.addListener(onSystem);
    return () => mq.removeListener(onSystem);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage unavailable — session-only theme */
    }
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
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

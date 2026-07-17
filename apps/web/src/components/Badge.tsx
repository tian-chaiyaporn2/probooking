import type { ReactNode } from "react";
import { badgeToneForKind, resolveBadgeTone, type BadgeTone } from "../lib/tones";

const TONE_CLASS: Record<string, string> = {
  muted: "badge--muted",
  info: "badge--info",
  accent: "badge--accent",
  warning: "badge--warning",
  success: "badge--success",
  danger: "badge--danger",
};

function toneFromVariant(variant?: string): BadgeTone {
  if (!variant) return "muted";
  if (
    variant === "success" ||
    variant === "info" ||
    variant === "accent" ||
    variant === "muted" ||
    variant === "warn" ||
    variant === "warning" ||
    variant === "danger" ||
    variant === "neutral"
  ) {
    return variant;
  }
  return badgeToneForKind(variant);
}

/** Semantic pill. Prefer `tone`; `variant` keeps domain aliases for existing call sites. */
export function Badge({
  children,
  tone,
  variant,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  /** Domain aliases (clinic / professional / credential_hold) or legacy tone names. */
  variant?: string;
}): ReactNode {
  const resolved = resolveBadgeTone(tone ?? toneFromVariant(variant));
  return <span className={`badge ${TONE_CLASS[resolved] ?? TONE_CLASS.muted}`}>{children}</span>;
}

export type { BadgeTone };

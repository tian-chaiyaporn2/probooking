import type { ReactNode } from "react";
import { resolveBadgeTone, type BadgeTone, type ResolvedBadgeTone } from "../lib/tones";

const TONE_CLASS: Record<ResolvedBadgeTone, string> = {
  muted: "badge--muted",
  info: "badge--info",
  accent: "badge--accent",
  warning: "badge--warning",
  success: "badge--success",
  danger: "badge--danger",
};

/** Semantic pill. Pages map domain kinds via `badgeToneForKind` from `lib/tones`. */
export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: BadgeTone }): ReactNode {
  const resolved = resolveBadgeTone(tone);
  return <span className={`badge ${TONE_CLASS[resolved]}`}>{children}</span>;
}

export type { BadgeTone };

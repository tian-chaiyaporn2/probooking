import type { ReactNode } from "react";

/** Visual tones only — pages map domain kinds onto these. */
export type BadgeTone = "muted" | "info" | "accent" | "warn" | "success";

const TONE_CLASS: Record<BadgeTone, string> = {
  muted: "badge--muted",
  info: "badge--info",
  accent: "badge--accent",
  warn: "badge--warn",
  success: "badge--success",
};

/**
 * Semantic pill. Prefer `tone` for visual styling.
 * `variant` remains as a domain alias (clinic / professional / credential_hold) for call sites.
 */
export function Badge({
  children,
  tone,
  variant,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  /** @deprecated Prefer `tone`. Domain aliases kept for existing call sites. */
  variant?: "clinic" | "professional" | "credential_hold" | BadgeTone | string;
}): ReactNode {
  const resolved: BadgeTone =
    tone ??
    (variant === "clinic"
      ? "info"
      : variant === "professional"
        ? "accent"
        : variant === "credential_hold" || variant === "warn"
          ? "warn"
          : variant === "success" || variant === "info" || variant === "accent" || variant === "muted"
            ? variant
            : "muted");
  return <span className={`badge ${TONE_CLASS[resolved]}`}>{children}</span>;
}

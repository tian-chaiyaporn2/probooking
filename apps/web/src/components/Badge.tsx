import type { ReactNode } from "react";
import { th } from "../lib/strings";

const THAI: Record<string, string> = {
  clinic: th.badge.clinic,
  professional: th.badge.professional,
  credential_hold: th.badge.credential_hold,
};

/** Semantic pill. `variant` maps a domain kind to a restrained color. */
export function Badge({ children, variant = "muted" }: { children?: ReactNode; variant?: string }): ReactNode {
  const cls =
    variant === "clinic"
      ? "badge--info"
      : variant === "professional"
        ? "badge--accent"
        : variant === "credential_hold"
          ? "badge--warn"
          : variant === "success"
            ? "badge--success"
            : "badge--muted";
  const label = children ?? THAI[variant] ?? variant;
  return <span className={`badge ${cls}`}>{label}</span>;
}

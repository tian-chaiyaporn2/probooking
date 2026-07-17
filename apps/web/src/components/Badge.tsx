import type { ReactNode } from "react";

/** Semantic pill. `variant` maps a domain kind to a restrained color. */
export function Badge({ children, variant = "muted" }: { children: ReactNode; variant?: string }): ReactNode {
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
  return <span className={`badge ${cls}`}>{children}</span>;
}

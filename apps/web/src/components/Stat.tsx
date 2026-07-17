import type { ReactNode } from "react";

/** A labelled figure card used on the ops/finance dashboards. */
export function Stat({
  label,
  value,
  testid,
  tone,
}: {
  label: string;
  value: string;
  testid?: string;
  tone?: "default" | "success" | "danger";
}): ReactNode {
  const color = tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--ink)";
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value" data-testid={testid} style={{ color }}>
        {value}
      </div>
    </div>
  );
}

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
  const toneClass =
    tone === "success" ? "stat__value--success" : tone === "danger" ? "stat__value--danger" : "";
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className={`stat__value${toneClass ? ` ${toneClass}` : ""}`} data-testid={testid}>
        {value}
      </div>
    </div>
  );
}

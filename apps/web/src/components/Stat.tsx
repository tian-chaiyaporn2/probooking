import type { ReactNode } from "react";

/** A labelled figure card used on the ops/finance dashboards. */
export function Stat({
  label,
  value,
  hint,
  icon,
  testid,
  tone = "default",
}: {
  label: string;
  value: string;
  /** Small secondary line under the figure, e.g. "433 เปิดรับ". */
  hint?: string;
  icon?: ReactNode;
  testid?: string;
  tone?: "default" | "success" | "danger";
}): ReactNode {
  const toneClass =
    tone === "success" ? " stat--success" : tone === "danger" ? " stat--danger" : "";
  return (
    <div className={`stat${toneClass}`}>
      <div className="stat__top">
        <span className="stat__label">{label}</span>
        {icon && <span className="stat__icon">{icon}</span>}
      </div>
      <div className="stat__value" data-testid={testid}>
        {value}
      </div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

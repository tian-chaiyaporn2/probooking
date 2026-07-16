import type { CSSProperties, ReactNode } from "react";

/** Shared button style (dedup: was copied byte-for-byte across dashboards). */
export const btn = (color: string): CSSProperties => ({
  padding: "0.2rem 0.7rem",
  borderRadius: 6,
  border: `1px solid ${color}`,
  background: color,
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.85rem",
});

export const tag = (color: string): CSSProperties => ({
  background: color,
  color: "#fff",
  borderRadius: 4,
  padding: "0.05rem 0.4rem",
  fontSize: "0.8rem",
});

/** A labelled figure used on the ops/finance dashboards. */
export function Stat({
  label,
  value,
  testid,
  color,
}: {
  label: string;
  value: string;
  testid?: string;
  color?: string;
}): ReactNode {
  return (
    <div>
      <div style={{ fontSize: "0.72rem", color: "#888" }}>{label}</div>
      <div data-testid={testid} style={{ fontWeight: 600, color: color ?? "#222" }}>
        {value}
      </div>
    </div>
  );
}

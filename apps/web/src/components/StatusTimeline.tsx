import type { ReactNode } from "react";

export interface TimelineStep {
  id: string;
  label: string;
  detail?: string;
  /** pending = upcoming, current = in progress, done = completed */
  status: "pending" | "current" | "done";
}

/** Vertical status timeline for booking / offer lifecycle. */
export function StatusTimeline({
  steps,
  caption,
}: {
  steps: TimelineStep[];
  caption: string;
}) {
  return (
    <ol className="timeline" aria-label={caption}>
      {steps.map((s) => (
        <li
          key={s.id}
          className={`timeline__item timeline__item--${s.status}`}
          data-status={s.status}
          aria-current={s.status === "current" ? "step" : undefined}
        >
          <span className="timeline__dot" aria-hidden />
          <span className="timeline__content">
            <span className="timeline__label">{s.label}</span>
            {s.detail ? <span className="timeline__detail muted">{s.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function timelineStatus(
  index: number,
  currentIndex: number,
): TimelineStep["status"] {
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "current";
  return "pending";
}

/** Helper when a step needs a custom node in the detail slot. */
export function TimelineNote({ children }: { children: ReactNode }) {
  return <span className="timeline__detail muted">{children}</span>;
}

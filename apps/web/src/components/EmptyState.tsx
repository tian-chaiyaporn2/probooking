import type { ReactNode } from "react";
import { InboxIcon } from "./icons";

/** Centered empty-state message for lists and tables. */
export function EmptyState({
  title,
  icon,
  as = "div",
}: {
  title: ReactNode;
  icon?: ReactNode;
  as?: "div" | "li";
}) {
  const Tag = as;
  return (
    <Tag className="empty">
      <span className="empty__icon" aria-hidden>
        {icon ?? <InboxIcon />}
      </span>
      <span className="empty__title">{title}</span>
    </Tag>
  );
}

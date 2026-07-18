import type { ReactNode } from "react";
import { InboxIcon } from "./icons";

/** Centered empty-state message for lists and tables. */
export function EmptyState({
  title,
  description,
  icon,
  as = "div",
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  as?: "div" | "li";
  action?: ReactNode;
}) {
  const Tag = as;
  return (
    <Tag className="empty">
      <span className="empty__icon" aria-hidden>
        {icon ?? <InboxIcon />}
      </span>
      <span className="empty__title">{title}</span>
      {description ? <span className="empty__desc muted">{description}</span> : null}
      {action ? <span className="empty__action">{action}</span> : null}
    </Tag>
  );
}

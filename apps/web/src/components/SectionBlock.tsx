import type { ReactNode } from "react";

/** Named content block used on ops/finance dashboards. */
export function SectionBlock({
  title,
  count,
  children,
  id,
  "aria-labelledby": ariaLabelledby,
}: {
  title?: ReactNode;
  count?: ReactNode;
  children: ReactNode;
  id?: string;
  "aria-labelledby"?: string;
}) {
  const headingId = id && title != null ? `${id}-heading` : undefined;
  const labelledBy = ariaLabelledby ?? headingId;
  return (
    <section className="section-block" id={id} aria-labelledby={labelledBy}>
      {title != null && (
        <div className="section-block__head">
          <h2 id={headingId}>{title}</h2>
          {count != null && <span className="section-block__count">{count}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

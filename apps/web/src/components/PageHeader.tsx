import type { ReactNode } from "react";

/** Dashboard / tool page title row with optional actions. */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow}
        <h1>{title}</h1>
        {subtitle ? <p className="page-head__sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

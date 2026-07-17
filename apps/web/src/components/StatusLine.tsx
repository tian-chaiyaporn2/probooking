import type { ReactNode } from "react";

/** Success / confirmation line — ACC-01: text + color, not color alone. */
export function StatusLine({
  children,
  testid,
  status,
}: {
  children: ReactNode;
  testid?: string;
  status?: string;
}): ReactNode {
  return (
    <div className="status-line status-line--success" data-testid={testid} data-status={status}>
      {children}
    </div>
  );
}

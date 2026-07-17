import type { ReactNode } from "react";

export interface KeyValueRow {
  label: ReactNode;
  value: ReactNode;
  total?: boolean;
  valueTestId?: string;
}

/** Compact key/value summary table (flow checkout, receipts). */
export function KeyValueTable({
  caption,
  rows,
  className = "checkout",
}: {
  caption: string;
  rows: KeyValueRow[];
  className?: string;
}) {
  return (
    <table className={className}>
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={row.total ? "checkout__total" : undefined}>
            <th scope="row">{row.label}</th>
            <td data-testid={row.valueTestId}>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

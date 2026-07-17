import type { ReactNode } from "react";
import { InboxIcon } from "./icons";
import { th } from "../lib/strings";

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  loadingRows?: number;
  empty?: ReactNode;
  bodyTestid?: string;
}

/** Generic data table: right-alignable numeric columns, loading skeleton, empty state. */
export function DataTable<T>({ columns, rows, rowKey, loading, loadingRows = 6, empty, bodyTestid }: Props<T>) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === "right" ? "num" : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody data-testid={bodyTestid}>
          {loading ? (
            Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key}>
                    <span className="skeleton" style={{ display: "block", height: "0.9rem", borderRadius: 4 }} />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <div className="empty">
                  <span className="empty__icon" aria-hidden>
                    <InboxIcon />
                  </span>
                  <span className="empty__title">{empty ?? th.common.emptyTable}</span>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "num" : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

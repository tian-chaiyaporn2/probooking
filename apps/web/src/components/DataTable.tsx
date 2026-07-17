import type { ReactNode } from "react";
import { InboxIcon } from "./icons";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
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
  /** Accessible name — required when the table should be keyboard-scrollable. */
  caption: string;
}

/** Generic data table: right-alignable numeric columns, loading skeleton, empty state. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  loadingRows = 6,
  empty,
  bodyTestid,
  caption,
}: Props<T>) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === "right" ? "num" : undefined} scope="col">
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
                    <Skeleton variant="line" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={empty ?? th.common.emptyTable} icon={<InboxIcon />} />
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

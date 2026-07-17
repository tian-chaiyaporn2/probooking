import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  /** When set, this column is shown as the card title on narrow screens. */
  mobileTitle?: boolean;
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

/** Generic data table with a stacked card layout on phones. */
export function DataTable<T>({ columns, rows, rowKey, loading, loadingRows = 6, empty, bodyTestid }: Props<T>) {
  if (columns.length === 0) {
    return <div className="empty card card--pad">{empty ?? null}</div>;
  }

  const titleCol = columns.find((c) => c.mobileTitle) ?? columns[0]!;
  const detailCols = columns.filter((c) => c !== titleCol);

  return (
    <>
      <div className="data-cards" data-testid={bodyTestid ? `${bodyTestid}-cards` : undefined}>
        {loading ? (
          Array.from({ length: Math.min(loadingRows, 4) }).map((_, i) => (
            <div key={i} className="data-card">
              <span className="skeleton skeleton--card" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="empty card card--pad">{empty}</div>
        ) : (
          rows.map((row) => (
            <article key={rowKey(row)} className="data-card">
              <div className="data-card__head">
                <span className="data-card__title">{titleCol.render(row)}</span>
              </div>
              {detailCols.map((c) => (
                <div key={c.key} className="data-card__row">
                  <span className="data-card__label">{c.header}</span>
                  <span className="data-card__value">{c.render(row)}</span>
                </div>
              ))}
            </article>
          ))
        )}
      </div>

      <div className="table-scroll data-table-desktop">
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
                      <span className="skeleton skeleton--row" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="empty">
                  {empty}
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
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getReconciliation,
  getDevToken,
  setAuthToken,
  fetchFinanceExport,
  formatThb,
  type Reconciliation,
} from "../../lib/api";
import { AppHeader } from "../../lib/AppHeader";
import { Stat } from "../../lib/ui";
import { th } from "../../lib/strings";

const MAX_ROWS = 25;

/**
 * Finance dashboard (ADM-01, PAY-11). Reconciles each payment order's events against
 * captured funds and flags any that fail conservation (PAY-08). Read-only.
 */
export default function FinancePage() {
  const [data, setData] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const ensureFinanceToken = useCallback(async () => {
    if (!tokenRef.current) tokenRef.current = (await getDevToken("finance")).token;
    setAuthToken(tokenRef.current);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      await ensureFinanceToken();
      setData(await getReconciliation());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ensureFinanceToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv() {
    setError(null);
    try {
      await ensureFinanceToken();
      const csv = await fetchFinanceExport();
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "finance-export.csv";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const s = data?.summary;
  const rows = data?.rows ?? [];
  const shown = rows.slice(0, MAX_ROWS);

  return (
    <>
      <AppHeader current="/finance" />
      <main className="page" style={{ maxWidth: 1040 }}>
        <div className="actions" style={{ justifyContent: "space-between", marginBottom: "var(--s5)" }}>
          <h1 style={{ margin: 0 }}>{th.finance.title}</h1>
          <div className="actions">
            <button data-testid="refresh" onClick={() => void load()} className="btn btn--ghost">
              {th.common.refresh}
            </button>
            <button data-testid="export-csv" onClick={() => void exportCsv()} className="btn btn--primary">
              {th.finance.exportCsv}
            </button>
          </div>
        </div>

        <div className="stat-grid" data-testid="fin-summary">
          {loading || !s ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="stat skeleton" style={{ height: 66 }} />)
          ) : (
            <>
              <Stat label={th.finance.paymentOrders} value={String(s.count)} testid="fin-count" />
              <Stat label={th.finance.captured} value={formatThb(s.captured)} />
              <Stat label={th.finance.payouts} value={formatThb(s.payouts)} />
              <Stat label={th.finance.refunds} value={formatThb(s.refunds)} />
              <Stat
                label={th.finance.exceptions}
                value={String(s.exceptions)}
                testid="fin-exceptions"
                tone={s.exceptions === 0 ? "success" : "danger"}
              />
            </>
          )}
        </div>

        <div className="table-scroll" style={{ marginTop: "var(--s5)" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{th.finance.colBooking}</th>
                <th className="num">{th.finance.captured}</th>
                <th className="num">{th.finance.payouts}</th>
                <th className="num">{th.finance.refunds}</th>
                <th className="num">{th.finance.colUndistributed}</th>
                <th>{th.finance.colConserved}</th>
              </tr>
            </thead>
            <tbody data-testid="reconciliation-rows">
              {shown.map((r) => (
                <tr key={r.paymentOrderId}>
                  <td><code>{(r.bookingId ?? "—").slice(0, 8)}</code></td>
                  <td className="num">{formatThb(r.captured)}</td>
                  <td className="num">{formatThb(r.payouts)}</td>
                  <td className="num">{formatThb(r.refunds)}</td>
                  <td className="num">{formatThb(r.undistributed)}</td>
                  <td>
                    {r.conserved ? (
                      <span className="badge badge--success" aria-label="conserved">✓</span>
                    ) : (
                      <span className="badge badge--warn" aria-label="exception">✗ {th.finance.exceptions}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > MAX_ROWS && (
          <p data-testid="rows-truncated" className="muted" style={{ fontSize: "0.8rem", marginTop: "var(--s3)" }}>
            {th.finance.showing(shown.length, rows.length)}
          </p>
        )}

        {error && (
          <p data-testid="error" style={{ color: "var(--danger)", marginTop: "var(--s5)" }}>
            {th.common.error}: {error}
          </p>
        )}
      </main>
    </>
  );
}

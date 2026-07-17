"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  getReconciliation,
  getDevToken,
  setAuthToken,
  fetchFinanceExport,
  formatThb,
  type Reconciliation,
} from "../../lib/api";
import { btn, Stat } from "../../lib/ui";
import { th } from "../../lib/strings";

const MAX_ROWS = 25;

/**
 * Finance dashboard (ADM-01, PAY-11). Reconciles each payment order's events against
 * captured funds and flags any that fail conservation (PAY-08). Read-only; a separate
 * access-controlled surface in production (Finance role, §3).
 */
export default function FinancePage() {
  const [data, setData] = useState<Reconciliation | null>(null);
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
      // Append to the DOM before clicking (some browsers require it) and revoke on a
      // later tick so the download isn't aborted mid-read.
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
    <main className="page" style={{ maxWidth: 820 }}>
      <h1>{th.finance.title}</h1>
      <div className="actions">
        <button data-testid="refresh" onClick={() => void load()} style={btn("#555")}>
          {th.common.refresh}
        </button>
        <button data-testid="export-csv" onClick={() => void exportCsv()} style={btn("#06b")}>
          {th.finance.exportCsv}
        </button>
      </div>

      {s && (
        <div data-testid="fin-summary" style={{ marginTop: "1rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <Stat label={th.finance.paymentOrders} value={String(s.count)} testid="fin-count" />
          <Stat label={th.finance.captured} value={formatThb(s.captured)} />
          <Stat label={th.finance.payouts} value={formatThb(s.payouts)} />
          <Stat label={th.finance.refunds} value={formatThb(s.refunds)} />
          <Stat
            label={th.finance.exceptions}
            value={String(s.exceptions)}
            testid="fin-exceptions"
            color={s.exceptions === 0 ? "#0a5" : "#c00"}
          />
        </div>
      )}

      <div className="table-scroll" style={{ marginTop: "1.5rem" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th scope="col" style={cell}>{th.finance.colBooking}</th>
            <th scope="col" style={cell}>{th.finance.captured}</th>
            <th scope="col" style={cell}>{th.finance.payouts}</th>
            <th scope="col" style={cell}>{th.finance.refunds}</th>
            <th scope="col" style={cell}>{th.finance.colUndistributed}</th>
            <th scope="col" style={cell}>{th.finance.colConserved}</th>
          </tr>
        </thead>
        <tbody data-testid="reconciliation-rows">
          {shown.map((r) => (
            <tr key={r.paymentOrderId} style={{ borderBottom: "1px solid #eee" }}>
              <td style={cell}><code>{(r.bookingId ?? "—").slice(0, 8)}</code></td>
              <td style={cell}>{formatThb(r.captured)}</td>
              <td style={cell}>{formatThb(r.payouts)}</td>
              <td style={cell}>{formatThb(r.refunds)}</td>
              <td style={cell}>{formatThb(r.undistributed)}</td>
              <td style={{ ...cell, color: r.conserved ? "#0a5" : "#c00" }}>{r.conserved ? "✓" : "✗"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {rows.length > MAX_ROWS && (
        <p data-testid="rows-truncated" style={{ color: "#888", fontSize: "0.8rem" }}>
          {th.finance.showing(shown.length, rows.length)}
        </p>
      )}

      {error && (
        <p data-testid="error" style={{ color: "#c00" }}>
          {th.common.error}: {error}
        </p>
      )}
    </main>
  );
}

const cell: CSSProperties = { padding: "0.3rem 0.6rem" };

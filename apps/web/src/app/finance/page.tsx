"use client";

import { useCallback, useEffect, useState } from "react";
import { getReconciliation, formatThb, type Reconciliation } from "../../lib/api";

/**
 * Finance dashboard (ADM-01, PAY-11). Reconciles each payment order's events against
 * captured funds and flags any that fail conservation (PAY-08). Read-only; a separate
 * access-controlled surface in production (Finance role, §3).
 */
export default function FinancePage() {
  const [data, setData] = useState<Reconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getReconciliation());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const s = data?.summary;

  return (
    <main style={{ maxWidth: 820, margin: "3rem auto", padding: "0 1.5rem", fontFamily: "system-ui" }}>
      <h1>Finance — reconciliation</h1>
      <button data-testid="refresh" onClick={() => void load()} style={btn("#555")}>
        Refresh
      </button>

      {s && (
        <div data-testid="fin-summary" style={{ marginTop: "1rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <Stat label="Payment orders" value={String(s.count)} testid="fin-count" />
          <Stat label="Captured" value={formatThb(s.captured)} />
          <Stat label="Payouts" value={formatThb(s.payouts)} />
          <Stat label="Refunds" value={formatThb(s.refunds)} />
          <Stat
            label="Exceptions"
            value={String(s.exceptions)}
            testid="fin-exceptions"
            color={s.exceptions === 0 ? "#0a5" : "#c00"}
          />
        </div>
      )}

      <table style={{ marginTop: "1.5rem", borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={cell}>Booking</th>
            <th style={cell}>Captured</th>
            <th style={cell}>Payouts</th>
            <th style={cell}>Refunds</th>
            <th style={cell}>Undistributed</th>
            <th style={cell}>Conserved</th>
          </tr>
        </thead>
        <tbody data-testid="reconciliation-rows">
          {(data?.rows ?? []).slice(0, 25).map((r) => (
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

      {error && (
        <p data-testid="error" style={{ color: "#c00" }}>
          Error: {error}
        </p>
      )}
    </main>
  );
}

function Stat({ label, value, testid, color }: { label: string; value: string; testid?: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "#888" }}>{label}</div>
      <div data-testid={testid} style={{ fontWeight: 600, color: color ?? "#222" }}>
        {value}
      </div>
    </div>
  );
}

const btn = (color: string): React.CSSProperties => ({
  padding: "0.2rem 0.7rem",
  borderRadius: 6,
  border: `1px solid ${color}`,
  background: color,
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.85rem",
});

const cell: React.CSSProperties = { padding: "0.3rem 0.6rem" };

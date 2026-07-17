"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOpsPending,
  getOpsCases,
  getMetrics,
  verifyClinic,
  verifyProfessional,
  resolveHold,
  getDevToken,
  setAuthToken,
  type CaseSummary,
  type PendingVerification,
  type MarketplaceMetrics,
} from "../../lib/api";
import { btn, tag, Stat } from "../../lib/ui";
import { th } from "../../lib/strings";

/**
 * Operations dashboard (ADM-01). Internal tool that calls controlled API actions:
 * verify pending clinics/professionals and resolve credential holds. In production
 * this is a separate, access-controlled surface (MFA, least privilege — §3).
 */
export default function OpsPage() {
  const [pending, setPending] = useState<PendingVerification[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [metrics, setMetrics] = useState<MarketplaceMetrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Fetch the ops token once per mount, then re-assert it before each guarded call
  // (cheap: no network) in case another dashboard overwrote the shared module token.
  const ensureOpsToken = useCallback(async () => {
    if (!tokenRef.current) tokenRef.current = (await getDevToken("operations")).token;
    setAuthToken(tokenRef.current);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      await ensureOpsToken();
      // Independent reads run concurrently, and state updates together (no partial panel).
      const [p, c, m] = await Promise.all([getOpsPending(), getOpsCases(), getMetrics()]);
      setPending(p.pending);
      setCases(c.cases);
      setMetrics(m);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [ensureOpsToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function verify(kind: "clinic" | "professional", id: string) {
    setBusy(true);
    try {
      await ensureOpsToken();
      if (kind === "clinic") await verifyClinic(id);
      else await verifyProfessional(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resolve(bookingId: string) {
    setBusy(true);
    try {
      await ensureOpsToken();
      await resolveHold(bookingId);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <h1>{th.ops.title}</h1>
      <button data-testid="refresh" onClick={() => void load()} disabled={busy} style={btn("#555")}>
        {th.common.refresh}
      </button>

      {metrics && (
        <div data-testid="ops-metrics" style={{ marginTop: "1rem", display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
          <Stat label={th.ops.metricShifts} value={`${metrics.shifts.total} (${metrics.shifts.open})`} />
          <Stat label={th.ops.metricBookings} value={String(metrics.bookings.total)} />
          <Stat label={th.ops.metricCompleted} value={String(metrics.bookings.completed)} />
          <Stat label={th.ops.metricHeld} value={String(metrics.bookings.held)} />
          <Stat label={th.ops.metricCases} value={String(metrics.cases.open)} />
          <Stat
            label={th.ops.metricExceptions}
            value={String(metrics.money.reconciliationExceptions)}
            color={metrics.money.reconciliationExceptions === 0 ? "#0a5" : "#c00"}
          />
        </div>
      )}

      <h2 style={{ marginTop: "1.5rem" }}>
        {th.ops.pending} ({pending.length})
      </h2>
      <ul data-testid="pending-list" style={{ lineHeight: 1.9, paddingLeft: 0, listStyle: "none" }}>
        {pending.length === 0 && <li style={{ color: "#888" }}>{th.common.none}</li>}
        {pending.map((p) => (
          <li key={p.id} data-testid={`pending-${p.id}`}>
            <span style={tag(p.kind === "clinic" ? "#06b" : "#849")}>{p.kind}</span>{" "}
            <code>{p.id.slice(0, 10)}…</code> {p.name}{" "}
            <button
              data-testid="verify-btn"
              onClick={() => void verify(p.kind, p.id)}
              disabled={busy}
              style={btn("#0b6")}
            >
              {th.ops.verify}
            </button>
          </li>
        ))}
      </ul>

      <h2 style={{ marginTop: "1.5rem" }}>
        {th.ops.openCases} ({cases.length})
      </h2>
      <ul data-testid="cases-list" style={{ lineHeight: 1.9, paddingLeft: 0, listStyle: "none" }}>
        {cases.length === 0 && <li style={{ color: "#888" }}>{th.common.none}</li>}
        {cases.map((c) => (
          <li key={c.id} data-testid={`case-${c.id}`}>
            <span style={tag("#c60")}>{c.kind}</span> <span style={{ color: "#0a5" }}>{c.state}</span>{" "}
            {c.refId && <code>{c.refId.slice(0, 10)}…</code>}{" "}
            {c.kind === "credential_hold" && c.refId && (
              <button
                data-testid="resolve-btn"
                onClick={() => void resolve(c.refId as string)}
                disabled={busy}
                style={btn("#0b6")}
              >
                {th.ops.resolveHold}
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p data-testid="error" style={{ color: "#c00" }}>
          {th.common.error}: {error}
        </p>
      )}
    </main>
  );
}

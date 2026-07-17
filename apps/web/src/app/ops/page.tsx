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
import { AppHeader } from "../../components/AppHeader";
import { Stat } from "../../components/Stat";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { RefreshIcon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { th } from "../../lib/strings";

/**
 * Operations dashboard (ADM-01). Internal tool that calls controlled API actions:
 * verify pending clinics/professionals and resolve credential holds.
 */
export default function OpsPage() {
  const [pending, setPending] = useState<PendingVerification[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [metrics, setMetrics] = useState<MarketplaceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const toast = useToast();

  const ensureOpsToken = useCallback(async () => {
    if (!tokenRef.current) tokenRef.current = (await getDevToken("operations")).token;
    setAuthToken(tokenRef.current);
  }, []);

  const load = useCallback(async () => {
    try {
      await ensureOpsToken();
      const [p, c, m] = await Promise.all([getOpsPending(), getOpsCases(), getMetrics()]);
      setPending(p.pending);
      setCases(c.cases);
      setMetrics(m);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ensureOpsToken, toast]);

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
      toast.success(`${kind === "clinic" ? "คลินิก" : "บุคลากร"}ผ่านการตรวจสอบแล้ว`);
    } catch (e) {
      toast.error((e as Error).message);
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
      toast.success("ปลดการระงับแล้ว");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader current="/ops" />
      <main className="page" style={{ maxWidth: 960 }}>
        <div className="actions" style={{ justifyContent: "space-between", marginBottom: "var(--s5)" }}>
          <h1 style={{ margin: 0 }}>{th.ops.title}</h1>
          <Button data-testid="refresh" onClick={() => void load()} disabled={busy} icon={<RefreshIcon />}>
            {th.common.refresh}
          </Button>
        </div>

        <div className="stat-grid" data-testid="ops-metrics">
          {loading || !metrics ? (
            Array.from({ length: 6 }).map((_, i) => <div key={i} className="stat skeleton" style={{ height: 66 }} />)
          ) : (
            <>
              <Stat label={th.ops.metricShifts} value={`${metrics.shifts.total} (${metrics.shifts.open})`} />
              <Stat label={th.ops.metricBookings} value={String(metrics.bookings.total)} />
              <Stat label={th.ops.metricCompleted} value={String(metrics.bookings.completed)} />
              <Stat label={th.ops.metricHeld} value={String(metrics.bookings.held)} />
              <Stat label={th.ops.metricCases} value={String(metrics.cases.open)} />
              <Stat
                label={th.ops.metricExceptions}
                value={String(metrics.money.reconciliationExceptions)}
                tone={metrics.money.reconciliationExceptions === 0 ? "success" : "danger"}
              />
            </>
          )}
        </div>

        <h2 style={{ marginTop: "var(--s6)" }}>
          {th.ops.pending} ({pending.length})
        </h2>
        <div className="card">
          <ul data-testid="pending-list" className="rowlist">
            {!loading && pending.length === 0 && <li className="empty">{th.common.none}</li>}
            {pending.map((p) => (
              <li key={p.id} data-testid={`pending-${p.id}`}>
                <Badge variant={p.kind}>{p.kind}</Badge>
                <span className="row__main">
                  {p.name} <code className="row__id">{p.id.slice(0, 8)}…</code>
                </span>
                <span className="row__actions">
                  <Button data-testid="verify-btn" variant="primary" busy={busy} onClick={() => void verify(p.kind, p.id)}>
                    {th.ops.verify}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <h2 style={{ marginTop: "var(--s6)" }}>
          {th.ops.openCases} ({cases.length})
        </h2>
        <div className="card">
          <ul data-testid="cases-list" className="rowlist">
            {!loading && cases.length === 0 && <li className="empty">{th.common.none}</li>}
            {cases.map((c) => (
              <li key={c.id} data-testid={`case-${c.id}`}>
                <Badge variant={c.kind}>{c.kind}</Badge>
                <span className="row__main">
                  <span className="muted">{c.state}</span>{" "}
                  {c.refId && <code className="row__id">{c.refId.slice(0, 8)}…</code>}
                </span>
                {c.kind === "credential_hold" && c.refId && (
                  <span className="row__actions">
                    <Button data-testid="resolve-btn" busy={busy} onClick={() => void resolve(c.refId as string)}>
                      {th.ops.resolveHold}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

      </main>
    </>
  );
}

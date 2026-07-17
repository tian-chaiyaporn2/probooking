"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getOpsPending,
  getOpsCases,
  getMetrics,
  verifyClinic,
  verifyProfessional,
  resolveHold,
  setAuthToken,
  type CaseSummary,
  type PendingVerification,
  type MarketplaceMetrics,
} from "../../lib/api";
import { AppHeader } from "../../components/AppHeader";
import { Stat } from "../../components/Stat";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import {
  RefreshIcon,
  CalendarIcon,
  UsersIcon,
  CheckIcon,
  AlertIcon,
  ShieldCheckIcon,
  WalletIcon,
} from "../../components/icons";
import { useToast } from "../../components/Toast";
import { StaffLogin } from "../../components/StaffLogin";
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
  const [token, setToken] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [p, c, m] = await Promise.all([getOpsPending(), getOpsCases(), getMetrics()]);
      setPending(p.pending);
      setCases(c.cases);
      setMetrics(m);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Authority now comes from a real staff sign-in, not a token the page minted for itself.
  useEffect(() => {
    if (token) {
      setAuthToken(token);
      void load();
    }
  }, [token, load]);

  if (!token) {
    return (
      <>
        <AppHeader current="/ops" />
        <StaffLogin surface="Operations" onToken={setToken} />
      </>
    );
  }

  async function verify(kind: "clinic" | "professional", id: string) {
    setBusy(true);
    try {
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
              <Stat
                label={th.ops.metricShifts}
                value={String(metrics.shifts.total)}
                hint={`${metrics.shifts.open} ${th.ops.openSuffix}`}
                icon={<CalendarIcon />}
              />
              <Stat label={th.ops.metricBookings} value={String(metrics.bookings.total)} icon={<UsersIcon />} />
              <Stat label={th.ops.metricCompleted} value={String(metrics.bookings.completed)} icon={<CheckIcon />} />
              <Stat
                label={th.ops.metricHeld}
                value={String(metrics.bookings.held)}
                icon={<AlertIcon />}
                tone={metrics.bookings.held > 0 ? "danger" : "default"}
              />
              <Stat label={th.ops.metricCases} value={String(metrics.cases.open)} icon={<ShieldCheckIcon />} />
              <Stat
                label={th.ops.metricExceptions}
                value={String(metrics.money.reconciliationExceptions)}
                icon={<WalletIcon />}
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
                <span className={`row__avatar row__avatar--${p.kind}`} aria-hidden>
                  {p.kind === "clinic" ? "🏥" : "🩺"}
                </span>
                <span className="row__main">
                  <span className="row__name">{p.name}</span>
                  <span className="row__sub">
                    <Badge variant={p.kind}>{th.ops.kind[p.kind]}</Badge>
                    <code className="row__id">{p.id.slice(0, 8)}…</code>
                  </span>
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

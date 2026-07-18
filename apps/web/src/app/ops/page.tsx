"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOpsPending,
  getOpsCases,
  getMetrics,
  verifyClinic,
  verifyProfessional,
  resolveHold,
  type CaseSummary,
  type PendingVerification,
  type MarketplaceMetrics,
} from "../../lib/api";
import { AppHeader } from "../../components/AppHeader";
import { Stat } from "../../components/Stat";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/PageHeader";
import { SectionBlock } from "../../components/SectionBlock";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton, StatSkeletonGrid } from "../../components/Skeleton";
import {
  RefreshIcon,
  CalendarIcon,
  UsersIcon,
  CheckIcon,
  AlertIcon,
  ShieldCheckIcon,
  WalletIcon,
  ClinicIcon,
  StethoscopeIcon,
  InboxIcon,
} from "../../components/icons";
import { useToast } from "../../components/Toast";
import { StaffLogin } from "../../components/StaffLogin";
import { th, getThaiErrorMessage } from "../../lib/strings";
import { badgeToneForKind } from "../../lib/tones";
import { loadSession, clearSession } from "../../lib/demo-accounts";

/**
 * Operations dashboard (ADM-01). Internal tool that calls controlled API actions:
 * verify pending clinics/professionals and resolve credential holds.
 */
export default function OpsPage() {
  const [pending, setPending] = useState<PendingVerification[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [metrics, setMetrics] = useState<MarketplaceMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const toast = useToast();
  const loadSeq = useRef(0);

  const signOut = useCallback(() => {
    loadSeq.current += 1;
    clearSession();
    setToken(null);
    setMetrics(null);
    setPending([]);
    setCases([]);
    setLoadError(null);
    setLoading(false);
    setBusy(false);
  }, []);

  // Honor a session created by the "sign in as" picker so a click there lands here signed in,
  // rather than showing the staff login form again. A wrong-role session fails the first load
  // (403) and drops back to the form.
  useEffect(() => {
    const s = loadSession();
    if (s) setToken(s.token);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [p, c, m] = await Promise.all([
        getOpsPending(token),
        getOpsCases(token),
        getMetrics(token),
      ]);
      if (seq !== loadSeq.current) return;
      setPending(p.pending);
      setCases(c.cases);
      setMetrics(m);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      const msg = getThaiErrorMessage(e);
      setLoadError(msg);
      toast.error(msg);
      const raw = e instanceof Error ? e.message.toLowerCase() : "";
      if (raw.includes("403") || raw.includes("401") || raw.includes("forbidden") || raw.includes("authentication")) {
        signOut();
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [token, toast, signOut]);

  useEffect(() => {
    if (token) void load();
  }, [token, load]);

  if (!token) {
    return (
      <>
        <AppHeader current="/ops" />
        <StaffLogin surface="operations" onToken={setToken} />
      </>
    );
  }

  async function verify(kind: "clinic" | "professional", id: string) {
    if (!token) return;
    const auth = token;
    setBusy(true);
    try {
      if (kind === "clinic") await verifyClinic(id, auth);
      else await verifyProfessional(id, auth);
      await load();
      toast.success(`${kind === "clinic" ? "คลินิก" : "บุคลากร"}ผ่านการตรวจสอบแล้ว`);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function resolve(bookingId: string) {
    if (!token) return;
    const auth = token;
    setBusy(true);
    try {
      await resolveHold(bookingId, auth);
      await load();
      toast.success("ปลดการระงับแล้ว");
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader current="/ops" />
      <main id="main" className="page page--ops">
        <PageHeader
          title={th.ops.title}
          subtitle={th.ops.subtitle}
          actions={
            <>
              <Button data-testid="refresh" onClick={() => void load()} disabled={busy || loading} icon={<RefreshIcon />}>
                {th.common.refresh}
              </Button>
              <Button data-testid="sign-out" variant="subtle" onClick={signOut}>
                {th.staffLogin.signOut}
              </Button>
            </>
          }
        />

        {loadError && (
          <p role="alert" className="form-error">
            {loadError}
          </p>
        )}

        {loading && !metrics ? (
          <StatSkeletonGrid count={6} testid="ops-metrics" />
        ) : (
          <div className="stat-grid" data-testid="ops-metrics">
            {metrics ? (
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
            ) : null}
          </div>
        )}

        <SectionBlock title={th.ops.pending} count={pending.length}>
          <div className="card">
            <ul data-testid="pending-list" className="rowlist" aria-busy={loading || undefined}>
              {loading && pending.length === 0 &&
                Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="rowlist__skeleton" aria-hidden>
                    <Skeleton variant="avatar" />
                    <span className="row__main">
                      <Skeleton variant="line" />
                      <Skeleton variant="line-short" />
                    </span>
                  </li>
                ))}
              {!loading && pending.length === 0 && (
                <EmptyState as="li" title={th.ops.emptyPending} icon={<InboxIcon />} />
              )}
              {pending.map((p) => (
                <li key={p.id} data-testid={`pending-${p.id}`}>
                  <span className={`row__avatar row__avatar--${p.kind}`} aria-hidden>
                    {p.kind === "clinic" ? <ClinicIcon /> : <StethoscopeIcon />}
                  </span>
                  <span className="row__main">
                    <span className="row__name">{p.name}</span>
                    <span className="row__sub">
                      <Badge tone={badgeToneForKind(p.kind)}>{th.ops.kind[p.kind]}</Badge>
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
        </SectionBlock>

        <SectionBlock title={th.ops.openCases} count={cases.length}>
          <div className="card">
            <ul data-testid="cases-list" className="rowlist" aria-busy={loading || undefined}>
              {loading && cases.length === 0 &&
                Array.from({ length: 2 }).map((_, i) => (
                  <li key={i} className="rowlist__skeleton" aria-hidden>
                    <Skeleton variant="chip" />
                    <span className="row__main">
                      <Skeleton variant="line" />
                    </span>
                  </li>
                ))}
              {!loading && cases.length === 0 && (
                <EmptyState as="li" title={th.ops.emptyCases} icon={<CheckIcon />} />
              )}
              {cases.map((c) => {
                const refId = c.refId;
                return (
                  <li key={c.id} data-testid={`case-${c.id}`}>
                    <Badge tone={badgeToneForKind(c.kind)}>{th.ops.caseKind[c.kind] ?? c.kind}</Badge>
                    <span className="row__main">
                      <span className="row__name">{c.subject || (th.ops.caseState[c.state] ?? c.state)}</span>
                      <span className="row__sub">
                        {c.subject ? (
                          <span className="muted">{th.ops.caseState[c.state] ?? c.state}</span>
                        ) : null}
                        {refId && <code className="row__id">{refId.slice(0, 8)}…</code>}
                      </span>
                    </span>
                    {c.kind === "credential_hold" && refId ? (
                      <span className="row__actions">
                        <Button data-testid="resolve-btn" busy={busy} onClick={() => void resolve(refId)}>
                          {th.ops.resolveHold}
                        </Button>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </SectionBlock>
      </main>
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOpsPending,
  getOpsCases,
  getOpsBookings,
  getMetrics,
  getOpsAudit,
  verifyClinic,
  verifyProfessional,
  verifyInsurance,
  needsInfoClinic,
  rejectClinic,
  needsInfoProfessional,
  rejectProfessional,
  suspendCredential,
  holdCredential,
  resolveHold,
  type CaseSummary,
  type PendingVerification,
  type ActiveBooking,
  type MarketplaceMetrics,
  type AuditRow,
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
import { labelBookingState, labelCaseState } from "../../lib/status-labels";
import { badgeToneForKind } from "../../lib/tones";
import { loadSession, clearSession } from "../../lib/demo-accounts";

/**
 * Operations dashboard (ADM-01). Internal tool that calls controlled API actions:
 * verify pending clinics/professionals and resolve credential holds.
 */
export default function OpsPage() {
  const [pending, setPending] = useState<PendingVerification[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [bookings, setBookings] = useState<ActiveBooking[]>([]);
  const [metrics, setMetrics] = useState<MarketplaceMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const toast = useToast();
  const loadSeq = useRef(0);

  const signOut = useCallback(() => {
    loadSeq.current += 1;
    clearSession();
    setToken(null);
    setMetrics(null);
    setPending([]);
    setCases([]);
    setBookings([]);
    setAudit([]);
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
      const [p, c, b, m, a] = await Promise.all([
        getOpsPending(token),
        getOpsCases(token),
        getOpsBookings(token),
        getMetrics(token),
        getOpsAudit(token).catch(() => ({ audit: [] as AuditRow[] })),
      ]);
      if (seq !== loadSeq.current) return;
      setPending(p.pending);
      setCases(c.cases);
      setBookings(b.bookings);
      setMetrics(m);
      setAudit(a.audit.slice(0, 10));
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

  async function review(
    action: "verify" | "needs" | "reject",
    kind: "clinic" | "professional" | "insurance",
    id: string,
  ) {
    if (!token) return;
    const auth = token;
    setBusy(true);
    try {
      if (action === "verify") {
        if (kind === "clinic") await verifyClinic(id, auth);
        else if (kind === "insurance") await verifyInsurance(id, auth);
        else await verifyProfessional(id, auth);
        toast.success(
          kind === "clinic" ? th.ops.verifiedClinic : kind === "insurance" ? th.ops.insuranceVerified : th.ops.verifiedPro,
        );
      } else if (action === "needs") {
        if (kind === "clinic") await needsInfoClinic(id, auth);
        else await needsInfoProfessional(id, auth);
        toast.success(th.ops.needsInfoDone);
      } else if (kind === "professional" || kind === "clinic") {
        if (kind === "clinic") await rejectClinic(id, auth);
        else await rejectProfessional(id, auth);
        toast.success(th.ops.rejected);
      }
      await load();
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify(kind: "clinic" | "professional" | "insurance", id: string) {
    await review("verify", kind, id);
  }

  async function enforce(fn: () => Promise<unknown>, ok: string) {
    if (!token) return;
    setBusy(true);
    try {
      await fn();
      await load();
      toast.success(ok);
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
                  <span className="row__actions actions">
                    {p.kind !== "insurance" && (
                      <>
                        <Button data-testid="verify-btn" variant="primary" busy={busy} onClick={() => void review("verify", p.kind, p.id)}>
                          {th.ops.verify}
                        </Button>
                        <Button busy={busy} onClick={() => void review("needs", p.kind, p.id)}>
                          {th.ops.needsInfo}
                        </Button>
                        <Button variant="subtle" busy={busy} onClick={() => void review("reject", p.kind, p.id)}>
                          {th.ops.reject}
                        </Button>
                      </>
                    )}
                    {p.kind === "insurance" && (
                      <Button data-testid="verify-btn" variant="primary" busy={busy} onClick={() => void verify("insurance", p.id)}>
                        {th.ops.verify}
                      </Button>
                    )}
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
                      <span className="row__name">{c.subject || labelCaseState(c.state)}</span>
                      <span className="row__sub">
                        {c.subject ? <span className="muted">{labelCaseState(c.state)}</span> : null}
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

        {/* Active bookings — VER-06 credential hold / VER-04 suspend enforcement. */}
        <SectionBlock title={th.ops.activeBookings} count={bookings.length}>
          <div className="card">
            <ul data-testid="active-bookings" className="rowlist" aria-busy={loading || undefined}>
              {!loading && bookings.length === 0 && (
                <EmptyState as="li" title={th.ops.emptyActive} icon={<CheckIcon />} />
              )}
              {bookings.map((b) => (
                <li key={b.bookingId} data-testid={`active-${b.bookingId}`}>
                  <span className="row__avatar row__avatar--professional" aria-hidden>
                    <StethoscopeIcon />
                  </span>
                  <span className="row__main">
                    <span className="row__name">{b.professionalName}</span>
                    <span className="row__sub">
                      <Badge tone="info">{labelBookingState(b.state)}</Badge>
                      <span className="muted">{b.clinicName}</span>
                      {b.held && <Badge tone="warning">{th.ops.heldBadge}</Badge>}
                      {b.credential === "Suspended" && <Badge tone="danger">{th.ops.suspendedBadge}</Badge>}
                    </span>
                  </span>
                  <span className="row__actions actions">
                    {!b.held && (
                      <Button
                        data-testid="hold-btn"
                        busy={busy}
                        onClick={() => {
                          const reason = window.prompt(th.ops.reasonLabel) ?? "";
                          void enforce(() => holdCredential(b.bookingId, token, reason || undefined), th.ops.credentialHeld);
                        }}
                      >
                        {th.ops.holdCredential}
                      </Button>
                    )}
                    {b.credential !== "Suspended" && (
                      <Button
                        data-testid="suspend-btn"
                        variant="subtle"
                        busy={busy}
                        onClick={() => {
                          const reason = window.prompt(th.ops.reasonLabel) ?? "";
                          void enforce(() => suspendCredential(b.professionalId, token, reason || undefined), th.ops.credentialSuspended);
                        }}
                      >
                        {th.ops.suspend}
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </SectionBlock>

        <SectionBlock title={th.ops.auditTitle} count={audit.length}>
          <div className="card">
            <ul className="rowlist" data-testid="audit-list">
              {audit.length === 0 && <li className="empty">{th.ops.auditEmpty}</li>}
              {audit.map((row) => (
                <li key={row.id}>
                  <span className="row__main">
                    <span className="row__name">{row.action}</span>
                    <span className="row__sub muted">
                      {row.targetType} · {row.actor} · {new Date(row.at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </SectionBlock>
      </main>
    </>
  );
}

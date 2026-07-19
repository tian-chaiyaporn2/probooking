"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  getOpsPending,
  getOpsCases,
  getOpsBookings,
  getMetrics,
  verifyClinic,
  verifyProfessional,
  verifyInsurance,
  suspendCredential,
  holdCredential,
  resolveHold,
  logout,
  type CaseSummary,
  type PendingVerification,
  type ActiveBooking,
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
import { Dialog } from "../../components/Dialog";
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
import { statusLabel, professionLabel } from "../../lib/status";
import { badgeToneForKind } from "../../lib/tones";
import { loadSession, clearSession, saveSession } from "../../lib/session";

type ConfirmAction =
  | {
      type: "verify";
      kind: "clinic" | "professional" | "insurance";
      id: string;
      name: string;
    }
  | { type: "resolve"; bookingId: string; subject: string }
  | { type: "hold"; bookingId: string; name: string }
  | { type: "suspend"; professionalId: string; name: string };

/**
 * Operations dashboard (ADM-01). Internal tool that calls controlled API actions:
 * verify pending clinics/professionals/insurance, resolve credential holds, and
 * enforce hold/suspend on active bookings.
 */
export default function OpsPage() {
  const [pending, setPending] = useState<PendingVerification[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [bookings, setBookings] = useState<ActiveBooking[]>([]);
  const [metrics, setMetrics] = useState<MarketplaceMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [booting, setBooting] = useState(true);
  const toast = useToast();
  const loadSeq = useRef(0);

  useEffect(() => {
    // Canonical session (RolePicker inject / OTP / e2e all write `probook.session`). Only
    // hydrate a session that belongs to this surface — a shared session may hold another
    // role's token (e.g. after signing in on /finance), which would 403 here.
    const sess = loadSession();
    if (
      sess &&
      (!sess.role ||
        sess.role === "operations" ||
        sess.role === "administrator")
    ) {
      setToken(sess.token);
    }
    setBooting(false);
  }, []);

  const acceptToken = useCallback((next: string) => {
    saveSession(next, "", "operations");
    setSessionNotice(null);
    setToken(next);
  }, []);

  const signOut = useCallback(async () => {
    loadSeq.current += 1;
    const previous = token;
    setToken(null);
    setMetrics(null);
    setPending([]);
    setCases([]);
    setBookings([]);
    setLoadError(null);
    setLoading(false);
    setBusyId(null);
    setConfirm(null);
    clearSession();
    if (previous) {
      try {
        await logout(previous);
      } catch {
        // Best-effort revoke; local session is already cleared.
      }
    }
  }, [token]);

  const expireSession = useCallback(() => {
    clearSession();
    setToken(null);
    setSessionNotice(th.staffLogin.sessionExpiredBanner);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [p, c, b, m] = await Promise.all([
        getOpsPending(token),
        getOpsCases(token),
        getOpsBookings(token),
        getMetrics(token),
      ]);
      if (seq !== loadSeq.current) return;
      setPending(p.pending);
      setCases(c.cases);
      setBookings(b.bookings);
      setMetrics(m);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      const msg = getThaiErrorMessage(e);
      setLoadError(msg);
      toast.error(msg);
      // An auth/permission failure (revoked/expired token, or a role that no longer matches
      // this surface) should drop the stale session and return to the staff login. Branch on
      // the HTTP status, not the message text — the message never contains the code.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        expireSession();
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [token, toast, expireSession]);

  useEffect(() => {
    if (token) void load();
  }, [token, load]);

  async function runConfirm() {
    if (!token || !confirm) return;
    const auth = token;
    const action = confirm;
    const id =
      action.type === "verify"
        ? action.id
        : action.type === "suspend"
          ? `suspend-${action.professionalId}`
          : action.bookingId;
    setBusyId(id);
    try {
      if (action.type === "verify") {
        if (action.kind === "clinic") await verifyClinic(action.id, auth);
        else if (action.kind === "insurance")
          await verifyInsurance(action.id, auth);
        else await verifyProfessional(action.id, auth);
        toast.success(
          action.kind === "clinic"
            ? "คลินิกผ่านการตรวจสอบแล้ว"
            : action.kind === "insurance"
              ? th.ops.insuranceVerified
              : "บุคลากรผ่านการตรวจสอบแล้ว",
        );
      } else if (action.type === "resolve") {
        await resolveHold(action.bookingId, auth);
        toast.success("ปลดการระงับแล้ว");
      } else if (action.type === "hold") {
        await holdCredential(action.bookingId, auth);
        toast.success(th.ops.credentialHeld);
      } else {
        await suspendCredential(action.professionalId, auth);
        toast.success(th.ops.credentialSuspended);
      }
      setConfirm(null);
      await load();
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  if (booting) {
    return (
      <>
        <AppHeader current="/ops" />
        <main id="main" className="page">
          <p className="muted">{th.common.loading}</p>
        </main>
      </>
    );
  }

  if (!token) {
    return (
      <>
        <AppHeader current="/ops" />
        <StaffLogin
          surface="operations"
          onToken={acceptToken}
          sessionNotice={sessionNotice}
        />
      </>
    );
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
              <Button
                data-testid="refresh"
                onClick={() => void load()}
                disabled={busyId !== null || loading}
                icon={<RefreshIcon />}
              >
                {th.common.refresh}
              </Button>
              <Button
                data-testid="sign-out"
                variant="subtle"
                onClick={() => void signOut()}
              >
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
                <Stat
                  label={th.ops.metricBookings}
                  value={String(metrics.bookings.total)}
                  icon={<UsersIcon />}
                />
                <Stat
                  label={th.ops.metricCompleted}
                  value={String(metrics.bookings.completed)}
                  icon={<CheckIcon />}
                />
                <Stat
                  label={th.ops.metricHeld}
                  value={String(metrics.bookings.held)}
                  icon={<AlertIcon />}
                  tone={metrics.bookings.held > 0 ? "danger" : "default"}
                />
                <Stat
                  label={th.ops.metricCases}
                  value={String(metrics.cases.open)}
                  icon={<ShieldCheckIcon />}
                />
                <Stat
                  label={th.ops.metricExceptions}
                  value={String(metrics.money.reconciliationExceptions)}
                  icon={<WalletIcon />}
                  tone={
                    metrics.money.reconciliationExceptions === 0
                      ? "success"
                      : "danger"
                  }
                />
              </>
            ) : null}
          </div>
        )}

        <SectionBlock title={th.ops.pending} count={pending.length}>
          <div className="card">
            <ul
              data-testid="pending-list"
              className="rowlist"
              aria-busy={loading || undefined}
            >
              {loading &&
                pending.length === 0 &&
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
                <EmptyState
                  as="li"
                  title={th.ops.emptyPending}
                  description={th.ops.emptyPendingHint}
                  icon={<InboxIcon />}
                />
              )}
              {pending.map((p) => {
                const open = expandedId === p.id;
                return (
                  <li
                    key={`${p.kind}-${p.id}`}
                    data-testid={`pending-${p.id}`}
                    className={open ? "rowlist__item--open" : undefined}
                  >
                    <span
                      className={`row__avatar row__avatar--${p.kind === "insurance" ? "professional" : p.kind}`}
                      aria-hidden
                    >
                      {p.kind === "clinic" ? (
                        <ClinicIcon />
                      ) : (
                        <StethoscopeIcon />
                      )}
                    </span>
                    <span className="row__main">
                      <span className="row__name">{p.name}</span>
                      <span className="row__sub">
                        <Badge tone={badgeToneForKind(p.kind)}>
                          {th.ops.kind[p.kind]}
                        </Badge>
                        <code className="row__id">{p.id.slice(0, 8)}…</code>
                      </span>
                      {open && (
                        <dl className="row__detail">
                          {p.licenceNo ? (
                            <>
                              <dt>{th.ops.licence}</dt>
                              <dd>{p.licenceNo}</dd>
                            </>
                          ) : null}
                          {p.address ? (
                            <>
                              <dt>{th.ops.address}</dt>
                              <dd>{p.address}</dd>
                            </>
                          ) : null}
                          {p.profession ? (
                            <>
                              <dt>{th.ops.profession}</dt>
                              <dd>{professionLabel(p.profession)}</dd>
                            </>
                          ) : null}
                          <dt>{th.ops.entityId}</dt>
                          <dd>
                            <code>{p.id}</code>
                          </dd>
                        </dl>
                      )}
                    </span>
                    <span className="row__actions">
                      <Button
                        variant="subtle"
                        aria-expanded={open}
                        aria-label={
                          open ? th.a11y.collapseRow : th.a11y.expandRow
                        }
                        onClick={() => setExpandedId(open ? null : p.id)}
                      >
                        {open ? th.common.hideDetails : th.common.details}
                      </Button>
                      <Button
                        data-testid="verify-btn"
                        variant="primary"
                        busy={busyId === p.id}
                        disabled={busyId !== null && busyId !== p.id}
                        onClick={() =>
                          setConfirm({
                            type: "verify",
                            kind: p.kind,
                            id: p.id,
                            name: p.name,
                          })
                        }
                      >
                        {th.ops.verify}
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </SectionBlock>

        <SectionBlock title={th.ops.openCases} count={cases.length}>
          <div className="card">
            <ul
              data-testid="cases-list"
              className="rowlist"
              aria-busy={loading || undefined}
            >
              {loading &&
                cases.length === 0 &&
                Array.from({ length: 2 }).map((_, i) => (
                  <li key={i} className="rowlist__skeleton" aria-hidden>
                    <Skeleton variant="chip" />
                    <span className="row__main">
                      <Skeleton variant="line" />
                    </span>
                  </li>
                ))}
              {!loading && cases.length === 0 && (
                <EmptyState
                  as="li"
                  title={th.ops.emptyCases}
                  description={th.ops.emptyCasesHint}
                  icon={<CheckIcon />}
                />
              )}
              {cases.map((c) => {
                const refId = c.refId;
                const hint = th.ops.caseHint[c.kind];
                return (
                  <li key={c.id} data-testid={`case-${c.id}`}>
                    <Badge tone={badgeToneForKind(c.kind)}>
                      {th.ops.caseKind[c.kind] ?? c.kind}
                    </Badge>
                    <span className="row__main">
                      <span className="row__name">
                        {c.subject || (th.ops.caseState[c.state] ?? c.state)}
                      </span>
                      <span className="row__sub">
                        {c.subject ? (
                          <span className="muted">
                            {th.ops.caseState[c.state] ?? c.state}
                          </span>
                        ) : null}
                        {refId && (
                          <code className="row__id">{refId.slice(0, 8)}…</code>
                        )}
                      </span>
                      {hint ? (
                        <span className="row__hint muted">{hint}</span>
                      ) : null}
                    </span>
                    {c.kind === "credential_hold" && refId ? (
                      <span className="row__actions">
                        <Button
                          data-testid="resolve-btn"
                          busy={busyId === refId}
                          disabled={busyId !== null && busyId !== refId}
                          onClick={() =>
                            setConfirm({
                              type: "resolve",
                              bookingId: refId,
                              subject: c.subject,
                            })
                          }
                        >
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

        <SectionBlock title={th.ops.activeBookings} count={bookings.length}>
          <div className="card">
            <ul
              data-testid="active-bookings"
              className="rowlist"
              aria-busy={loading || undefined}
            >
              {loading &&
                bookings.length === 0 &&
                Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="rowlist__skeleton" aria-hidden>
                    <Skeleton variant="avatar" />
                    <span className="row__main">
                      <Skeleton variant="line" />
                      <Skeleton variant="line-short" />
                    </span>
                  </li>
                ))}
              {!loading && bookings.length === 0 && (
                <EmptyState
                  as="li"
                  title={th.ops.emptyActive}
                  icon={<CheckIcon />}
                />
              )}
              {bookings.map((b) => (
                <li key={b.bookingId} data-testid={`active-${b.bookingId}`}>
                  <span
                    className="row__avatar row__avatar--professional"
                    aria-hidden
                  >
                    <StethoscopeIcon />
                  </span>
                  <span className="row__main">
                    <span className="row__name">{b.professionalName}</span>
                    <span className="row__sub">
                      <Badge tone="info">{statusLabel(b.state)}</Badge>
                      <span className="muted">{b.clinicName}</span>
                      {b.held && (
                        <Badge tone="warning">{th.ops.heldBadge}</Badge>
                      )}
                      {b.credential === "Suspended" && (
                        <Badge tone="danger">{th.ops.suspendedBadge}</Badge>
                      )}
                    </span>
                  </span>
                  <span className="row__actions actions">
                    {!b.held && (
                      <Button
                        data-testid="hold-btn"
                        busy={busyId === b.bookingId}
                        disabled={busyId !== null && busyId !== b.bookingId}
                        onClick={() =>
                          setConfirm({
                            type: "hold",
                            bookingId: b.bookingId,
                            name: b.professionalName,
                          })
                        }
                      >
                        {th.ops.holdCredential}
                      </Button>
                    )}
                    {b.credential !== "Suspended" && (
                      <Button
                        data-testid="suspend-btn"
                        variant="subtle"
                        busy={busyId === `suspend-${b.professionalId}`}
                        disabled={
                          busyId !== null &&
                          busyId !== `suspend-${b.professionalId}`
                        }
                        onClick={() =>
                          setConfirm({
                            type: "suspend",
                            professionalId: b.professionalId,
                            name: b.professionalName,
                          })
                        }
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
      </main>

      <Dialog
        open={confirm !== null}
        title={
          confirm?.type === "verify"
            ? th.ops.verifyConfirmTitle
            : confirm?.type === "resolve"
              ? th.ops.resolveConfirmTitle
              : confirm?.type === "hold"
                ? th.party.holdConfirmTitle
                : th.party.suspendConfirmTitle
        }
        confirmLabel={
          confirm?.type === "verify"
            ? th.ops.verify
            : confirm?.type === "resolve"
              ? th.ops.resolveHold
              : confirm?.type === "hold"
                ? th.ops.holdCredential
                : th.ops.suspend
        }
        busy={confirm !== null && busyId !== null}
        onCancel={() => {
          if (busyId === null) setConfirm(null);
        }}
        onConfirm={() => void runConfirm()}
      >
        {confirm?.type === "verify" ? (
          <p>
            {th.ops.verifyConfirmBody(
              confirm.name,
              th.ops.kind[confirm.kind] ?? confirm.kind,
            )}
          </p>
        ) : confirm?.type === "resolve" ? (
          <p>{th.ops.resolveConfirmBody(confirm.subject)}</p>
        ) : confirm?.type === "hold" ? (
          <p>{th.party.holdConfirmBody}</p>
        ) : confirm?.type === "suspend" ? (
          <p>{th.party.suspendConfirmBody(confirm.name)}</p>
        ) : null}
      </Dialog>
    </>
  );
}

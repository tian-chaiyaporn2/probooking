"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getReconciliation,
  fetchFinanceExport,
  proposeRefund,
  getPendingRefunds,
  approveRefund,
  formatThb,
  type Reconciliation,
  type ReconciliationRow,
  type PendingApproval,
} from "../../lib/api";
import { AppHeader } from "../../components/AppHeader";
import { Stat } from "../../components/Stat";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { DataTable, type Column } from "../../components/DataTable";
import { PageHeader } from "../../components/PageHeader";
import { SectionBlock } from "../../components/SectionBlock";
import { StatSkeletonGrid } from "../../components/Skeleton";
import { RefreshIcon, DownloadIcon, CheckIcon, AlertIcon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { StaffLogin } from "../../components/StaffLogin";
import { th, getThaiErrorMessage } from "../../lib/strings";
import { loadSession, clearSession } from "../../lib/demo-accounts";

const MAX_ROWS = 25;

/** Finance dashboard (ADM-01, PAY-11): reconciles each payment order against captured funds. */
export default function FinancePage() {
  const [data, setData] = useState<Reconciliation | null>(null);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // The reconciliation row a refund is being proposed against (null = form closed).
  const [refundFor, setRefundFor] = useState<{ bookingId: string; captured: number } | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const toast = useToast();
  const loadSeq = useRef(0);

  const signOut = useCallback(() => {
    loadSeq.current += 1;
    clearSession();
    setToken(null);
    setData(null);
    setPending([]);
    setRefundFor(null);
    setLoadError(null);
    setLoading(false);
    setExporting(false);
  }, []);

  // Honor a picker-created session (see /ops for the rationale).
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
      const [next, approvals] = await Promise.all([getReconciliation(token), getPendingRefunds(token)]);
      if (seq !== loadSeq.current) return;
      setData(next);
      setPending(approvals.pending);
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

  async function exportCsv() {
    if (!token) return;
    const auth = token;
    setExporting(true);
    try {
      const csv = await fetchFinanceExport(auth);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "finance-export.csv";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success(th.finance.exportStarted);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  async function submitRefund() {
    if (!token || !refundFor) return;
    const auth = token;
    const satang = Math.round(Number(refundAmount) * 100);
    setBusy(true);
    try {
      await proposeRefund(refundFor.bookingId, satang, refundReason || "goodwill", auth);
      setRefundFor(null);
      setRefundAmount("");
      setRefundReason("");
      await load();
      toast.success(th.finance.refundProposed);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    if (!token) return;
    const auth = token;
    setBusy(true);
    try {
      await approveRefund(id, auth);
      await load();
      toast.success(th.finance.refundApproved);
    } catch (e) {
      // §6.4: the initiator (or an unauthorized approver) is rejected here — surface it.
      toast.error(getThaiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const s = data?.summary;
  const rows = data?.rows ?? [];
  const shown = rows.slice(0, MAX_ROWS);

  const columns: Column<ReconciliationRow>[] = [
    { key: "booking", header: th.finance.colBooking, render: (r) => <span>{r.bookingId ? r.bookingId.slice(0, 8) : "—"}</span> },
    { key: "captured", header: th.finance.captured, align: "right", render: (r) => formatThb(r.captured) },
    { key: "payouts", header: th.finance.payouts, align: "right", render: (r) => formatThb(r.payouts) },
    { key: "refunds", header: th.finance.refunds, align: "right", render: (r) => formatThb(r.refunds) },
    { key: "undistributed", header: th.finance.colUndistributed, align: "right", render: (r) => formatThb(r.undistributed) },
    {
      key: "conserved",
      header: th.finance.colConserved,
      render: (r) =>
        r.conserved ? (
          <Badge tone="success">
            <CheckIcon /> {th.finance.conservedYes}
          </Badge>
        ) : (
          <Badge tone="warning">
            <AlertIcon /> {th.finance.conservedNo}
          </Badge>
        ),
    },
    {
      key: "refund",
      header: "",
      render: (r) =>
        r.bookingId && r.captured - r.refunds > 0 ? (
          <Button
            data-testid="refund-btn"
            variant="subtle"
            onClick={() => {
              setRefundFor({ bookingId: r.bookingId!, captured: r.captured - r.refunds });
              setRefundAmount("");
              setRefundReason("");
            }}
          >
            {th.finance.refund}
          </Button>
        ) : null,
    },
  ];

  if (!token) {
    return (
      <>
        <AppHeader current="/finance" />
        <StaffLogin surface="finance" onToken={setToken} />
      </>
    );
  }

  return (
    <>
      <AppHeader current="/finance" />
      <main id="main" className="page page--finance">
        <PageHeader
          title={th.finance.title}
          subtitle={th.finance.subtitle}
          actions={
            <>
              <Button data-testid="refresh" onClick={() => void load()} disabled={loading || exporting} icon={<RefreshIcon />}>
                {th.common.refresh}
              </Button>
              <Button
                data-testid="export-csv"
                variant="primary"
                onClick={() => void exportCsv()}
                busy={exporting}
                disabled={loading}
                icon={<DownloadIcon />}
              >
                {th.finance.exportCsv}
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

        {s && (
          <p className="finance-summary muted" data-testid="finance-summary">
            {th.finance.summaryLine(formatThb(s.captured), formatThb(s.payouts), s.exceptions)}
          </p>
        )}
        <p className="muted" style={{ fontSize: "0.82rem", marginTop: 0 }}>{th.finance.conservationHelp}</p>

        {loading && !s ? (
          <StatSkeletonGrid count={5} testid="fin-summary" />
        ) : (
          <div className="stat-grid" data-testid="fin-summary">
            {s ? (
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
            ) : null}
          </div>
        )}

        <SectionBlock id="finance-recon" title={th.finance.reconciliation} count={s ? rows.length : undefined}>
          <DataTable
            columns={columns}
            rows={shown}
            rowKey={(r) => r.paymentOrderId}
            loading={loading}
            empty={rows.length === 0 ? th.finance.emptyRecon : th.common.emptyTable}
            bodyTestid="reconciliation-rows"
            caption={th.a11y.reconciliationTable}
          />
        </SectionBlock>
        {rows.length > MAX_ROWS && (
          <p data-testid="rows-truncated" className="muted table-truncated">
            {th.finance.showing(shown.length, rows.length)}
          </p>
        )}

        {/* Pending refund approvals — §6.4 dual control: a second finance person executes. */}
        <SectionBlock title={th.finance.pendingApprovals} count={pending.length}>
          <div className="card">
            <ul className="rowlist" data-testid="approvals-list">
              {pending.length === 0 && <li className="empty">{th.finance.emptyApprovals}</li>}
              {pending.map((a) => (
                <li key={a.id} data-testid={`approval-${a.id}`}>
                  <span className="row__main">
                    <span className="row__name">{formatThb(a.amount)}</span>
                    <span className="row__sub muted">
                      {a.reason} · {th.finance.proposedBy} {a.initiatorId.slice(0, 10)} · {new Date(a.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                    </span>
                  </span>
                  <span className="row__actions">
                    <Button data-testid="approve-btn" variant="primary" busy={busy} onClick={() => void approve(a.id)}>
                      {th.finance.approve}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </SectionBlock>
      </main>

      {/* Propose-refund dialog, opened from a reconciliation row. */}
      {refundFor && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={th.finance.refundTitle} data-testid="refund-form">
          <div className="modal card card--pad">
            <h2 style={{ marginTop: 0 }}>{th.finance.refundTitle}</h2>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              {th.finance.colBooking} {refundFor.bookingId.slice(0, 8)} · {th.finance.refundMax(formatThb(refundFor.captured))}
            </p>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem", marginBottom: "var(--s3)" }}>
              {th.finance.refundAmount}
              <input
                data-testid="refund-amount"
                inputMode="decimal"
                value={refundAmount}
                onChange={(e) => {
                  // Allow baht with up to two decimal places (satang); keep only the first dot.
                  let v = e.target.value.replace(/[^0-9.]/g, "");
                  const dot = v.indexOf(".");
                  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "").slice(0, 2);
                  setRefundAmount(v);
                }}
                style={{ padding: "0.5rem 0.7rem", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem", marginBottom: "var(--s4)" }}>
              {th.finance.refundReason}
              <input
                data-testid="refund-reason"
                value={refundReason}
                placeholder={th.finance.refundReasonPlaceholder}
                onChange={(e) => setRefundReason(e.target.value)}
                style={{ padding: "0.5rem 0.7rem", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)" }}
              />
            </label>
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <Button variant="subtle" onClick={() => setRefundFor(null)}>
                {th.finance.cancel}
              </Button>
              <Button
                data-testid="refund-submit"
                variant="primary"
                busy={busy}
                disabled={!(Number(refundAmount) > 0)}
                onClick={() => void submitRefund()}
              >
                {th.finance.propose}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

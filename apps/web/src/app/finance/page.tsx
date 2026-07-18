"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getReconciliation,
  fetchFinanceExport,
  logout,
  formatThb,
  type Reconciliation,
  type ReconciliationRow,
} from "../../lib/api";
import { AppHeader } from "../../components/AppHeader";
import { Stat } from "../../components/Stat";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/PageHeader";
import { SectionBlock } from "../../components/SectionBlock";
import { EmptyState } from "../../components/EmptyState";
import { StatSkeletonGrid } from "../../components/Skeleton";
import { KeyValueTable } from "../../components/KeyValueTable";
import { RefreshIcon, DownloadIcon, CheckIcon, AlertIcon, InboxIcon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { StaffLogin } from "../../components/StaffLogin";
import { th, getThaiErrorMessage } from "../../lib/strings";
import { clearStaffSession, loadStaffSession, saveStaffSession } from "../../lib/session";

const MAX_ROWS = 25;

/** Finance dashboard (ADM-01, PAY-11): reconciles each payment order against captured funds. */
export default function FinancePage() {
  const [data, setData] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const toast = useToast();
  const loadSeq = useRef(0);

  useEffect(() => {
    const saved = loadStaffSession("finance");
    if (saved) setToken(saved.token);
    setBooting(false);
  }, []);

  const acceptToken = useCallback((next: string) => {
    saveStaffSession("finance", next);
    setSessionNotice(null);
    setToken(next);
  }, []);

  const signOut = useCallback(async () => {
    loadSeq.current += 1;
    const previous = token;
    setToken(null);
    setData(null);
    setLoadError(null);
    setLoading(false);
    setExporting(false);
    clearStaffSession("finance");
    if (previous) {
      try {
        await logout(previous);
      } catch {
        // Best-effort revoke.
      }
    }
  }, [token]);

  const expireSession = useCallback(() => {
    clearStaffSession("finance");
    setToken(null);
    setSessionNotice(th.staffLogin.sessionExpiredBanner);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const next = await getReconciliation(token);
      if (seq !== loadSeq.current) return;
      setData(next);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      const msg = getThaiErrorMessage(e);
      setLoadError(msg);
      toast.error(msg);
      const raw = e instanceof Error ? e.message.toLowerCase() : "";
      if (raw.includes("403") || raw.includes("401") || raw.includes("forbidden") || raw.includes("authentication")) {
        expireSession();
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [token, toast, expireSession]);

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
      toast.success("กำลังดาวน์โหลด finance-export.csv");
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  const s = data?.summary;
  const allRows = data?.rows ?? [];
  const filtered = exceptionsOnly ? allRows.filter((r) => !r.conserved) : allRows;
  const shown = filtered.slice(0, MAX_ROWS);

  if (booting) {
    return (
      <>
        <AppHeader current="/finance" />
        <main id="main" className="page">
          <p className="muted">{th.common.loading}</p>
        </main>
      </>
    );
  }

  if (!token) {
    return (
      <>
        <AppHeader current="/finance" />
        <StaffLogin surface="finance" onToken={acceptToken} sessionNotice={sessionNotice} />
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
              <Button data-testid="sign-out" variant="subtle" onClick={() => void signOut()}>
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

        <SectionBlock id="finance-recon" title={th.finance.reconciliation} count={s ? filtered.length : undefined}>
          <div className="filter-bar" role="group" aria-label={th.finance.filterAll}>
            <Button
              variant={!exceptionsOnly ? "primary" : "subtle"}
              data-testid="filter-all"
              onClick={() => setExceptionsOnly(false)}
            >
              {th.finance.filterAll}
            </Button>
            <Button
              variant={exceptionsOnly ? "primary" : "subtle"}
              data-testid="filter-exceptions"
              onClick={() => setExceptionsOnly(true)}
            >
              {th.finance.filterExceptions}
            </Button>
          </div>

          <div className="table-scroll" tabIndex={0} role="region" aria-label={th.a11y.reconciliationTable}>
            <table className="data-table">
              <caption className="sr-only">{th.a11y.reconciliationTable}</caption>
              <thead>
                <tr>
                  <th scope="col">{th.finance.colBooking}</th>
                  <th scope="col" className="num">
                    {th.finance.captured}
                  </th>
                  <th scope="col" className="num">
                    {th.finance.payouts}
                  </th>
                  <th scope="col" className="num">
                    {th.finance.refunds}
                  </th>
                  <th scope="col" className="num">
                    {th.finance.colUndistributed}
                  </th>
                  <th scope="col">{th.finance.colConserved}</th>
                  <th scope="col">
                    <span className="sr-only">{th.common.details}</span>
                  </th>
                </tr>
              </thead>
              <tbody data-testid="reconciliation-rows">
                {loading && shown.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState title={th.common.loading} />
                    </td>
                  </tr>
                ) : shown.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        title={th.common.emptyTable}
                        description={th.finance.emptyHint}
                        icon={<InboxIcon />}
                      />
                    </td>
                  </tr>
                ) : (
                  shown.map((r) => (
                    <FinanceRow
                      key={r.paymentOrderId}
                      row={r}
                      expanded={expandedId === r.paymentOrderId}
                      onToggle={() =>
                        setExpandedId((id) => (id === r.paymentOrderId ? null : r.paymentOrderId))
                      }
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionBlock>
        {filtered.length > MAX_ROWS && (
          <p data-testid="rows-truncated" className="muted table-truncated">
            {th.finance.showing(shown.length, filtered.length)}
          </p>
        )}
      </main>
    </>
  );
}

function FinanceRow({
  row,
  expanded,
  onToggle,
}: {
  row: ReconciliationRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr data-testid={`recon-${row.paymentOrderId}`}>
        <td>
          <code>{(row.bookingId ?? "—").slice(0, 8)}</code>
        </td>
        <td className="num">{formatThb(row.captured)}</td>
        <td className="num">{formatThb(row.payouts)}</td>
        <td className="num">{formatThb(row.refunds)}</td>
        <td className="num">{formatThb(row.undistributed)}</td>
        <td>
          {row.conserved ? (
            <Badge tone="success">
              <CheckIcon /> {th.finance.conservedYes}
            </Badge>
          ) : (
            <Badge tone="warning">
              <AlertIcon /> {th.finance.conservedNo}
            </Badge>
          )}
        </td>
        <td>
          <Button
            variant="subtle"
            data-testid={`recon-expand-${row.paymentOrderId}`}
            aria-expanded={expanded}
            aria-label={expanded ? th.a11y.collapseRow : th.a11y.expandRow}
            onClick={onToggle}
          >
            {expanded ? th.common.hideDetails : th.common.details}
          </Button>
        </td>
      </tr>
      {expanded ? (
        <tr className="data-table__detail" data-testid={`recon-detail-${row.paymentOrderId}`}>
          <td colSpan={7}>
            <div className="recon-detail">
              <p className="recon-detail__title">{th.finance.legsTitle}</p>
              <KeyValueTable
                caption={th.finance.legsTitle}
                rows={[
                  { label: th.finance.colOrder, value: <code>{row.paymentOrderId}</code> },
                  { label: th.finance.colBooking, value: <code>{row.bookingId ?? "—"}</code> },
                  { label: th.finance.captured, value: formatThb(row.captured) },
                  { label: th.finance.payouts, value: formatThb(row.payouts) },
                  { label: th.finance.refunds, value: formatThb(row.refunds) },
                  { label: th.finance.colUndistributed, value: formatThb(row.undistributed), total: true },
                ]}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

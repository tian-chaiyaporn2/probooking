"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getReconciliation,
  fetchFinanceExport,
  formatThb,
  type Reconciliation,
  type ReconciliationRow,
} from "../../lib/api";
import { AppHeader } from "../../components/AppHeader";
import { Stat } from "../../components/Stat";
import { Button } from "../../components/Button";
import { DataTable, type Column } from "../../components/DataTable";
import { RefreshIcon, DownloadIcon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { StaffLogin } from "../../components/StaffLogin";
import { th, getThaiErrorMessage } from "../../lib/strings";

const MAX_ROWS = 25;

/** Finance dashboard (ADM-01, PAY-11): reconciles each payment order against captured funds. */
export default function FinancePage() {
  const [data, setData] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const toast = useToast();
  const loadSeq = useRef(0);

  const signOut = useCallback(() => {
    setToken(null);
    setData(null);
    setLoadError(null);
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
    try {
      const csv = await fetchFinanceExport(token!);
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
    }
  }

  const s = data?.summary;
  const rows = data?.rows ?? [];
  const shown = rows.slice(0, MAX_ROWS);

  const columns: Column<ReconciliationRow>[] = [
    { key: "booking", header: th.finance.colBooking, render: (r) => <code>{(r.bookingId ?? "—").slice(0, 8)}</code> },
    { key: "captured", header: th.finance.captured, align: "right", render: (r) => formatThb(r.captured) },
    { key: "payouts", header: th.finance.payouts, align: "right", render: (r) => formatThb(r.payouts) },
    { key: "refunds", header: th.finance.refunds, align: "right", render: (r) => formatThb(r.refunds) },
    { key: "undistributed", header: th.finance.colUndistributed, align: "right", render: (r) => formatThb(r.undistributed) },
    {
      key: "conserved",
      header: th.finance.colConserved,
      render: (r) =>
        r.conserved ? (
          <span className="badge badge--success" aria-label="conserved">✓</span>
        ) : (
          <span className="badge badge--warn" aria-label="exception">✗ {th.finance.exceptions}</span>
        ),
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
      <main className="page" style={{ maxWidth: 1040 }}>
        <div className="actions" style={{ justifyContent: "space-between", marginBottom: "var(--s5)" }}>
          <h1 style={{ margin: 0 }}>{th.finance.title}</h1>
          <div className="actions">
            <Button data-testid="refresh" onClick={() => void load()} icon={<RefreshIcon />}>
              {th.common.refresh}
            </Button>
            <Button data-testid="export-csv" variant="primary" onClick={() => void exportCsv()} icon={<DownloadIcon />}>
              {th.finance.exportCsv}
            </Button>
            <Button data-testid="sign-out" variant="subtle" onClick={signOut}>
              {th.staffLogin.signOut}
            </Button>
          </div>
        </div>

        {loadError && !s && (
          <p role="alert" style={{ color: "var(--danger)" }}>
            {loadError}
          </p>
        )}

        <div className="stat-grid" data-testid="fin-summary">
          {loading && !s ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="stat skeleton" style={{ height: 66 }} />)
          ) : s ? (
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

        <div style={{ marginTop: "var(--s5)" }}>
          <DataTable
            columns={columns}
            rows={shown}
            rowKey={(r) => r.paymentOrderId}
            loading={loading}
            empty={th.common.none}
            bodyTestid="reconciliation-rows"
          />
        </div>
        {rows.length > MAX_ROWS && (
          <p data-testid="rows-truncated" className="muted" style={{ fontSize: "0.8rem", marginTop: "var(--s3)" }}>
            {th.finance.showing(shown.length, rows.length)}
          </p>
        )}
      </main>
    </>
  );
}

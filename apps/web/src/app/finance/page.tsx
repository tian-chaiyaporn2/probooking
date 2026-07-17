"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getReconciliation,
  getDevToken,
  setAuthToken,
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
import { th } from "../../lib/strings";

const MAX_ROWS = 25;

/** Finance dashboard (ADM-01, PAY-11): reconciles each payment order against captured funds. */
export default function FinancePage() {
  const [data, setData] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);
  const toast = useToast();

  const ensureFinanceToken = useCallback(async () => {
    if (!tokenRef.current) tokenRef.current = (await getDevToken("finance")).token;
    setAuthToken(tokenRef.current);
  }, []);

  const load = useCallback(async () => {
    try {
      await ensureFinanceToken();
      setData(await getReconciliation());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ensureFinanceToken, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv() {
    try {
      await ensureFinanceToken();
      const csv = await fetchFinanceExport();
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
      toast.error((e as Error).message);
    }
  }

  const s = data?.summary;
  const rows = data?.rows ?? [];
  const shown = rows.slice(0, MAX_ROWS);

  const columns: Column<ReconciliationRow>[] = [
    {
      key: "booking",
      header: th.finance.colBooking,
      mobileTitle: true,
      render: (r) => <code>{(r.bookingId ?? "—").slice(0, 8)}</code>,
    },
    { key: "captured", header: th.finance.captured, align: "right", render: (r) => formatThb(r.captured) },
    { key: "payouts", header: th.finance.payouts, align: "right", render: (r) => formatThb(r.payouts) },
    { key: "refunds", header: th.finance.refunds, align: "right", render: (r) => formatThb(r.refunds) },
    { key: "undistributed", header: th.finance.colUndistributed, align: "right", render: (r) => formatThb(r.undistributed) },
    {
      key: "conserved",
      header: th.finance.colConserved,
      render: (r) =>
        r.conserved ? (
          <span className="badge badge--success" aria-label={th.finance.conservedYes}>✓</span>
        ) : (
          <span className="badge badge--warn" aria-label={th.finance.conservedNo}>✗ {th.finance.exceptions}</span>
        ),
    },
  ];

  return (
    <>
      <AppHeader current="/finance" />
      <main id="main-content" tabIndex={-1} className="page page--finance">
        <div className="page-toolbar">
          <h1 className="page-toolbar__title">{th.finance.title}</h1>
          <div className="page-toolbar__actions">
            <Button data-testid="refresh" onClick={() => void load()} icon={<RefreshIcon />}>
              {th.common.refresh}
            </Button>
            <Button data-testid="export-csv" variant="primary" onClick={() => void exportCsv()} icon={<DownloadIcon />}>
              {th.finance.exportCsv}
            </Button>
          </div>
        </div>

        <div className="stat-grid" data-testid="fin-summary">
          {loading || !s ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="stat skeleton skeleton--stat" />)
          ) : (
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
          )}
        </div>

        <div className="section-block">
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
          <p data-testid="rows-truncated" className="muted caption">
            {th.finance.showing(shown.length, rows.length)}
          </p>
        )}
      </main>
    </>
  );
}

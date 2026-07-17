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
import { AppHeader } from "../../lib/AppHeader";
import { Stat } from "../../lib/ui";
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
      toast.success("กำลังดาวน์โหลด finance-export.csv");
    } catch (e) {
      toast.error((e as Error).message);
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
          </div>
        </div>

        <div className="stat-grid" data-testid="fin-summary">
          {loading || !s ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="stat skeleton" style={{ height: 66 }} />)
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

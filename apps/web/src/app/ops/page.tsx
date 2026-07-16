"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getOpsPending,
  getOpsCases,
  verifyClinic,
  verifyProfessional,
  resolveHold,
  getDevToken,
  setAuthToken,
  type CaseSummary,
  type PendingVerification,
} from "../../lib/api";

/** Ensure the dashboard holds an operations token before any guarded call. */
async function ensureOpsToken() {
  const { token } = await getDevToken("operations");
  setAuthToken(token);
}

/**
 * Operations dashboard (ADM-01). Internal tool that calls controlled API actions:
 * verify pending clinics/professionals and resolve credential holds. In production
 * this is a separate, access-controlled surface (MFA, least privilege — §3).
 */
export default function OpsPage() {
  const [pending, setPending] = useState<PendingVerification[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      await ensureOpsToken();
      setPending((await getOpsPending()).pending);
      setCases((await getOpsCases()).cases);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function verify(kind: "clinic" | "professional", id: string) {
    setBusy(true);
    try {
      if (kind === "clinic") await verifyClinic(id);
      else await verifyProfessional(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resolve(bookingId: string) {
    setBusy(true);
    try {
      await resolveHold(bookingId);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "3rem auto", padding: "0 1.5rem", fontFamily: "system-ui" }}>
      <h1>Operations dashboard</h1>
      <button data-testid="refresh" onClick={() => void load()} disabled={busy} style={btn("#555")}>
        Refresh
      </button>

      <h2 style={{ marginTop: "1.5rem" }}>Pending verifications ({pending.length})</h2>
      <ul data-testid="pending-list" style={{ lineHeight: 1.9, paddingLeft: 0, listStyle: "none" }}>
        {pending.length === 0 && <li style={{ color: "#888" }}>None</li>}
        {pending.map((p) => (
          <li key={p.id} data-testid={`pending-${p.id}`}>
            <span style={tag(p.kind === "clinic" ? "#06b" : "#849")}>{p.kind}</span>{" "}
            <code>{p.id.slice(0, 10)}…</code> {p.name}{" "}
            <button
              data-testid="verify-btn"
              onClick={() => void verify(p.kind, p.id)}
              disabled={busy}
              style={btn("#0b6")}
            >
              Verify
            </button>
          </li>
        ))}
      </ul>

      <h2 style={{ marginTop: "1.5rem" }}>Open cases ({cases.length})</h2>
      <ul data-testid="cases-list" style={{ lineHeight: 1.9, paddingLeft: 0, listStyle: "none" }}>
        {cases.length === 0 && <li style={{ color: "#888" }}>None</li>}
        {cases.map((c) => (
          <li key={c.id} data-testid={`case-${c.id}`}>
            <span style={tag("#c60")}>{c.kind}</span> <span style={{ color: "#0a5" }}>{c.state}</span>{" "}
            {c.refId && <code>{c.refId.slice(0, 10)}…</code>}{" "}
            {c.kind === "credential_hold" && c.refId && (
              <button
                data-testid="resolve-btn"
                onClick={() => void resolve(c.refId as string)}
                disabled={busy}
                style={btn("#0b6")}
              >
                Resolve hold
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p data-testid="error" style={{ color: "#c00" }}>
          Error: {error}
        </p>
      )}
    </main>
  );
}

const btn = (color: string): React.CSSProperties => ({
  padding: "0.2rem 0.7rem",
  borderRadius: 6,
  border: `1px solid ${color}`,
  background: color,
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.85rem",
});

const tag = (color: string): React.CSSProperties => ({
  background: color,
  color: "#fff",
  borderRadius: 4,
  padding: "0.05rem 0.4rem",
  fontSize: "0.8rem",
});

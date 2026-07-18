"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { BookingThread } from "../../components/BookingThread";
import { CheckoutSummary } from "../../components/CheckoutSummary";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/Toast";
import {
  getMe,
  getClinicShifts,
  getShiftCandidates,
  getClinicBookings,
  getProfessionalProfile,
  searchProfessionals,
  postShift,
  offerToProfessional,
  confirmOffer,
  acceptCompletion,
  cancelBooking,
  formatThb,
  type MeIdentity,
  type ClinicShiftRow,
  type Candidate,
  type PartyBooking,
  type ProfessionalSearchResult,
} from "../../lib/api";
import { checkoutFromCompensation } from "../../lib/checkout";
import { getThaiErrorMessage, th } from "../../lib/strings";
import { statusLabel, nextActionHint } from "../../lib/status";
import { loadSession, clearSession } from "../../lib/session";

export default function ClinicPage() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeIdentity | null>(null);
  const [shifts, setShifts] = useState<ClinicShiftRow[]>([]);
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [bookings, setBookings] = useState<PartyBooking[]>([]);
  const [comp, setComp] = useState("10000");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [profession, setProfession] = useState("");
  const [searchHits, setSearchHits] = useState<ProfessionalSearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);

  const clinic =
    me?.clinics.find((c) => c.role === "clinic_owner") ??
    me?.clinics[0] ??
    null;

  const load = useCallback(async (workspaceId: string, tok: string) => {
    const [s, b] = await Promise.all([
      getClinicShifts(workspaceId, tok),
      getClinicBookings(workspaceId, tok),
    ]);
    setShifts(s.shifts);
    setBookings(b.bookings);
    const withCands = s.shifts.filter(
      (x) => x.candidateCount > 0 && !x.offer && !x.booked,
    );
    const cs = await Promise.all(
      withCands.map((x) =>
        getShiftCandidates(x.shiftId, tok)
          .then((r) => [x.shiftId, r.candidates] as const)
          .catch(() => [x.shiftId, [] as Candidate[]] as const),
      ),
    );
    setCandidates(Object.fromEntries(cs));
    const ids = new Set(
      cs.flatMap(([, list]) => list.map((c) => c.professionalId)),
    );
    const profiles = await Promise.all(
      [...ids].map((id) =>
        getProfessionalProfile(id)
          .then((p) => [id, p.selfDeclared.displayName] as const)
          .catch(() => [id, id.slice(0, 8)] as const),
      ),
    );
    setNames(Object.fromEntries(profiles));
  }, []);

  useEffect(() => {
    const sess = loadSession();
    if (!sess) return;
    setToken(sess.token);
    getMe(sess.token)
      .then(setMe)
      .catch((e) => toast.error(getThaiErrorMessage(e)));
  }, [toast]);

  useEffect(() => {
    if (clinic && token)
      void load(clinic.workspaceId, token).catch((e) =>
        toast.error(getThaiErrorMessage(e)),
      );
  }, [clinic, token, load, toast]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      if (clinic && token) await load(clinic.workspaceId, token);
      toast.success(ok);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runSearch() {
    setSearchBusy(true);
    try {
      const r = await searchProfessionals(
        profession.trim() ? { profession: profession.trim() } : {},
      );
      setSearchHits(r.professionals);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setSearchBusy(false);
    }
  }

  function signOut() {
    clearSession();
    setToken(null);
  }

  if (!token) {
    return (
      <>
        <AppHeader current="/clinic" />
        <main
          id="main"
          className="page"
          style={{ maxWidth: 460, textAlign: "center" }}
        >
          <p className="muted" style={{ marginTop: "2rem" }}>
            {th.party.signInPromptClinic}
          </p>
          <Link href="/signin" className="btn btn--primary btn--lg">
            {th.party.pickAccount}
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader current="/clinic" />
      <main id="main" className="page" style={{ maxWidth: 880 }}>
        <div
          className="actions"
          style={{ justifyContent: "space-between", marginBottom: "var(--s5)" }}
        >
          <div>
            <h1 style={{ margin: 0 }}>{clinic?.name ?? "คลินิก"}</h1>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              เจ้าของคลินิก ·{" "}
              {clinic ? (
                <Badge tone="success">{statusLabel(clinic.verification)}</Badge>
              ) : null}
            </span>
          </div>
          <span className="actions">
            <Link href="/signin" className="btn btn--subtle">
              {th.party.switchRole}
            </Link>
            <Button variant="subtle" onClick={signOut}>
              {th.staffLogin.signOut}
            </Button>
          </span>
        </div>

        <div className="card card--pad" style={{ marginBottom: "var(--s5)" }}>
          <h2 style={{ marginTop: 0 }}>{th.party.postShift}</h2>
          <div
            className="actions"
            style={{ gap: "var(--s3)", alignItems: "flex-end" }}
          >
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: "0.85rem",
              }}
            >
              {th.party.compensationBaht}
              <input
                data-testid="shift-comp"
                inputMode="numeric"
                value={comp}
                onChange={(e) => setComp(e.target.value.replace(/[^0-9]/g, ""))}
                style={{
                  padding: "0.5rem 0.7rem",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  width: 140,
                }}
              />
            </label>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.9rem",
              }}
            >
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
              />{" "}
              {th.party.urgent}
            </label>
            <Button
              data-testid="post-shift"
              variant="primary"
              busy={busy}
              disabled={!comp || Number(comp) <= 0}
              onClick={() =>
                void run(
                  () =>
                    postShift(
                      {
                        clinicWorkspaceId: clinic!.workspaceId,
                        compensation: Number(comp) * 100,
                        urgency: urgent ? "urgent" : "standard",
                      },
                      token,
                    ),
                  "ประกาศเวรแล้ว",
                )
              }
            >
              {th.party.postShift}
            </Button>
          </div>
          {Number(comp) > 0 ? (
            <div style={{ marginTop: "var(--s4)" }}>
              <CheckoutSummary
                checkout={checkoutFromCompensation(Number(comp) * 100)}
                protectedStamp={false}
              />
            </div>
          ) : null}
        </div>

        <div className="card card--pad" style={{ marginBottom: "var(--s5)" }}>
          <h2 style={{ marginTop: 0 }}>{th.party.searchPros}</h2>
          <div className="filter-bar">
            <label>
              {th.party.searchProfession}
              <input
                data-testid="pro-search-profession"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="physician"
              />
            </label>
            <Button
              data-testid="pro-search"
              busy={searchBusy}
              onClick={() => void runSearch()}
            >
              {th.party.searchGo}
            </Button>
          </div>
          <ul className="rowlist" data-testid="pro-search-results">
            {searchHits.length === 0 && (
              <li className="empty muted">{th.party.noProsFound}</li>
            )}
            {searchHits.slice(0, 12).map((p) => (
              <li key={p.id}>
                <span className="row__main">
                  <span className="row__name">{p.displayName}</span>
                  <span className="row__sub muted">
                    {p.profession}
                    {p.specialty ? ` · ${p.specialty}` : ""}
                    {p.rating != null ? ` · ★ ${p.rating.toFixed(1)}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <h2>
          {th.party.myShifts} ({shifts.length})
        </h2>
        <div className="card" style={{ marginBottom: "var(--s5)" }}>
          <ul className="rowlist" data-testid="clinic-shifts">
            {shifts.length === 0 && (
              <li className="empty">{th.party.noShifts}</li>
            )}
            {shifts.map((s) => (
              <li
                key={s.shiftId}
                data-testid={`shift-${s.shiftId}`}
                style={{ alignItems: "flex-start" }}
              >
                <span className="row__main">
                  <span className="row__name">
                    {formatThb(s.compensation)}{" "}
                    {s.urgency === "urgent" && <Badge tone="warn">ด่วน</Badge>}
                  </span>
                  <span className="row__sub muted">
                    {s.booked ? (
                      <Badge tone="success">{statusLabel("Confirmed")}</Badge>
                    ) : s.offer ? (
                      <Badge tone="info">{statusLabel(s.offer.state)}</Badge>
                    ) : (
                      <>
                        {th.party.candidates} {s.candidateCount} คน
                      </>
                    )}
                  </span>
                  {s.offer ? (
                    <span className="row__hint muted">
                      {nextActionHint(s.offer.state)}
                    </span>
                  ) : null}
                  {s.offer?.state === "AwaitingPayment" ? (
                    <div style={{ marginTop: "var(--s3)", maxWidth: 320 }}>
                      <CheckoutSummary
                        checkout={checkoutFromCompensation(s.compensation)}
                      />
                    </div>
                  ) : null}
                  {!s.booked &&
                    !s.offer &&
                    (candidates[s.shiftId]?.length ?? 0) > 0 && (
                      <span className="actions" style={{ marginTop: 6 }}>
                        {candidates[s.shiftId]!.map((c) => (
                          <Button
                            key={c.professionalId}
                            data-testid="send-offer"
                            busy={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  offerToProfessional(
                                    s.shiftId,
                                    c.professionalId,
                                    token,
                                  ),
                                "ส่งข้อเสนอแล้ว",
                              )
                            }
                          >
                            {th.party.sendOffer} →{" "}
                            {names[c.professionalId] ??
                              c.professionalId.slice(0, 6)}
                          </Button>
                        ))}
                      </span>
                    )}
                </span>
                {s.offer?.state === "AwaitingPayment" && (
                  <span className="row__actions">
                    <Button
                      data-testid="confirm-offer"
                      variant="primary"
                      busy={busy}
                      onClick={() =>
                        void run(
                          () => confirmOffer(s.offer!.id, token),
                          "ยืนยันและกันเงินแล้ว",
                        )
                      }
                    >
                      {th.party.confirmPay}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <h2>
          {th.party.myBookings} ({bookings.length})
        </h2>
        <div className="card">
          <ul className="rowlist" data-testid="clinic-bookings">
            {bookings.length === 0 && (
              <li className="empty">{th.party.noBookings}</li>
            )}
            {bookings.map((b) => (
              <li
                key={b.bookingId}
                data-testid={`booking-${b.bookingId}`}
                style={{ alignItems: "flex-start" }}
              >
                <span className="row__main">
                  <span className="row__name">{formatThb(b.total)}</span>
                  <span className="row__sub">
                    <Badge tone="info">{statusLabel(b.state)}</Badge>{" "}
                    <span className="muted">
                      {th.party.payoutLabel}: {statusLabel(b.payoutState)}
                    </span>
                  </span>
                  {nextActionHint(b.state) ? (
                    <span className="row__hint muted">
                      {nextActionHint(b.state)}
                    </span>
                  ) : null}
                  <div style={{ marginTop: "var(--s3)", maxWidth: 320 }}>
                    <CheckoutSummary
                      checkout={{
                        compensation: b.compensation,
                        serviceFee: b.serviceFee,
                        tax: b.tax,
                        total: b.total,
                      }}
                      protectedStamp={
                        b.state === "Confirmed" || b.state === "InProgress"
                      }
                    />
                  </div>
                  <div style={{ marginTop: "var(--s3)" }}>
                    <BookingThread
                      bookingId={b.bookingId}
                      token={token}
                      selfId={clinic?.workspaceId ?? null}
                    />
                  </div>
                </span>
                <span className="row__actions actions">
                  {b.state === "AwaitingCompletion" && (
                    <Button
                      data-testid="accept-completion"
                      variant="primary"
                      busy={busy}
                      onClick={() =>
                        void run(
                          () => acceptCompletion(b.bookingId, token),
                          "รับงานและจ่ายเงินแล้ว",
                        )
                      }
                    >
                      {th.party.acceptPayout}
                    </Button>
                  )}
                  {(b.state === "Confirmed" || b.state === "InProgress") && (
                    <Button
                      data-testid="cancel-booking"
                      busy={busy}
                      onClick={() => setCancelId(b.bookingId)}
                    >
                      {th.party.cancel}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <Dialog
        open={cancelId !== null}
        title={th.party.cancelConfirmTitle}
        confirmLabel={th.party.cancel}
        busy={busy}
        onCancel={() => {
          if (!busy) setCancelId(null);
        }}
        onConfirm={() => {
          if (!cancelId) return;
          void run(
            () => cancelBooking(cancelId, { reason: "ordinary" }, token),
            "ยกเลิกแล้ว",
          ).then(() => setCancelId(null));
        }}
      >
        <p>{th.party.cancelConfirmBody}</p>
      </Dialog>
    </>
  );
}

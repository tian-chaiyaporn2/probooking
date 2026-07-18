"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { buildCheckout, satang } from "@probook/domain";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import {
  getMe,
  getClinicShifts,
  getShiftCandidates,
  getClinicBookings,
  postShift,
  offerToProfessional,
  confirmOffer,
  acceptCompletion,
  cancelBooking,
  createReview,
  formatThb,
  type MeIdentity,
  type ClinicShiftRow,
  type Candidate,
  type PartyBooking,
} from "../../lib/api";
import { formatShiftWindow } from "../../lib/format-datetime";
import {
  labelBookingState,
  labelCategory,
  labelOfferState,
  labelPayoutState,
  labelProfession,
  labelShiftState,
  labelVerificationState,
} from "../../lib/status-labels";
import { getThaiErrorMessage, th } from "../../lib/strings";
import { loadSession, clearSession } from "../../lib/demo-accounts";

function shiftTitle(s: { category: string; startsAt: number; compensation: number }) {
  return `${labelCategory(s.category)} · ${formatShiftWindow(s.startsAt)}`;
}

function bookingTitle(b: PartyBooking) {
  return `${b.counterpartyName} · ${labelCategory(b.category)} · ${formatShiftWindow(b.shiftStart, b.shiftEnd)}`;
}

export default function ClinicPage() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeIdentity | null>(null);
  const [shifts, setShifts] = useState<ClinicShiftRow[]>([]);
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [bookings, setBookings] = useState<PartyBooking[]>([]);
  const [comp, setComp] = useState("10000");
  const [category, setCategory] = useState("general");
  const [startHours, setStartHours] = useState("48");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOfferId, setConfirmOfferId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewScore, setReviewScore] = useState(5);

  const clinic = me?.clinics.find((c) => c.role === "clinic_owner") ?? me?.clinics[0] ?? null;

  const load = useCallback(async (workspaceId: string, tok: string) => {
    const [s, b] = await Promise.all([getClinicShifts(workspaceId, tok), getClinicBookings(workspaceId, tok)]);
    setShifts(s.shifts);
    setBookings(b.bookings);
    const withCands = s.shifts.filter((x) => x.candidateCount > 0 && !x.offer && !x.booked);
    const cs = await Promise.all(
      withCands.map((x) =>
        getShiftCandidates(x.shiftId, tok)
          .then((r) => [x.shiftId, r.candidates] as const)
          .catch(() => [x.shiftId, [] as Candidate[]] as const),
      ),
    );
    setCandidates(Object.fromEntries(cs));
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
    if (clinic && token) void load(clinic.workspaceId, token).catch((e) => toast.error(getThaiErrorMessage(e)));
  }, [clinic, token, load, toast]);

  const actionShifts = useMemo(
    () => shifts.filter((s) => s.offer?.state === "AwaitingPayment" || (s.candidateCount > 0 && !s.booked && !s.offer)),
    [shifts],
  );
  const otherShifts = useMemo(() => shifts.filter((s) => !actionShifts.includes(s)), [shifts, actionShifts]);
  const actionBookings = useMemo(
    () => bookings.filter((b) => b.state === "AwaitingCompletion" || b.state === "Confirmed" || b.state === "InProgress"),
    [bookings],
  );
  const otherBookings = useMemo(() => bookings.filter((b) => !actionBookings.includes(b)), [bookings, actionBookings]);

  const confirmShift = shifts.find((s) => s.offer?.id === confirmOfferId);
  const confirmCheckout = confirmShift
    ? buildCheckout(satang(confirmShift.compensation))
    : null;

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

  if (!token) {
    return (
      <>
        <AppHeader current="/clinic" />
        <main className="page" style={{ maxWidth: 460, textAlign: "center" }}>
          <p className="muted" style={{ marginTop: "2rem" }}>{th.clinic.gate}</p>
          <Link href="/signin" className="btn btn--primary btn--lg">{th.clinic.gateCta}</Link>
        </main>
      </>
    );
  }

  const auth = token;

  function renderShift(s: ClinicShiftRow) {
    const status = s.booked
      ? labelShiftState(s.state, { booked: true })
      : s.offer
        ? labelOfferState(s.offer.state)
        : labelShiftState(s.state, { candidateCount: s.candidateCount });
    return (
      <li key={s.shiftId} data-testid={`shift-${s.shiftId}`} style={{ alignItems: "flex-start" }}>
        <span className="row__main">
          <span className="row__name">
            {shiftTitle(s)} {s.urgency === "urgent" && <Badge tone="warn">{th.clinic.urgent}</Badge>}
          </span>
          <span className="row__sub muted">
            {formatThb(s.compensation)} · <Badge tone="info">{status}</Badge>
            {s.offer?.professionalName && <span> · {s.offer.professionalName}</span>}
          </span>
          {!s.booked && !s.offer && (candidates[s.shiftId]?.length ?? 0) > 0 && (
            <span className="actions" style={{ marginTop: 6, flexWrap: "wrap" }}>
              {candidates[s.shiftId]!.map((c) => (
                <Button
                  key={c.professionalId}
                  data-testid="send-offer"
                  busy={busy}
                  onClick={() =>
                    void run(() => offerToProfessional(s.shiftId, c.professionalId, auth), th.clinic.offerSent)
                  }
                >
                  {th.clinic.sendOffer} → {c.displayName}
                  {c.verification === "Verified" && <Badge tone="success">{th.common.verified}</Badge>}
                  <span className="muted"> ({labelProfession(c.profession)})</span>
                </Button>
              ))}
            </span>
          )}
          {!s.booked && !s.offer && s.candidateCount > 0 && (candidates[s.shiftId]?.length ?? 0) === 0 && (
            <span className="muted" style={{ fontSize: "0.82rem" }}>{th.clinic.emptyCandidates}</span>
          )}
        </span>
        {s.offer?.state === "AwaitingPayment" && (
          <span className="row__actions">
            <Button data-testid="open-confirm-offer" variant="primary" busy={busy} onClick={() => setConfirmOfferId(s.offer!.id)}>
              {th.clinic.confirmPay}
            </Button>
          </span>
        )}
      </li>
    );
  }

  function renderBooking(b: PartyBooking) {
    return (
      <li key={b.bookingId} data-testid={`booking-${b.bookingId}`}>
        <span className="row__main">
          <span className="row__name">{bookingTitle(b)}</span>
          <span className="row__sub">
            {formatThb(b.total)} · <Badge tone="info">{labelBookingState(b.state)}</Badge>
            {b.held && <Badge tone="warning">{th.ops.heldBadge}</Badge>}
            <span className="muted"> · {labelPayoutState(b.payoutState)}</span>
          </span>
        </span>
        <span className="row__actions actions">
          {b.state === "AwaitingCompletion" && (
            <Button
              data-testid="accept-completion"
              variant="primary"
              busy={busy}
              onClick={() => void run(() => acceptCompletion(b.bookingId, auth), th.clinic.acceptedCompletion)}
            >
              {th.clinic.acceptCompletion}
            </Button>
          )}
          {(b.state === "Confirmed" || b.state === "InProgress") && (
            <Button data-testid="cancel-booking" busy={busy} onClick={() => setCancelId(b.bookingId)}>
              {th.clinic.cancel}
            </Button>
          )}
          {b.state === "ServiceCompleted" && (
            <Button
              data-testid="review"
              busy={busy}
              onClick={() => {
                setReviewId(b.bookingId);
                setReviewScore(5);
              }}
            >
              {th.clinic.review}
            </Button>
          )}
        </span>
      </li>
    );
  }

  return (
    <>
      <AppHeader current="/clinic" />
      <main className="page" style={{ maxWidth: 880 }}>
        <div className="actions" style={{ justifyContent: "space-between", marginBottom: "var(--s5)" }}>
          <div>
            <h1 style={{ margin: 0 }}>{clinic?.name ?? "คลินิก"}</h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.9rem" }}>{th.clinic.subtitle}</p>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {th.clinic.owner} · {clinic ? <Badge tone="success">{labelVerificationState(clinic.verification)}</Badge> : null}
            </span>
          </div>
          <Button variant="subtle" onClick={() => { clearSession(); setToken(null); }}>{th.clinic.signOut}</Button>
        </div>

        <div className="card card--pad" style={{ marginBottom: "var(--s5)" }}>
          <h2 style={{ marginTop: 0 }}>{th.clinic.postTitle}</h2>
          <div className="actions" style={{ gap: "var(--s3)", alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem" }}>
              {th.clinic.compLabel}
              <input
                data-testid="shift-comp"
                inputMode="numeric"
                value={comp}
                onChange={(e) => setComp(e.target.value.replace(/[^0-9]/g, ""))}
                style={{ padding: "0.5rem 0.7rem", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", width: 140 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem" }}>
              {th.clinic.categoryLabel}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ padding: "0.5rem 0.7rem", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)" }}
              >
                <option value="general">{th.categories.general}</option>
                <option value="physician">{th.categories.physician}</option>
                <option value="dentist">{th.categories.dentist}</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem" }}>
              {th.clinic.startLabel}
              <select
                value={startHours}
                onChange={(e) => setStartHours(e.target.value)}
                style={{ padding: "0.5rem 0.7rem", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)" }}
              >
                <option value="24">พรุ่งนี้ (24 ชม.)</option>
                <option value="48">อีก 2 วัน</option>
                <option value="72">อีก 3 วัน</option>
              </select>
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.9rem" }}>
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> {th.clinic.urgent}
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
                        category,
                        urgency: urgent ? "urgent" : "standard",
                        shiftStartInHours: Number(startHours),
                      },
                      auth,
                    ),
                  th.clinic.posted,
                )
              }
            >
              {th.clinic.post}
            </Button>
          </div>
        </div>

        {actionShifts.length > 0 && (
          <>
            <h2>{th.clinic.actionTitle} ({actionShifts.length})</h2>
            <div className="card" style={{ marginBottom: "var(--s5)" }}>
              <ul className="rowlist">{actionShifts.map(renderShift)}</ul>
            </div>
          </>
        )}

        <h2>{th.clinic.shiftsTitle} ({shifts.length})</h2>
        <div className="card" style={{ marginBottom: "var(--s5)" }}>
          <ul className="rowlist" data-testid="clinic-shifts">
            {shifts.length === 0 && <li className="empty">{th.clinic.emptyShifts}</li>}
            {(actionShifts.length > 0 ? otherShifts : shifts).map(renderShift)}
          </ul>
        </div>

        {actionBookings.length > 0 && (
          <>
            <h2>{th.clinic.actionTitle} — {th.clinic.bookingsTitle} ({actionBookings.length})</h2>
            <div className="card" style={{ marginBottom: "var(--s5)" }}>
              <ul className="rowlist">{actionBookings.map(renderBooking)}</ul>
            </div>
          </>
        )}

        <h2>{th.clinic.bookingsTitle} ({bookings.length})</h2>
        <div className="card">
          <ul className="rowlist" data-testid="clinic-bookings">
            {bookings.length === 0 && <li className="empty">{th.clinic.emptyBookings}</li>}
            {(actionBookings.length > 0 ? otherBookings : bookings).map(renderBooking)}
          </ul>
        </div>
      </main>

      {confirmOfferId && confirmCheckout && (
        <Modal title={th.clinic.confirmTitle} testId="confirm-modal" onClose={() => setConfirmOfferId(null)}>
          <p className="muted" style={{ fontSize: "0.9rem" }}>{th.clinic.confirmNote}</p>
          <div className="checkout-box">
            <div className="checkout-box__line"><span>{th.clinic.comp}</span><span>{formatThb(confirmCheckout.compensation)}</span></div>
            <div className="checkout-box__line"><span>{th.clinic.fee}</span><span>{formatThb(confirmCheckout.serviceFee)}</span></div>
            <div className="checkout-box__line checkout-box__total"><span>{th.clinic.total}</span><span>{formatThb(confirmCheckout.total)}</span></div>
          </div>
          <div className="actions" style={{ justifyContent: "flex-end", marginTop: "var(--s4)" }}>
            <Button variant="subtle" onClick={() => setConfirmOfferId(null)}>{th.common.cancel}</Button>
            <Button
              data-testid="confirm-offer"
              variant="primary"
              busy={busy}
              onClick={() =>
                void run(async () => {
                  await confirmOffer(confirmOfferId, auth);
                  setConfirmOfferId(null);
                }, th.clinic.confirmed)
              }
            >
              {th.clinic.confirmPay}
            </Button>
          </div>
        </Modal>
      )}

      {cancelId && (
        <Modal title={th.clinic.cancelTitle} onClose={() => setCancelId(null)}>
          <p className="muted">{th.clinic.cancelBody}</p>
          <div className="actions" style={{ justifyContent: "flex-end", marginTop: "var(--s4)" }}>
            <Button variant="subtle" onClick={() => setCancelId(null)}>{th.common.cancel}</Button>
            <Button
              data-testid="cancel-booking"
              variant="primary"
              busy={busy}
              onClick={() =>
                void run(async () => {
                  await cancelBooking(cancelId, { reason: "ordinary" }, auth);
                  setCancelId(null);
                }, th.clinic.cancelled)
              }
            >
              {th.clinic.cancel}
            </Button>
          </div>
        </Modal>
      )}

      {reviewId && (
        <Modal title={th.clinic.review} onClose={() => setReviewId(null)}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem" }}>
            {th.pro.reviewScore}
            <select value={reviewScore} onChange={(e) => setReviewScore(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>{n} ★</option>
              ))}
            </select>
          </label>
          <div className="actions" style={{ justifyContent: "flex-end", marginTop: "var(--s4)" }}>
            <Button variant="subtle" onClick={() => setReviewId(null)}>{th.common.cancel}</Button>
            <Button
              data-testid="review"
              variant="primary"
              busy={busy}
              onClick={() =>
                void run(async () => {
                  await createReview(reviewId, { score: reviewScore }, auth);
                  setReviewId(null);
                }, th.clinic.reviewed)
              }
            >
              {th.clinic.review}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

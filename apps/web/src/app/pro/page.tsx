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
  browseShifts,
  getProfessionalOffers,
  getProfessionalBookings,
  applyToShift,
  acceptOffer,
  declineOffer,
  arriveBooking,
  completeBooking,
  createReview,
  formatThb,
  type MeIdentity,
  type OpenShift,
  type ProfessionalOfferRow,
  type PartyBooking,
} from "../../lib/api";
import { formatShiftWindow } from "../../lib/format-datetime";
import {
  labelBookingState,
  labelCategory,
  labelOfferState,
  labelPayoutState,
  labelVerificationState,
} from "../../lib/status-labels";
import { getThaiErrorMessage, th } from "../../lib/strings";
import { loadSession, clearSession } from "../../lib/demo-accounts";

function shiftLine(s: { clinicName: string; category: string; startsAt: number; endsAt: number; compensation: number }) {
  return `${s.clinicName} · ${labelCategory(s.category)} · ${formatShiftWindow(s.startsAt, s.endsAt)}`;
}

export default function ProPage() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeIdentity | null>(null);
  const [shifts, setShifts] = useState<OpenShift[]>([]);
  const [offers, setOffers] = useState<ProfessionalOfferRow[]>([]);
  const [bookings, setBookings] = useState<PartyBooking[]>([]);
  const [busy, setBusy] = useState(false);
  const [offerModal, setOfferModal] = useState<ProfessionalOfferRow | null>(null);
  const [reviewBooking, setReviewBooking] = useState<PartyBooking | null>(null);
  const [reviewScore, setReviewScore] = useState(5);
  const [reviewText, setReviewText] = useState("");

  const proId = me?.professionalId ?? null;
  const pendingOffers = offers.filter((o) => o.state === "PendingResponse");

  const load = useCallback(async (id: string, tok: string) => {
    const [sh, of, bk] = await Promise.all([
      browseShifts(tok),
      getProfessionalOffers(id, tok),
      getProfessionalBookings(id, tok),
    ]);
    setShifts(sh.shifts);
    setOffers(of.offers);
    setBookings(bk.bookings);
  }, []);

  useEffect(() => {
    const sess = loadSession();
    if (!sess) return;
    setToken(sess.token);
    getMe(sess.token).then(setMe).catch((e) => toast.error(getThaiErrorMessage(e)));
  }, [toast]);

  useEffect(() => {
    if (proId && token) void load(proId, token).catch((e) => toast.error(getThaiErrorMessage(e)));
  }, [proId, token, load, toast]);

  const actionBookings = useMemo(
    () => bookings.filter((b) => b.state === "Confirmed" || b.state === "InProgress" || b.state === "AwaitingCompletion"),
    [bookings],
  );

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      if (proId && token) await load(proId, token);
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
        <AppHeader current="/pro" />
        <main className="page" style={{ maxWidth: 460, textAlign: "center" }}>
          <p className="muted" style={{ marginTop: "2rem" }}>{th.pro.gate}</p>
          <Link href="/signin" className="btn btn--primary btn--lg">{th.pro.gateCta}</Link>
        </main>
      </>
    );
  }

  const auth = token;
  const offerCheckout = offerModal ? buildCheckout(satang(offerModal.compensation)) : null;

  return (
    <>
      <AppHeader current="/pro" />
      <main className="page" style={{ maxWidth: 880 }}>
        <div className="actions" style={{ justifyContent: "space-between", marginBottom: "var(--s5)" }}>
          <div>
            <h1 style={{ margin: 0 }}>{me?.professionalName ?? "บุคลากร"}</h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.9rem" }}>{th.pro.subtitle}</p>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {th.pro.role} · {me?.professionalVerification && (
                <Badge tone="success">{labelVerificationState(me.professionalVerification)}</Badge>
              )}
            </span>
          </div>
          <Button variant="subtle" onClick={() => { clearSession(); setToken(null); }}>{th.pro.signOut}</Button>
        </div>

        <p className="muted note-banner">{th.pro.availabilityNote}</p>

        <h2>{th.pro.offersTitle} ({pendingOffers.length})</h2>
        <div className="card" style={{ marginBottom: "var(--s5)" }}>
          <ul className="rowlist" data-testid="pro-offers">
            {offers.length === 0 && <li className="empty">{th.pro.emptyOffers}</li>}
            {offers.map((o) => (
              <li key={o.offerId} data-testid={`offer-${o.offerId}`}>
                <span className="row__main">
                  <span className="row__name">
                    {shiftLine({
                      clinicName: o.clinicName,
                      category: o.category,
                      startsAt: o.shiftStart,
                      endsAt: o.shiftEnd,
                      compensation: o.compensation,
                    })}{" "}
                    {o.urgency === "urgent" && <Badge tone="warn">{th.clinic.urgent}</Badge>}
                  </span>
                  <span className="row__sub muted">
                    {formatThb(o.compensation)} · <Badge tone="info">{labelOfferState(o.state)}</Badge>
                    {o.clinicVerified && <Badge tone="success">{th.pro.verified}</Badge>}
                  </span>
                </span>
                {o.state === "PendingResponse" && (
                  <span className="row__actions actions">
                    <Button data-testid="accept-offer-open" variant="primary" busy={busy} onClick={() => setOfferModal(o)}>
                      {th.pro.accept}
                    </Button>
                    <Button
                      busy={busy}
                      onClick={() => void run(() => declineOffer(o.offerId, auth), th.pro.declined)}
                    >
                      {th.pro.decline}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <h2>{th.pro.openTitle} ({shifts.length})</h2>
        <div className="card" style={{ marginBottom: "var(--s5)" }}>
          <ul className="rowlist" data-testid="open-shifts">
            {shifts.length === 0 && <li className="empty">{th.pro.emptyShifts}</li>}
            {shifts.slice(0, 25).map((s) => (
              <li key={s.shiftId} data-testid={`open-${s.shiftId}`}>
                <span className="row__main">
                  <span className="row__name">
                    {shiftLine(s)} {s.urgent && <Badge tone="warn">{th.clinic.urgent}</Badge>}
                  </span>
                  <span className="row__sub muted">
                    {formatThb(s.compensation)}
                    {s.clinicVerified && <> · <Badge tone="success">{th.pro.verified}</Badge></>}
                  </span>
                </span>
                <span className="row__actions">
                  <Button
                    data-testid="apply-shift"
                    busy={busy}
                    onClick={() => void run(() => applyToShift(s.shiftId, proId!, auth), th.pro.applied)}
                  >
                    {th.pro.apply}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted" style={{ padding: "0 var(--s4) var(--s3)", fontSize: "0.82rem", margin: 0 }}>
            {th.pro.applyNote}
          </p>
        </div>

        <h2>{th.pro.jobsTitle} ({bookings.length})</h2>
        <div className="card">
          <ul className="rowlist" data-testid="pro-bookings">
            {bookings.length === 0 && <li className="empty">{th.pro.emptyJobs}</li>}
            {bookings.map((b) => (
              <li key={b.bookingId} data-testid={`pro-booking-${b.bookingId}`}>
                <span className="row__main">
                  <span className="row__name">
                    {b.counterpartyName} · {labelCategory(b.category)} · {formatShiftWindow(b.shiftStart, b.shiftEnd)}
                  </span>
                  <span className="row__sub">
                    {formatThb(b.total)} · <Badge tone="info">{labelBookingState(b.state)}</Badge>
                    {b.held && <Badge tone="warning">{th.ops.heldBadge}</Badge>}
                    <span className="muted"> · {labelPayoutState(b.payoutState)}</span>
                  </span>
                </span>
                <span className="row__actions actions">
                  {(b.state === "Confirmed" || b.state === "InProgress") && (
                    <>
                      {!b.arrived && (
                        <Button data-testid="arrive" busy={busy} onClick={() => void run(() => arriveBooking(b.bookingId, auth), th.pro.arrived)}>
                          {th.pro.arrive}
                        </Button>
                      )}
                      <Button
                        data-testid="complete"
                        variant="primary"
                        busy={busy}
                        disabled={!b.arrived}
                        title={!b.arrived ? th.pro.completeGate : undefined}
                        onClick={() => void run(() => completeBooking(b.bookingId, auth), th.pro.completed)}
                      >
                        {th.pro.complete}
                      </Button>
                    </>
                  )}
                  {b.state === "ServiceCompleted" && (
                    <Button data-testid="review" busy={busy} onClick={() => { setReviewBooking(b); setReviewScore(5); setReviewText(""); }}>
                      {th.pro.review}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </main>

      {offerModal && offerCheckout && (
        <Modal title={th.pro.offerTitle} testId="offer-modal" onClose={() => setOfferModal(null)}>
          <p className="muted">{th.pro.offerNote}</p>
          <p><strong>{offerModal.clinicName}</strong> · {formatShiftWindow(offerModal.shiftStart, offerModal.shiftEnd)}</p>
          <div className="checkout-box">
            <div className="checkout-box__line"><span>{th.clinic.comp}</span><span>{formatThb(offerCheckout.compensation)}</span></div>
            <div className="checkout-box__line"><span>{th.clinic.fee}</span><span>{formatThb(offerCheckout.serviceFee)}</span></div>
            <div className="checkout-box__line checkout-box__total"><span>{th.clinic.total}</span><span>{formatThb(offerCheckout.total)}</span></div>
          </div>
          <div className="actions" style={{ justifyContent: "flex-end", marginTop: "var(--s4)" }}>
            <Button variant="subtle" onClick={() => setOfferModal(null)}>{th.common.cancel}</Button>
            <Button
              data-testid="accept-offer"
              variant="primary"
              busy={busy}
              onClick={() =>
                void run(async () => {
                  await acceptOffer(offerModal.offerId, auth);
                  setOfferModal(null);
                }, th.pro.accepted)
              }
            >
              {th.pro.accept}
            </Button>
          </div>
        </Modal>
      )}

      {reviewBooking && (
        <Modal title={th.pro.review} onClose={() => setReviewBooking(null)}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem", marginBottom: "var(--s3)" }}>
            {th.pro.reviewScore}
            <select value={reviewScore} onChange={(e) => setReviewScore(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>{n} ★</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem" }}>
            {th.pro.reviewComment}
            <input
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              style={{ padding: "0.5rem 0.7rem", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)" }}
            />
          </label>
          <div className="actions" style={{ justifyContent: "flex-end", marginTop: "var(--s4)" }}>
            <Button variant="subtle" onClick={() => setReviewBooking(null)}>{th.common.cancel}</Button>
            <Button
              data-testid="review"
              variant="primary"
              busy={busy}
              onClick={() =>
                void run(async () => {
                  await createReview(
                    reviewBooking.bookingId,
                    reviewText ? { score: reviewScore, text: reviewText } : { score: reviewScore },
                    auth,
                  );
                  setReviewBooking(null);
                }, th.pro.reviewed)
              }
            >
              {th.pro.review}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

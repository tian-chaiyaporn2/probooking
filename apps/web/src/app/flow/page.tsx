"use client";

import { useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { StatusLine } from "../../components/StatusLine";
import { useToast } from "../../components/Toast";
import {
  registerClinic,
  registerProfessional,
  verifyClinic,
  verifyProfessional,
  postShift,
  applyToShift,
  offerToProfessional,
  acceptOffer,
  confirmOffer,
  completeBooking,
  acceptCompletion,
  createReview,
  getRating,
  getDevToken,
  setAuthToken,
  formatThb,
  type Checkout,
  type Payout,
  type Rating,
} from "../../lib/api";
import { th } from "../../lib/strings";

type StepKey =
  | "registered"
  | "verified"
  | "shiftPosted"
  | "applied"
  | "offerCreated"
  | "accepted"
  | "confirmed";

type Step = { key: StepKey; label: string; detail: string };

/**
 * Phase 0 booking-flow demo. Drives the API end to end (target of Playwright e2e).
 */
export default function FlowPage() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [reviewsPublished, setReviewsPublished] = useState(false);
  const [rating, setRating] = useState<Rating | null>(null);
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [payingOut, setPayingOut] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  async function run() {
    setRunning(true);
    setSteps([]);
    setCheckout(null);
    setBookingId(null);
    setProfessionalId(null);
    setPayout(null);
    setReviewsPublished(false);
    setRating(null);
    const log = (key: StepKey, label: string, detail: string) =>
      setSteps((s) => [...s, { key, label, detail }]);
    try {
      const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const clinic = await registerClinic({
        branchName: "Sukhumvit Clinic",
        licenceNo: "TH-DEMO",
        address: "Bangkok",
        ownerPhone: `+66c${uniq}`,
      });
      const pro = await registerProfessional({
        displayName: "Dr. Demo",
        profession: "physician",
        phone: `+66p${uniq}`,
        payoutRef: "xxxx-1234",
      });
      log("registered", th.flow.steps.registered, th.flow.stepDetail.registered(clinic.verification));

      const { token } = await getDevToken("operations");
      setAuthToken(token);
      await verifyClinic(clinic.id);
      await verifyProfessional(pro.id);
      setProfessionalId(pro.id);
      log("verified", th.flow.steps.verified, th.flow.stepDetail.verified);

      const shift = await postShift({ clinicWorkspaceId: clinic.id, compensation: 1_000_000 });
      log("shiftPosted", th.flow.steps.shiftPosted, th.flow.stepDetail.shiftPosted(shift.state));

      await applyToShift(shift.shiftId, pro.id);
      log("applied", th.flow.steps.applied, th.flow.stepDetail.applied);

      const offer = await offerToProfessional(shift.shiftId, pro.id);
      log(
        "offerCreated",
        th.flow.steps.offerCreated,
        th.flow.stepDetail.offerCreated(offer.state, formatThb(offer.checkout.serviceFee)),
      );

      const accepted = await acceptOffer(offer.id);
      log("accepted", th.flow.steps.accepted, th.flow.stepDetail.accepted(accepted.state));

      const confirmed = await confirmOffer(offer.id, true);
      log("confirmed", th.flow.steps.confirmed, th.flow.stepDetail.confirmed(confirmed.booking.state));
      setCheckout(confirmed.checkout);
      setBookingId(confirmed.booking.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function runPayout() {
    if (!bookingId) return;
    setPayingOut(true);
    try {
      await completeBooking(bookingId);
      setPayout(await acceptCompletion(bookingId));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPayingOut(false);
    }
  }

  async function runReviews() {
    if (!bookingId || !professionalId) return;
    setReviewing(true);
    try {
      await createReview(bookingId, { by: "professional", score: 5 });
      const r = await createReview(bookingId, { by: "clinic", score: 5 });
      setReviewsPublished(r.published);
      setRating(await getRating(professionalId));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <>
      <AppHeader current="/flow" />
      <main id="main-content" tabIndex={-1} className="page page--narrow">
        <h1>{th.flow.title}</h1>
        <p className="muted">{th.flow.description}</p>

        <Button
          data-testid="run-flow"
          variant="primary"
          size="lg"
          busy={running}
          disabled={payingOut || reviewing}
          onClick={run}
        >
          {th.flow.run}
        </Button>

        <ol data-testid="steps" className="flow-steps">
          {steps.map((s) => (
            <li key={s.key} data-step={s.key}>
              <strong>{s.label}</strong> — <span>{s.detail}</span>
            </li>
          ))}
        </ol>

        {bookingId && (
          <div data-testid="result" className="card card--pad card--result">
            <StatusLine testid="booking-status" status="confirmed">
              {th.flow.bookingConfirmed}
            </StatusLine>
            <div>
              {th.flow.bookingId}: <code data-testid="booking-id">{bookingId}</code>
            </div>
            {checkout && (
              <ul className="kv-list kv-list--spaced">
                <li>
                  <span className="kv-list__label">{th.flow.compensation}</span>
                  <span className="kv-list__value">{formatThb(checkout.compensation)}</span>
                </li>
                <li>
                  <span className="kv-list__label">{th.flow.serviceFee}</span>
                  <span className="kv-list__value">{formatThb(checkout.serviceFee)}</span>
                </li>
                <li>
                  <span className="kv-list__label">{th.flow.tax}</span>
                  <span className="kv-list__value">{formatThb(checkout.tax)}</span>
                </li>
                <li className="kv-list--total">
                  <span className="kv-list__label">{th.flow.total}</span>
                  <span className="kv-list__value" data-testid="checkout-total">
                    {formatThb(checkout.total)}
                  </span>
                </li>
              </ul>
            )}

            <div className="stack-gap">
              {!payout ? (
                <Button data-testid="run-payout" variant="primary" busy={payingOut} onClick={runPayout}>
                  {th.flow.completePayout}
                </Button>
              ) : (
                <div data-testid="payout">
                  <StatusLine testid="payout-status" status="paid">
                    {th.flow.paidOut}
                  </StatusLine>
                  <p className="muted caption">
                    — <span data-testid="payout-amount">{formatThb(payout.payoutAmount)}</span>{" "}
                    {th.flow.payoutToProfessional(payout.bookingState)}
                  </p>
                </div>
              )}
            </div>

            {payout && (
              <div className="stack-gap">
                {!reviewsPublished ? (
                  <Button data-testid="run-reviews" variant="primary" busy={reviewing} onClick={runReviews}>
                    {th.flow.leaveReviews}
                  </Button>
                ) : (
                  <div data-testid="reviews">
                    <StatusLine testid="reviews-status" status="published">
                      {th.flow.reviewsPublished}
                    </StatusLine>
                    {rating && (
                      <div
                        data-testid="rating"
                        data-rating-visible={rating.hasRating ? "true" : "false"}
                        className="muted caption"
                      >
                        {rating.hasRating
                          ? th.flow.ratingShown(String(rating.average), rating.count ?? 0)
                          : th.flow.ratingHidden}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

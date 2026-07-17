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
  loginAs,
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
  // The flow acts as two parties. Their tokens are held per-run, not module-globally: the
  // API derives authority from whoever's token made the call, so mixing them up is a 403.
  const [tokens, setTokens] = useState<{ clinic: string; pro: string } | null>(null);
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
<<<<<<< HEAD
    const log = (key: StepKey, label: string, detail: string) =>
      setSteps((s) => [...s, { key, label, detail }]);
=======
    setTokens(null);
    const log = (label: string, detail: string) =>
      setSteps((s) => [...s, { label, detail }]);
>>>>>>> origin/master
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

<<<<<<< HEAD
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
=======
      // Each party logs in as themselves (OTP). Every action below is authorised against
      // the caller's real identity — the clinic cannot accept on the professional's behalf,
      // and neither can a stranger.
      const clinicToken = await loginAs(`+66c${uniq}`);
      const proToken = await loginAs(`+66p${uniq}`);
      setTokens({ clinic: clinicToken, pro: proToken });

      const shift = await postShift({ clinicWorkspaceId: clinic.id, compensation: 1_000_000 }, clinicToken);
      log("Shift posted", `open shift (${shift.state})`);

      await applyToShift(shift.shiftId, pro.id, proToken);
      log("Professional applied", "application submitted (non-binding)");

      const offer = await offerToProfessional(shift.shiftId, pro.id, clinicToken);
      log("Offer created", `state=${offer.state}, fee=${formatThb(offer.checkout.serviceFee)}`);

      const accepted = await acceptOffer(offer.id, proToken);
      log("Professional accepted", `state=${accepted.state} (soft hold, not a booking)`);

      const confirmed = await confirmOffer(offer.id, clinicToken);
      log("Booking confirmed", `state=${confirmed.booking.state}`);
>>>>>>> origin/master
      setCheckout(confirmed.checkout);
      setBookingId(confirmed.booking.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function runPayout() {
    if (!bookingId || !tokens) return;
    setPayingOut(true);
    try {
<<<<<<< HEAD
      await completeBooking(bookingId);
      setPayout(await acceptCompletion(bookingId));
=======
      await completeBooking(bookingId, tokens.pro); // CMP-01: the professional submits
      const result = await acceptCompletion(bookingId, tokens.clinic); // the clinic accepts + pays
      setPayout(result);
>>>>>>> origin/master
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPayingOut(false);
    }
  }

  async function runReviews() {
    if (!bookingId || !professionalId || !tokens) return;
    setReviewing(true);
    try {
<<<<<<< HEAD
      await createReview(bookingId, { by: "professional", score: 5 });
      const r = await createReview(bookingId, { by: "clinic", score: 5 });
=======
      // Both parties review; the second submission publishes the pair (REV-03). Who is
      // reviewing is derived from the token, so neither side can review as the other.
      await createReview(bookingId, { score: 5 }, tokens.pro);
      const r = await createReview(bookingId, { score: 5 }, tokens.clinic);
>>>>>>> origin/master
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

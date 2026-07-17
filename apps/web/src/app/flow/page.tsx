"use client";

import { useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
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

type Step = { label: string; detail: string };

/**
 * Phase 0 booking-flow demo. Drives the API: create offer -> accept (soft hold) ->
 * confirm (eligibility + prefunding) -> Confirmed booking. Exists to verify the
 * vertical slice end to end (and is the target of the Playwright e2e).
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
    const log = (label: string, detail: string) =>
      setSteps((s) => [...s, { label, detail }]);
    try {
      // Onboard + verify a clinic and professional (unique phones per run).
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
      log("Registered", `clinic + professional (both ${clinic.verification})`);

      // The verify calls are operations-guarded; obtain an ops token for the demo.
      const { token } = await getDevToken("operations");
      setAuthToken(token);
      await verifyClinic(clinic.id);
      await verifyProfessional(pro.id);
      setProfessionalId(pro.id);
      log("Operations verified", "clinic + professional → Verified");

      const shift = await postShift({ clinicWorkspaceId: clinic.id, compensation: 1_000_000 });
      log("Shift posted", `open shift (${shift.state})`);

      await applyToShift(shift.shiftId, pro.id);
      log("Professional applied", "application submitted (non-binding)");

      const offer = await offerToProfessional(shift.shiftId, pro.id);
      log("Offer created", `state=${offer.state}, fee=${formatThb(offer.checkout.serviceFee)}`);

      const accepted = await acceptOffer(offer.id);
      log("Professional accepted", `state=${accepted.state} (soft hold, not a booking)`);

      const confirmed = await confirmOffer(offer.id, true);
      log("Booking confirmed", `state=${confirmed.booking.state}`);
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
      await completeBooking(bookingId); // professional marks completion
      const result = await acceptCompletion(bookingId); // accept + initiate payout
      setPayout(result);
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
      // Both parties review; the second submission publishes the pair (REV-03).
      await createReview(bookingId, { by: "professional", score: 5 });
      const r = await createReview(bookingId, { by: "clinic", score: 5 });
      setReviewsPublished(r.published);
      setRating(await getRating(professionalId)); // hasRating false until 3 reviews (REV-04)
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <>
    <AppHeader current="/flow" />
    <main className="page" style={{ maxWidth: 640 }}>
      <h1>ProBooking — booking flow</h1>
      <p className="muted">
        Onboard and verify a clinic and professional, create a binding offer, accept it
        (soft hold), confirm the booking, complete it and pay out the professional, then
        leave reviews.
      </p>

      <Button data-testid="run-flow" variant="primary" size="lg" busy={running} onClick={run}>
        Run booking flow
      </Button>

      <ol data-testid="steps" style={{ marginTop: "1.5rem", lineHeight: 1.8 }}>
        {steps.map((s, i) => (
          <li key={i}>
            <strong>{s.label}</strong> — <span>{s.detail}</span>
          </li>
        ))}
      </ol>

      {bookingId && (
        <div
          data-testid="result"
          className="card card--pad"
          style={{ marginTop: "1rem", borderColor: "var(--primary)" }}
        >
          <div data-testid="booking-status" style={{ fontWeight: 600, color: "var(--success)" }}>
            Booking Confirmed
          </div>
          <div>Booking ID: <code data-testid="booking-id">{bookingId}</code></div>
          {checkout && (
            <ul className="kv-list" style={{ marginTop: "0.5rem" }}>
              <li>
                <span className="kv-list__label">Compensation</span>
                <span className="kv-list__value">{formatThb(checkout.compensation)}</span>
              </li>
              <li>
                <span className="kv-list__label">Service fee (12%)</span>
                <span className="kv-list__value">{formatThb(checkout.serviceFee)}</span>
              </li>
              <li>
                <span className="kv-list__label">Tax</span>
                <span className="kv-list__value">{formatThb(checkout.tax)}</span>
              </li>
              <li className="kv-list--total">
                <span className="kv-list__label">Total</span>
                <span className="kv-list__value" data-testid="checkout-total">{formatThb(checkout.total)}</span>
              </li>
            </ul>
          )}

          <div style={{ marginTop: "1rem" }}>
            {!payout ? (
              <Button data-testid="run-payout" variant="primary" busy={payingOut} onClick={runPayout}>
                Complete &amp; pay out
              </Button>
            ) : (
              <div data-testid="payout">
                <span data-testid="payout-status" style={{ fontWeight: 600, color: "var(--success)" }}>
                  Paid out
                </span>{" "}
                — <span data-testid="payout-amount">{formatThb(payout.payoutAmount)}</span> to the
                professional (booking {payout.bookingState})
              </div>
            )}
          </div>

          {payout && (
            <div style={{ marginTop: "1rem" }}>
              {!reviewsPublished ? (
                <Button data-testid="run-reviews" variant="primary" busy={reviewing} onClick={runReviews}>
                  Leave reviews (both parties)
                </Button>
              ) : (
                <div data-testid="reviews">
                  <span data-testid="reviews-status" style={{ fontWeight: 600, color: "var(--success)" }}>
                    Reviews published
                  </span>
                  {rating && (
                    <div data-testid="rating" style={{ color: "var(--muted)", marginTop: "0.25rem" }}>
                      {rating.hasRating
                        ? `Professional rating: ${rating.average} (${rating.count} reviews)`
                        : "Professional rating: not shown yet (needs 3 reviews)"}
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

"use client";

import { useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/PageHeader";
import { KeyValueTable } from "../../components/KeyValueTable";
import { useToast } from "../../components/Toast";
import { CheckIcon } from "../../components/icons";
import { th, getThaiErrorMessage } from "../../lib/strings";
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
  loginAs,
  formatThb,
  type Checkout,
  type Payout,
  type Rating,
} from "../../lib/api";

type Step = { label: string; detail: string };

function alreadyCompleted(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /already|duplicate|no longer awaiting|cannot .* from ServiceCompleted/i.test(error.message);
}

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
  const [runFailed, setRunFailed] = useState(false);

  const FLOW_TOTAL = 7;
  const progressPct = Math.min(100, Math.round((steps.length / FLOW_TOTAL) * 100));

  async function run() {
    setRunning(true);
    setSteps([]);
    setCheckout(null);
    setBookingId(null);
    setProfessionalId(null);
    setPayout(null);
    setReviewsPublished(false);
    setRating(null);
    setTokens(null);
    setRunFailed(false);
    const log = (label: string, detail: string) =>
      setSteps((s) => [...s, { label, detail }]);
    try {
      // Onboard + verify a clinic and professional (unique phones per run).
      const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const clinicPhone = `+66c${uniq}`;
      const proPhone = `+66p${uniq}`;
      const clinicToken = await loginAs(clinicPhone);
      const proToken = await loginAs(proPhone);
      const clinic = await registerClinic({
        branchName: "Sukhumvit Clinic",
        licenceNo: "TH-DEMO",
        address: "Bangkok",
        ownerPhone: clinicPhone,
      }, clinicToken);
      const pro = await registerProfessional({
        displayName: "Dr. Demo",
        profession: "physician",
        phone: proPhone,
        payoutRef: "xxxx-1234",
      }, proToken);
      log("Registered", `clinic + professional (both ${clinic.verification})`);

      // The verify calls are operations-guarded; obtain an ops token for the demo.
      const { token: opsToken } = await getDevToken("operations");
      await verifyClinic(clinic.id, opsToken);
      await verifyProfessional(pro.id, opsToken);
      setProfessionalId(pro.id);
      log("Operations verified", "clinic + professional → Verified");

      // Each party logs in as themselves (OTP). Every action below is authorised against
      // the caller's real identity — the clinic cannot accept on the professional's behalf,
      // and neither can a stranger.
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
      setCheckout(confirmed.checkout);
      setBookingId(confirmed.booking.id);
    } catch (e) {
      setRunFailed(true);
      toast.error(getThaiErrorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  async function runPayout() {
    if (!bookingId || !tokens) return;
    setPayingOut(true);
    try {
      try {
        await completeBooking(bookingId, tokens.pro); // CMP-01: the professional submits
      } catch (e) {
        if (!alreadyCompleted(e)) throw e;
      }
      const result = await acceptCompletion(bookingId, tokens.clinic); // the clinic accepts + pays
      setPayout(result);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setPayingOut(false);
    }
  }

  async function runReviews() {
    if (!bookingId || !professionalId || !tokens) return;
    setReviewing(true);
    try {
      // Both parties review; the second submission publishes the pair (REV-03). Who is
      // reviewing is derived from the token, so neither side can review as the other.
      try {
        await createReview(bookingId, { score: 5 }, tokens.pro);
      } catch (e) {
        if (!alreadyCompleted(e)) throw e;
      }
      const r = await createReview(bookingId, { score: 5 }, tokens.clinic);
      setReviewsPublished(r.published);
      setRating(await getRating(professionalId)); // hasRating false until 3 reviews (REV-04)
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setReviewing(false);
    }
  }

  return (
    <>
      <AppHeader current="/flow" />
      <main id="main" className="page page--flow">
        <PageHeader
          eyebrow={<span className="hero__eyebrow">{th.home.marketSignal}</span>}
          title={th.flow.title}
          subtitle={th.flow.subtitle}
        />

        <Button data-testid="run-flow" variant="primary" size="lg" busy={running} onClick={run}>
          {running ? th.flow.running : th.flow.run}
        </Button>
        {(running || steps.length > 0) && (
          <div className="flow-progress">
            <div className="flow-progress__meta">
              <span id="flow-progress-label">{th.flow.progress(Math.min(steps.length, FLOW_TOTAL), FLOW_TOTAL)}</span>
              {running && <span className="muted">{th.common.loading}</span>}
            </div>
            <div
              className="progress progress--determinate"
              role="progressbar"
              aria-labelledby="flow-progress-label"
              aria-valuemin={0}
              aria-valuemax={FLOW_TOTAL}
              aria-valuenow={Math.min(steps.length, FLOW_TOTAL)}
            >
              <div
                className={`progress__bar${running && steps.length === 0 ? " progress__bar--indeterminate" : ""}`}
                style={steps.length > 0 ? { width: `${progressPct}%`, transform: "none" } : undefined}
              />
            </div>
          </div>
        )}

        {runFailed && !bookingId && (
          <p role="alert" className="form-error" data-testid="flow-failed">
            {th.flow.runFailed}
          </p>
        )}

        {/* Preview the flow before it runs, so the page is not an empty button in a void. */}
        {steps.length === 0 && !bookingId && !running && (
          <ol className="flow-preview">
            {th.home.steps.map((s, i) => (
              <li key={s.t}>
                <span className="flow-preview__num">{i + 1}</span>
                <span>
                  <strong>{s.t}</strong> — <span className="muted">{s.d}</span>
                </span>
              </li>
            ))}
          </ol>
        )}

        <ol data-testid="steps" className="flow-log">
          {steps.map((s, i) => (
            <li key={i} className={`flow-log__item flow-log__item--d${Math.min(i, 6)}`}>
              <strong>{s.label}</strong> — <span>{s.detail}</span>
            </li>
          ))}
        </ol>

        {bookingId && (
          <div data-testid="result" className="flow-result">
            <div data-testid="booking-status" className="flow-result__status flow-result__status--pulse">
              <CheckIcon /> Booking Confirmed
            </div>
            <div className="flow-result__id">
              Booking ID: <code data-testid="booking-id">{bookingId}</code>
            </div>
            {checkout && (
              <KeyValueTable
                caption="Checkout totals"
                rows={[
                  { label: "Compensation", value: formatThb(checkout.compensation) },
                  { label: "Service fee (12%)", value: formatThb(checkout.serviceFee) },
                  { label: "Tax", value: formatThb(checkout.tax) },
                  { label: "Total", value: formatThb(checkout.total), total: true, valueTestId: "checkout-total" },
                ]}
              />
            )}

            <div className="flow-result__actions">
              {!payout ? (
                <Button data-testid="run-payout" variant="primary" busy={payingOut} onClick={runPayout}>
                  Complete &amp; pay out
                </Button>
              ) : (
                <div data-testid="payout">
                  <span data-testid="payout-status" className="flow-result__status flow-result__status--inline">
                    <CheckIcon /> Paid out
                  </span>{" "}
                  — <span data-testid="payout-amount">{formatThb(payout.payoutAmount)}</span> to the
                  professional (booking {payout.bookingState})
                </div>
              )}

              {payout && (
                <div>
                  {!reviewsPublished ? (
                    <Button data-testid="run-reviews" variant="primary" busy={reviewing} onClick={runReviews}>
                      Leave reviews (both parties)
                    </Button>
                  ) : (
                    <div data-testid="reviews">
                      <span data-testid="reviews-status" className="flow-result__status flow-result__status--inline">
                        <CheckIcon /> Reviews published
                      </span>
                      {rating && (
                        <div data-testid="rating" className="muted flow-result__rating">
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
          </div>
        )}
      </main>
    </>
  );
}

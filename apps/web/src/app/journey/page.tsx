"use client";

import { useMemo, useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/PageHeader";
import { CheckoutSummary } from "../../components/CheckoutSummary";
import { StatusTimeline, timelineStatus } from "../../components/StatusTimeline";
import { useToast } from "../../components/Toast";
import { CheckIcon } from "../../components/icons";
import { th } from "../../lib/strings";
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
  getDevToken,
  loginAs,
  formatThb,
  type Checkout,
  type Payout,
} from "../../lib/api";

type StepId = "setup" | "offer" | "accept" | "confirm" | "complete" | "payout";
type Perspective = "clinic" | "professional";

const STEP_ORDER: StepId[] = ["setup", "offer", "accept", "confirm", "complete", "payout"];

/**
 * Thai step-by-step booking journey (Phase 1 core UX sketch).
 * Same marketplace APIs as /flow, but human task moments: offer terms, Payment Protected
 * checkout, status timeline, complete & payout — with clinic/professional perspective.
 */
export default function JourneyPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [perspective, setPerspective] = useState<Perspective>("clinic");
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [tokens, setTokens] = useState<{ clinic: string; pro: string } | null>(null);
  const [ids, setIds] = useState<{ clinic: string; pro: string; shift: string } | null>(null);
  const toast = useToast();

  const done = stepIndex >= STEP_ORDER.length;
  const stepId: StepId = done ? "payout" : STEP_ORDER[stepIndex]!;

  const timeline = useMemo(
    () =>
      STEP_ORDER.map((id, i) => ({
        id,
        label: th.journey.steps[id],
        detail: th.journey.stepDetail[id],
        status: done ? ("done" as const) : timelineStatus(i, stepIndex),
      })),
    [stepIndex, done],
  );

  function reset() {
    setStepIndex(0);
    setCheckout(null);
    setBookingId(null);
    setOfferId(null);
    setPayout(null);
    setTokens(null);
    setIds(null);
    setPerspective("clinic");
  }

  async function runStep() {
    setBusy(true);
    try {
      if (stepId === "setup") {
        const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const clinic = await registerClinic({
          branchName: "คลินิกสุขุมวิท",
          licenceNo: "TH-JOURNEY",
          address: "กรุงเทพฯ",
          ownerPhone: `+66jc${uniq}`,
        });
        const pro = await registerProfessional({
          displayName: "พญ. ธนพร ก.",
          profession: "physician",
          phone: `+66jp${uniq}`,
          payoutRef: "xxxx-1234",
        });
        const { token: opsToken } = await getDevToken("operations");
        await verifyClinic(clinic.id, opsToken);
        await verifyProfessional(pro.id, opsToken);
        const clinicToken = await loginAs(`+66jc${uniq}`);
        const proToken = await loginAs(`+66jp${uniq}`);
        const shift = await postShift({ clinicWorkspaceId: clinic.id, compensation: 1_000_000 }, clinicToken);
        await applyToShift(shift.shiftId, pro.id, proToken);
        setTokens({ clinic: clinicToken, pro: proToken });
        setIds({ clinic: clinic.id, pro: pro.id, shift: shift.shiftId });
        setPerspective("clinic");
        setStepIndex(1);
        return;
      }

      if (!tokens || !ids) throw new Error("missing setup");

      if (stepId === "offer") {
        setPerspective("clinic");
        const offer = await offerToProfessional(ids.shift, ids.pro, tokens.clinic);
        setOfferId(offer.id);
        setCheckout(offer.checkout);
        setStepIndex(2);
        return;
      }

      if (stepId === "accept") {
        if (!offerId) throw new Error("missing offer");
        setPerspective("professional");
        await acceptOffer(offerId, tokens.pro);
        setStepIndex(3);
        return;
      }

      if (stepId === "confirm") {
        if (!offerId) throw new Error("missing offer");
        setPerspective("clinic");
        const confirmed = await confirmOffer(offerId, tokens.clinic);
        setCheckout(confirmed.checkout);
        setBookingId(confirmed.booking.id);
        setStepIndex(4);
        return;
      }

      if (stepId === "complete") {
        if (!bookingId) throw new Error("missing booking");
        setPerspective("professional");
        await completeBooking(bookingId, tokens.pro);
        setStepIndex(5);
        return;
      }

      if (stepId === "payout") {
        if (!bookingId) throw new Error("missing booking");
        setPerspective("clinic");
        const result = await acceptCompletion(bookingId, tokens.clinic);
        setPayout(result);
        setStepIndex(6);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : th.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const actorLabel =
    perspective === "clinic" ? th.journey.perspectiveClinic : th.journey.perspectivePro;

  return (
    <>
      <AppHeader current="/journey" />
      <main id="main" className="page page--journey">
        <PageHeader
          eyebrow={<span className="hero__eyebrow">{th.home.phase}</span>}
          title={th.journey.title}
          subtitle={th.journey.subtitle}
        />

        <div className="journey-layout">
          <aside className="journey-aside">
            <StatusTimeline steps={timeline} caption={th.journey.timelineCaption} />
          </aside>

          <section className="journey-main">
            <div className="perspective-toggle" role="group" aria-label={th.journey.perspective}>
              <span className="muted">{th.journey.perspective}</span>
              <Button
                variant={perspective === "clinic" ? "primary" : "subtle"}
                onClick={() => setPerspective("clinic")}
                data-testid="perspective-clinic"
              >
                {th.journey.perspectiveClinic}
              </Button>
              <Button
                variant={perspective === "professional" ? "primary" : "subtle"}
                onClick={() => setPerspective("professional")}
                data-testid="perspective-pro"
              >
                {th.journey.perspectivePro}
              </Button>
            </div>

            {!done ? (
              <div className="journey-card" data-testid="journey-step">
                <p className="journey-card__acting muted">{th.journey.actingAs(actorLabel)}</p>
                <h2>{th.journey.steps[stepId]}</h2>
                <p className="lead muted">{th.journey.stepDetail[stepId]}</p>

                {(stepId === "offer" || stepId === "accept" || stepId === "confirm") && checkout ? (
                  <CheckoutSummary checkout={checkout} protectedStamp={stepId !== "offer"} />
                ) : null}

                {stepId === "confirm" && bookingId ? (
                  <p className="journey-booking-id">
                    {th.journey.bookingId}: <code data-testid="journey-booking-id">{bookingId}</code>
                  </p>
                ) : null}

                {stepId === "payout" && payout ? (
                  <p className="flow-result__status">
                    <CheckIcon /> {formatThb(payout.payoutAmount)}
                  </p>
                ) : null}

                <div className="journey-card__actions">
                  <Button
                    data-testid="journey-action"
                    variant="primary"
                    size="lg"
                    busy={busy}
                    onClick={() => void runStep()}
                  >
                    {stepIndex === 0 && busy ? th.journey.starting : th.journey.actions[stepId]}
                  </Button>
                  {stepIndex > 0 ? (
                    <Button variant="subtle" onClick={reset} disabled={busy}>
                      {th.journey.actions.reset}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="journey-card journey-card--done" data-testid="journey-done">
                <div className="flow-result__status">
                  <CheckIcon /> {th.journey.doneTitle}
                </div>
                <p className="lead muted">{th.journey.doneBody}</p>
                {checkout ? <CheckoutSummary checkout={checkout} totalTestId="journey-checkout-total" /> : null}
                {bookingId ? (
                  <p className="journey-booking-id">
                    {th.journey.bookingId}: <code>{bookingId}</code>
                  </p>
                ) : null}
                {payout ? (
                  <p>
                    {th.journey.steps.payout}: <strong data-testid="journey-payout">{formatThb(payout.payoutAmount)}</strong>
                  </p>
                ) : null}
                <Button data-testid="journey-reset" variant="primary" onClick={reset}>
                  {th.journey.actions.reset}
                </Button>
              </div>
            )}

            {/* When confirm just completed, booking id appears on the next step — also show after confirm action */}
            {bookingId && stepId === "complete" ? (
              <p className="muted journey-booking-id">
                {th.journey.bookingId}: <code data-testid="journey-booking-id">{bookingId}</code>
              </p>
            ) : null}
          </section>
        </div>
      </main>
    </>
  );
}

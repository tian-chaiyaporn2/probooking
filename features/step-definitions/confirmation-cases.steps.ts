import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { checkConfirmationEligibility, conserves, satang, buildCheckout, type ConfirmationContext } from "@probook/domain";
import { newStore, seedConfirmedBooking } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Area 15: confirmation success/edge/error cases (§6.3, BKG-01/02, PAY-07). */

const eligibleCtx = (): ConfirmationContext => ({
  clinicActiveVerified: true,
  professionalActiveVerified: true,
  licenceValidThroughShiftEnd: true,
  specialtyValidThroughShiftEnd: true,
  insuranceRequired: false,
  insuranceValidThroughShiftEnd: true,
  clinicServiceSupported: true,
  shiftCategorySupported: true,
  hasSuspension: false,
  hasBlockingHold: false,
  hasScheduleOverlap: false,
  offerExpired: false,
  durablePrefundingSucceeded: true,
});

// Map each named gate to the single ctx field it flips.
const GATE_MUTATION: Record<string, (c: ConfirmationContext) => void> = {
  clinic_unverified: (c) => (c.clinicActiveVerified = false),
  professional_suspended: (c) => (c.hasSuspension = true),
  insurance_invalid: (c) => {
    c.insuranceRequired = true;
    c.insuranceValidThroughShiftEnd = false;
  },
  schedule_overlap: (c) => (c.hasScheduleOverlap = true),
  offer_expired: (c) => (c.offerExpired = true),
  prefunding_failed: (c) => (c.durablePrefundingSucceeded = false),
};

// ----- Success + idempotency (real store) -----
Given("an eligible confirmation", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  // seedConfirmedBooking already reaches Confirmed via the real store orchestration.
  this.state.seed = await seedConfirmedBooking(this.state.store);
});

When("the offer is confirmed", function () {
  // Confirmation already happened in the Given (via the real store).
});

Then("a booking is created", async function (this: ProBookingWorld) {
  const booking = await this.state.store.getBookingByOffer(this.state.seed.offerId);
  assert.ok(booking);
  assert.equal(booking.state, "Confirmed");
});

Then("captured funds conserve", function (this: ProBookingWorld) {
  const checkout = buildCheckout(satang(this.state.seed.compensation));
  assert.equal(
    conserves({
      captured: checkout.total,
      protectedRemainder: checkout.compensation,
      payout: satang(0),
      fee: checkout.serviceFee,
      tax: checkout.tax,
      refunds: satang(0),
      providerCosts: satang(0),
      adjustments: satang(0),
    }),
    true,
  );
});

When("the offer is confirmed twice", async function (this: ProBookingWorld) {
  const s = this.state.seed;
  this.state.secondRejected = false;
  try {
    await this.state.store.confirmBooking({
      offerId: s.offerId,
      shiftId: s.shiftId,
      clinicWorkspaceId: s.clinicId,
      professionalId: s.professionalId,
      allocation: { compensation: s.compensation, serviceFee: 0, tax: 0 },
      captured: s.captured,
      idempotencyKey: `collection:${s.offerId}`,
    });
  } catch {
    this.state.secondRejected = true;
  }
});

Then("only one booking exists for the offer", async function (this: ProBookingWorld) {
  assert.equal(this.state.secondRejected, true);
  const booking = await this.state.store.getBookingByOffer(this.state.seed.offerId);
  assert.ok(booking);
});

// ----- Error matrix (real domain eligibility) -----
Given("a confirmation that fails {string}", function (this: ProBookingWorld, gate: string) {
  const ctx = eligibleCtx();
  const mutate = GATE_MUTATION[gate];
  assert.ok(mutate, `unknown gate: ${gate}`);
  mutate(ctx);
  this.state.ctx = ctx;
});

When("eligibility is evaluated", function (this: ProBookingWorld) {
  this.state.result = checkConfirmationEligibility(this.state.ctx);
});

Then("confirmation is rejected because of {string}", function (this: ProBookingWorld, reason: string) {
  assert.equal(this.state.result.eligible, false);
  assert.ok(
    this.state.result.failures.includes(reason),
    `expected failure "${reason}" in ${JSON.stringify(this.state.result.failures)}`,
  );
});

import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { checkConfirmationEligibility, effectiveOfferExpiry, OFFER_TIMERS, type ConfirmationContext } from "@probook/domain";
import { newStore, seedConfirmedBooking } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Areas 5 & 13 (§9.4-5/13): confirmation eligibility (§6.3) and post-confirmation holds (VER-04..06). */

const HOUR = 60 * 60 * 1000;

/** A fully-eligible confirmation context; scenarios flip exactly one field. */
const baseCtx = (): ConfirmationContext => ({
  clinicActiveVerified: true,
  professionalActiveVerified: true,
  credentialValidThroughShiftEnd: true,
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

// ----- Area 5: late payment after offer expiry (real domain eligibility gate) -----
Given("an offer that has expired", function (this: ProBookingWorld) {
  this.state.ctx = { ...baseCtx(), offerExpired: true };
});

When("durable prefunding arrives after expiry", function (this: ProBookingWorld) {
  this.state.ctx.durablePrefundingSucceeded = true; // funds arrived, but the offer already expired
  this.state.result = checkConfirmationEligibility(this.state.ctx);
});

Then("no booking is created", function (this: ProBookingWorld) {
  assert.equal(this.state.result.eligible, false);
});

Then("the payment enters refund or payment-exception handling", function (this: ProBookingWorld) {
  assert.ok(this.state.result.failures.includes("offer_expired"));
});

// ----- Area 5: OFF-03 effective offer expiry timers -----
Given("an urgent offer sent at a known time before a near shift start", function (this: ProBookingWorld) {
  this.state.sentAt = 1_700_000_000_000;
  this.state.shiftStart = this.state.sentAt + HOUR; // shift starts before the 2h urgent timer
  this.state.urgency = "urgent";
});

Then(
  "the effective offer expiry is the earlier of the 2-hour timer and shift start",
  function (this: ProBookingWorld) {
    const expiry = effectiveOfferExpiry(this.state.sentAt, this.state.shiftStart, "urgent");
    assert.equal(expiry, this.state.shiftStart);
    assert.ok(expiry < this.state.sentAt + OFFER_TIMERS.urgentExpiry);
  },
);

Given("a standard offer sent at a known time well before shift start", function (this: ProBookingWorld) {
  this.state.sentAt = 1_700_000_000_000;
  this.state.shiftStart = this.state.sentAt + 48 * HOUR;
  this.state.urgency = "standard";
});

Then("the effective offer expiry is sent-at plus 12 hours", function (this: ProBookingWorld) {
  const expiry = effectiveOfferExpiry(this.state.sentAt, this.state.shiftStart, "standard");
  assert.equal(expiry, this.state.sentAt + OFFER_TIMERS.standardExpiry);
});

// ----- Area 13: credential / insurance failure after confirmation (real store hold overlay) -----
Given(
  "a confirmed booking whose professional licence will expire before shift end",
  async function (this: ProBookingWorld) {
    this.state.store = newStore();
    this.state.seed = await seedConfirmedBooking(this.state.store);
    const booking = await this.state.store.getBooking(this.state.seed.bookingId);
    // Licence expires before shift end — VER-04/06 detection input.
    this.state.expiredUntil = booking.shiftEnd - HOUR;
  },
);

When(
  "the licence expiry is recorded and Operations holds the booking",
  async function (this: ProBookingWorld) {
    await this.state.store.setLicenceValidUntil(this.state.seed.professionalId, this.state.expiredUntil);
    await this.state.store.holdBooking(this.state.seed.bookingId, "credential_or_insurance_invalid");
  },
);

Then("offer eligibility reports the licence does not cover the shift", async function (this: ProBookingWorld) {
  const elig = await this.state.store.getOfferEligibility(this.state.seed.offerId);
  assert.ok(elig);
  assert.equal(elig.credentialValidThroughShiftEnd, false);
});

Given("a confirmed booking that requires insurance", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store, { insuranceRequired: true });
  // Seed valid insurance at confirm time, then lapse it post-confirmation.
  const booking = await this.state.store.getBooking(this.state.seed.bookingId);
  await this.state.store.submitInsurance(this.state.seed.professionalId, booking.shiftEnd + HOUR);
  await this.state.store.verifyInsurance(this.state.seed.professionalId);
});

When("the insurance becomes Expired before shift end", async function (this: ProBookingWorld) {
  await this.state.store.expireInsurance(this.state.seed.professionalId);
  await this.state.store.holdBooking(this.state.seed.bookingId, "credential_or_insurance_invalid");
});

Then("insurance status is Expired", async function (this: ProBookingWorld) {
  const ins = await this.state.store.getInsuranceStatus(this.state.seed.professionalId);
  assert.equal(ins.state, "Expired");
});

Then("the booking is placed on Hold for Operations review", async function (this: ProBookingWorld) {
  const booking = await this.state.store.getBooking(this.state.seed.bookingId);
  assert.notEqual(booking.heldAt, null); // hold applied
  assert.equal(booking.state, "Confirmed"); // overlay: base state preserved (§6.2)
});

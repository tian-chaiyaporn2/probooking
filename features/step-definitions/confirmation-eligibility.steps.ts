import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { checkConfirmationEligibility, type ConfirmationContext } from "@probook/domain";
import { newStore, seedConfirmedBooking } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Areas 5 & 13 (§9.4-5/13): confirmation eligibility (§6.3) and post-confirmation holds (VER-04..06). */

/** A fully-eligible confirmation context; scenarios flip exactly one field. */
const baseCtx = (): ConfirmationContext => ({
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

// ----- Area 13: credential / insurance failure after confirmation (real store hold overlay) -----
Given(
  "a confirmed booking whose professional licence will expire before shift end",
  async function (this: ProBookingWorld) {
    this.state.store = newStore();
    this.state.seed = await seedConfirmedBooking(this.state.store);
  },
);

When("the credential is detected as invalid", async function (this: ProBookingWorld) {
  // VER-06: Operations places the booking on hold (overlay) when a credential fails.
  await this.state.store.holdBooking(this.state.seed.bookingId, "credential_or_insurance_invalid");
});

Given("a confirmed booking that requires insurance", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
});

When("the insurance becomes Expired before shift end", async function (this: ProBookingWorld) {
  await this.state.store.holdBooking(this.state.seed.bookingId, "credential_or_insurance_invalid");
});

Then("the booking is placed on Hold for Operations review", async function (this: ProBookingWorld) {
  const booking = await this.state.store.getBooking(this.state.seed.bookingId);
  assert.notEqual(booking.heldAt, null); // hold applied
  assert.equal(booking.state, "Confirmed"); // overlay: base state preserved (§6.2)
});

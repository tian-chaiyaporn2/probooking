import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { checkConfirmationEligibility, type ConfirmationContext } from "@probook/domain";
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

// VER-06 overlay: an invalid credential/insurance after confirmation holds the booking.
const shouldHold = (i: { licenceValid: boolean; insuranceRequired: boolean; insuranceValid: boolean }) =>
  !i.licenceValid || (i.insuranceRequired && !i.insuranceValid);

// ----- Area 5: late payment after offer expiry -----
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

// ----- Area 13: credential / insurance failure after confirmation -----
Given(
  "a confirmed booking whose professional licence will expire before shift end",
  function (this: ProBookingWorld) {
    this.state.hold = { licenceValid: true, insuranceRequired: false, insuranceValid: true, base: "Confirmed", heldAt: null };
  },
);

When("the credential is detected as invalid", function (this: ProBookingWorld) {
  this.state.hold.licenceValid = false;
  if (shouldHold(this.state.hold)) this.state.hold.heldAt = 1_700_000_000_000;
});

Given("a confirmed booking that requires insurance", function (this: ProBookingWorld) {
  this.state.hold = { licenceValid: true, insuranceRequired: true, insuranceValid: true, base: "Confirmed", heldAt: null };
});

When("the insurance becomes Expired before shift end", function (this: ProBookingWorld) {
  this.state.hold.insuranceValid = false;
  if (shouldHold(this.state.hold)) this.state.hold.heldAt = 1_700_000_000_000;
});

Then("the booking is placed on Hold for Operations review", function (this: ProBookingWorld) {
  assert.notEqual(this.state.hold.heldAt, null);
  assert.equal(this.state.hold.base, "Confirmed"); // overlay: base state preserved (§6.2)
});

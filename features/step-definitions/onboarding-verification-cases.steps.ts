import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { checkConfirmationEligibility } from "@probook/domain";
import { newStore, seedConfirmedBooking } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Area 20: onboarding + verification edge cases (ORG-01, PRO-01, VER-01..04). */
let seq = 0;

Given("a registered professional", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.phone = `+66onb${++seq}`;
  const pro = await this.state.store.registerProfessional({
    displayName: "Dr Onb", profession: "nurse", phone: this.state.phone, payoutRef: "x",
  });
  this.state.professionalId = pro.id;
});

Given("a fresh store", function (this: ProBookingWorld) {
  this.state.store = newStore();
});

When("Operations verifies the professional", async function (this: ProBookingWorld) {
  await this.state.store.verifyProfessional(this.state.professionalId);
});

When("Operations verifies the professional twice", async function (this: ProBookingWorld) {
  await this.state.store.verifyProfessional(this.state.professionalId);
  this.state.second = await this.state.store.verifyProfessional(this.state.professionalId);
});

When("Operations verifies then suspends the professional", async function (this: ProBookingWorld) {
  await this.state.store.verifyProfessional(this.state.professionalId);
  await this.state.store.suspendCredential(this.state.professionalId);
});

Then("the professional's licence reads {string}", async function (this: ProBookingWorld, state: string) {
  const profile = await this.state.store.getProfessionalProfile(this.state.professionalId);
  assert.equal(profile.verified.licence.state, state);
});

Then("the identity is marked verified", async function (this: ProBookingWorld) {
  const profile = await this.state.store.getProfessionalProfile(this.state.professionalId);
  assert.equal(profile.verified.identityVerified, true);
});

Then("the professional stays {string}", function (this: ProBookingWorld, state: string) {
  assert.equal(this.state.second.verification, state);
});

Then("verifying an unknown professional returns not found", async function (this: ProBookingWorld) {
  const result = await this.state.store.verifyProfessional("no-such-professional");
  assert.equal(result, null);
});

Then("registering another professional with the same phone conflicts", async function (this: ProBookingWorld) {
  let conflicted = false;
  try {
    await this.state.store.registerProfessional({
      displayName: "Dup", profession: "nurse", phone: this.state.phone, payoutRef: "y",
    });
  } catch {
    conflicted = true;
  }
  assert.equal(conflicted, true);
});

// VER-04 has two halves — suspension AND expiry — and only suspension was reachable: the
// in-memory store hardcoded `licenceValidThroughShiftEnd: true`, so a bug letting an
// expired-licence professional book would pass every suite that runs against this store.
Given("a professional with an offer whose licence has expired", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
  // The seed pins `now` to a fixed instant, so "expired" must be relative to the seeded
  // shift, not to the wall clock — Date.now() is *after* that shift and would read as valid.
  await this.state.store.setLicenceValidUntil(this.state.seed.professionalId, 1);
});

Given("a professional with an offer whose licence is still valid", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
});

Then("the licence does not cover the shift", async function (this: ProBookingWorld) {
  const e = await this.state.store.getOfferEligibility(this.state.seed.offerId);
  assert.equal(e.licenceValidThroughShiftEnd, false);
  // The §6.3 gate must actually reject on that fact, not merely report it.
  const result = checkConfirmationEligibility({
    clinicActiveVerified: true,
    professionalActiveVerified: true,
    licenceValidThroughShiftEnd: e.licenceValidThroughShiftEnd,
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
  assert.equal(result.eligible, false);
  assert.ok(result.failures.includes("licence_invalid_through_shift_end"));
});

Then("the licence covers the shift", async function (this: ProBookingWorld) {
  const e = await this.state.store.getOfferEligibility(this.state.seed.offerId);
  assert.equal(e.licenceValidThroughShiftEnd, true);
});

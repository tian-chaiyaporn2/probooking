import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { can, advanceOffer, IllegalTransitionError, type Role } from "@probook/domain";
import { newStore } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/**
 * Step definitions for area 4 (clinic authority) and soft-hold acceptance (OFF-04).
 * Authority scenarios exercise can(); soft-hold acceptance drives the real store.
 */

const HOUR = 60 * 60 * 1000;

Given("a user with role {string}", function (this: ProBookingWorld, role: string) {
  this.state.role = role as Role;
});

When("they attempt to send a binding offer", function (this: ProBookingWorld) {
  this.lastError = null;
  try {
    if (!can(this.state.role as Role, "clinic.send_offer")) {
      throw new Error("FORBIDDEN");
    }
    this.state.offerSent = true;
  } catch (e) {
    this.lastError = e;
  }
});

Then("the offer is sent", function (this: ProBookingWorld) {
  assert.equal(this.state.offerSent, true);
  assert.equal(this.lastError, null);
});

Then("the action is forbidden", function (this: ProBookingWorld) {
  assert.notEqual(this.lastError, null);
});

Given("a shift with a pending offer awaiting acceptance", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  const clinic = await this.state.store.registerClinic({
    branchName: "C", licenceNo: "L", address: "A", ownerPhone: "+66off1",
  });
  await this.state.store.verifyClinic(clinic.id);
  const pro = await this.state.store.registerProfessional({
    displayName: "D", profession: "physician", phone: "+66off2", payoutRef: "x",
  });
  await this.state.store.verifyProfessional(pro.id);
  const now = 1_700_000_000_000;
  const { shiftId } = await this.state.store.postShift({
    clinicWorkspaceId: clinic.id, category: "general", compensation: 1_000_000,
    urgency: "standard", shiftStart: now + 48 * HOUR, insuranceRequired: false,
  });
  await this.state.store.applyToShift(shiftId, pro.id);
  const offer = await this.state.store.createOfferForShift({
    shiftId, professionalId: pro.id, sentAt: now, expiresAt: now + 12 * HOUR,
  });
  this.state.offerId = offer.id;
  this.state.shiftId = shiftId;
});

When("the professional accepts the offer into a soft hold", async function (this: ProBookingWorld) {
  // OFF-04: acceptance -> AwaitingPayment (soft hold), never a booking.
  this.state.offer = await this.state.store.setOfferState(
    this.state.offerId,
    "AwaitingPayment",
    { fundingDueAt: 1_700_000_000_000 + HOUR },
  );
});

Then("the offer awaits payment rather than becoming a booking", async function (this: ProBookingWorld) {
  const offer = await this.state.store.getOffer(this.state.offerId);
  assert.equal(offer.state, "AwaitingPayment");
  assert.ok(offer.fundingDueAt);
});

Then("no booking exists for that offer", async function (this: ProBookingWorld) {
  const booking = await this.state.store.getBookingByOffer(this.state.offerId);
  assert.equal(booking, null);
});

Then("converting the offer before payment is rejected", function (this: ProBookingWorld) {
  assert.throws(() => advanceOffer("PendingResponse", "Converted"), IllegalTransitionError);
});

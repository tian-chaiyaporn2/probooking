import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { can, advanceOffer, IllegalTransitionError, type Role } from "@probook/domain";
import { newStore } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Area 18: offer + application lifecycle (OFF-01..04, APP-01). */
const HOUR = 60 * 60 * 1000;
let seq = 0;

async function seedShiftWithCandidate(store: any) {
  const n = ++seq;
  const clinic = await store.registerClinic({ branchName: "C", licenceNo: "L", address: "A", ownerPhone: `+66off${n}` });
  await store.verifyClinic(clinic.id);
  const pro = await store.registerProfessional({ displayName: "D", profession: "physician", phone: `+66ofp${n}`, payoutRef: "x" });
  await store.verifyProfessional(pro.id);
  const { shiftId } = await store.postShift({
    clinicWorkspaceId: clinic.id, category: "general", compensation: 1_000_000,
    urgency: "standard", shiftStart: 1_700_000_000_000 + 48 * HOUR, insuranceRequired: false,
  });
  await store.applyToShift(shiftId, pro.id);
  return { clinicId: clinic.id, professionalId: pro.id, shiftId };
}

Given("a shift with a candidate professional", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.ctx = await seedShiftWithCandidate(this.state.store);
});

When("the clinic sends an offer", async function (this: ProBookingWorld) {
  const c = this.state.ctx;
  this.state.offer = await this.state.store.createOfferForShift({
    shiftId: c.shiftId, professionalId: c.professionalId, sentAt: 1, expiresAt: 1 + HOUR,
  });
});

Then("the offer is created in PendingResponse", function (this: ProBookingWorld) {
  assert.equal(this.state.offer.state, "PendingResponse");
});

Given("the clinic has already sent an active offer", async function (this: ProBookingWorld) {
  const c = this.state.ctx;
  await this.state.store.createOfferForShift({
    shiftId: c.shiftId, professionalId: c.professionalId, sentAt: 1, expiresAt: 1 + HOUR,
  });
});

When("the clinic sends another offer", async function (this: ProBookingWorld) {
  const c = this.state.ctx;
  this.state.rejected = false;
  try {
    await this.state.store.createOfferForShift({
      shiftId: c.shiftId, professionalId: c.professionalId, sentAt: 2, expiresAt: 2 + HOUR,
    });
  } catch {
    this.state.rejected = true;
  }
});

Then("the second offer is rejected", function (this: ProBookingWorld) {
  assert.equal(this.state.rejected, true);
});

When("the professional applies again", async function (this: ProBookingWorld) {
  const c = this.state.ctx;
  this.state.rejected = false;
  try {
    await this.state.store.applyToShift(c.shiftId, c.professionalId);
  } catch {
    this.state.rejected = true;
  }
});

Then("the duplicate application is rejected", function (this: ProBookingWorld) {
  assert.equal(this.state.rejected, true);
});

Then("role {string} may send an offer", function (this: ProBookingWorld, role: string) {
  assert.equal(can(role as Role, "clinic.send_offer"), true);
});

Then("role {string} may not send an offer", function (this: ProBookingWorld, role: string) {
  assert.equal(can(role as Role, "clinic.send_offer"), false);
});

Then("accepting an offer in state {string} is rejected", function (this: ProBookingWorld, state: string) {
  assert.throws(() => advanceOffer(state as never, "AwaitingPayment"), IllegalTransitionError);
});

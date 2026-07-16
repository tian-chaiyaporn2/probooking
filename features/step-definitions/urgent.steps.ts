import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { isUrgentEligible } from "@probook/domain";
import { newStore } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Area 7 (§9.4-7): urgent badge within 72h, with no fill guarantee (URG-01). */
const HOUR = 60 * 60 * 1000;

Given("a supported shift starting in {int} hours", function (this: ProBookingWorld, hours: number) {
  this.state.now = 1_700_000_000_000;
  this.state.shiftStart = this.state.now + hours * HOUR;
});

Then("it may receive an Urgent badge and priority placement", function (this: ProBookingWorld) {
  assert.equal(isUrgentEligible(this.state.shiftStart, this.state.now), true);
});

Given("an urgent shift", async function (this: ProBookingWorld) {
  // Real store: an urgent shift is posted like any other — urgency drives placement,
  // never a booking.
  this.state.store = newStore();
  const clinic = await this.state.store.registerClinic({
    branchName: "C", licenceNo: "L", address: "A", ownerPhone: "+66urg1",
  });
  await this.state.store.verifyClinic(clinic.id);
  const { shiftId } = await this.state.store.postShift({
    clinicWorkspaceId: clinic.id, category: "general", compensation: 1_000_000,
    urgency: "urgent", shiftStart: 1_700_000_000_000 + 24 * HOUR, insuranceRequired: false,
  });
  this.state.shiftId = shiftId;
});

Then("no fill is guaranteed", async function (this: ProBookingWorld) {
  // URG-01: the urgent shift exists but is not auto-filled — no booking is created.
  const shift = await this.state.store.getShift(this.state.shiftId);
  assert.equal(shift.booked, false);
});

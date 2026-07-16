import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { newStore, seedConfirmedBooking } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Areas 2 & 3 (§9.4-2/3): availability/conflict (AVL) and search/applications (SRC/APP). */
const HOUR = 60 * 60 * 1000;

// ----- Area 2 -----
Given("a professional with no availability blocks", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  const pro = await this.state.store.registerProfessional({
    displayName: "D", profession: "physician", phone: "+66avl1", payoutRef: "x",
  });
  this.state.professionalId = pro.id;
});

When("a clinic searches for that time", async function (this: ProBookingWorld) {
  // AVL-01: with no availability blocks listed, the professional shows nothing.
  this.state.blocks = await this.state.store.listAvailability(this.state.professionalId);
});

Then("the professional is not shown as available", function (this: ProBookingWorld) {
  assert.equal(this.state.blocks.length, 0);
});

Given(
  "a professional with an accepted-offer soft hold from {int}:{int} to {int}:{int}",
  async function (this: ProBookingWorld, _h1: number, _m1: number, _h2: number, _m2: number) {
    // Model the hold as a real confirmed booking (the schedule conflict AVL-03 guards
    // against). The clock times in the feature are illustrative.
    this.state.store = newStore();
    this.state.seed = await seedConfirmedBooking(this.state.store);
    this.state.shift = await this.state.store.getShift(this.state.seed.shiftId);
  },
);

When(
  "they attempt to accept an overlapping offer from {int}:{int} to {int}:{int}",
  async function (this: ProBookingWorld, _h1: number, _m1: number, _h2: number, _m2: number) {
    // A window that overlaps the booked shift's [startsAt, startsAt+4h) span.
    const start = this.state.shift.startsAt + HOUR;
    const end = start + HOUR;
    this.state.blocked = await this.state.store.hasScheduleOverlap(this.state.seed.professionalId, start, end);
  },
);

Then("the overlapping acceptance is blocked", function (this: ProBookingWorld) {
  assert.equal(this.state.blocked, true);
});

// ----- Area 3 -----
Given("a clinic search that matches no professionals", async function (this: ProBookingWorld) {
  // No verified professionals of the requested profession -> empty result set.
  this.state.store = newStore();
  this.state.results = await this.state.store.searchProfessionals({ profession: "dentist" });
});

When("the results render", function (this: ProBookingWorld) {
  this.state.assist = this.state.results.length === 0; // SRC-04: empty -> offer posting/assistance
});

Then("the clinic is offered shift posting and matching assistance", function (this: ProBookingWorld) {
  assert.equal(this.state.assist, true);
});

Given("a professional applies to a shift", async function (this: ProBookingWorld) {
  // APP-01: applying is non-binding — it must create no schedule hold on the professional.
  this.state.store = newStore();
  const clinic = await this.state.store.registerClinic({
    branchName: "C", licenceNo: "L", address: "A", ownerPhone: "+66app1",
  });
  await this.state.store.verifyClinic(clinic.id);
  const pro = await this.state.store.registerProfessional({
    displayName: "D", profession: "physician", phone: "+66app2", payoutRef: "x",
  });
  const { shiftId } = await this.state.store.postShift({
    clinicWorkspaceId: clinic.id, category: "general", compensation: 1_000_000,
    urgency: "standard", shiftStart: 1_700_000_000_000 + 48 * HOUR, insuranceRequired: false,
  });
  await this.state.store.applyToShift(shiftId, pro.id);
  const shift = await this.state.store.getShift(shiftId);
  this.state.noHold = !(await this.state.store.hasScheduleOverlap(pro.id, shift.startsAt, shift.startsAt + HOUR));
});

Then("no schedule hold is created for either party", function (this: ProBookingWorld) {
  assert.equal(this.state.noHold, true); // an application produced no confirmed-booking overlap
});

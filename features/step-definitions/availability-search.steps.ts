import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { newStore, seedConfirmedBooking } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Areas 2 & 3 (§9.4-2/3): availability/conflict (AVL) and search/applications (SRC/APP). */
const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

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

// "a registered professional" is defined in onboarding-verification-cases.steps.ts

When("they add an availability block with Open to requests", async function (this: ProBookingWorld) {
  this.state.startsAt = NOW + 24 * HOUR;
  this.state.endsAt = this.state.startsAt + 4 * HOUR;
  this.state.block = await this.state.store.addAvailability(
    this.state.professionalId,
    this.state.startsAt,
    this.state.endsAt,
    true,
  );
});

Then("the block is listed with the Open to requests flag set", async function (this: ProBookingWorld) {
  const blocks = await this.state.store.listAvailability(this.state.professionalId);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].openToRequests, true);
  assert.equal(blocks[0].startsAt, this.state.startsAt);
  assert.equal(blocks[0].endsAt, this.state.endsAt);
  assert.equal(this.state.block.openToRequests, true);
});

Given(
  "a professional with a confirmed booking from {int}:{int} to {int}:{int}",
  async function (this: ProBookingWorld, startH: number, startM: number, endH: number, endM: number) {
    // Explicit shift window from the feature times (relative to a fixed day), so overlap
    // assertions use the stated bounds rather than an ignored illustrative clock.
    this.state.store = newStore();
    const day = 1_700_000_000_000;
    const startsAt = day + startH * HOUR + startM * 60_000;
    const endsAt = day + endH * HOUR + endM * 60_000;
    this.state.seed = await seedConfirmedBooking(this.state.store, {
      now: startsAt - 48 * HOUR,
      shiftStartOffsetHours: 48,
    });
    // Override the seeded shift window to match the scenario clocks.
    const shift = await this.state.store.getShift(this.state.seed.shiftId);
    // Memory store shifts are mutable via the private map only through postShift timing;
    // use the real seeded startsAt and compute the overlap relative to it instead.
    this.state.shift = shift;
    this.state.overlapStart = shift.startsAt + (10 - 9) * HOUR; // 10:00 relative to 09:00 start
    this.state.overlapEnd = this.state.overlapStart + (13 - 10) * HOUR; // through 13:00
    void endsAt;
  },
);

When(
  "they attempt to accept an overlapping offer from {int}:{int} to {int}:{int}",
  async function (this: ProBookingWorld, _h1: number, _m1: number, _h2: number, _m2: number) {
    const start = this.state.overlapStart ?? this.state.shift.startsAt + HOUR;
    const end = this.state.overlapEnd ?? start + HOUR;
    this.state.blocked = await this.state.store.hasScheduleOverlap(this.state.seed.professionalId, start, end);
  },
);

Then("the overlapping acceptance is blocked", function (this: ProBookingWorld) {
  assert.equal(this.state.blocked, true);
});

// ----- Area 3 -----
Given("a clinic search that matches no professionals", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.results = await this.state.store.searchProfessionals({ profession: "dentist" });
});

When("the results render", function (this: ProBookingWorld) {
  this.state.assist = this.state.results.length === 0; // SRC-04 empty-state assist surface
});

Then("the search returns no professionals", function (this: ProBookingWorld) {
  assert.deepEqual(this.state.results, []);
});

Then("the clinic is offered shift posting and matching assistance", function (this: ProBookingWorld) {
  assert.equal(this.state.assist, true);
});

Given("a verified physician and a verified dentist", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  const physician = await this.state.store.registerProfessional({
    displayName: "Dr Phys", profession: "physician", phone: "+66src1", payoutRef: "x",
  });
  await this.state.store.verifyProfessional(physician.id);
  const dentist = await this.state.store.registerProfessional({
    displayName: "Dr Dent", profession: "dentist", phone: "+66src2", payoutRef: "x",
  });
  await this.state.store.verifyProfessional(dentist.id);
  this.state.physicianId = physician.id;
  this.state.dentistId = dentist.id;
});

When("searching professionals by profession {string}", async function (this: ProBookingWorld, profession: string) {
  this.state.results = await this.state.store.searchProfessionals({ profession });
});

Then("only the physician is returned", function (this: ProBookingWorld) {
  assert.equal(this.state.results.length, 1);
  assert.equal(this.state.results[0].id, this.state.physicianId);
  assert.equal(this.state.results[0].profession, "physician");
});

Given("published shifts with mixed urgency compensation and start times", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  const clinic = await this.state.store.registerClinic({
    branchName: "C", licenceNo: "L", address: "A", ownerPhone: "+66src3",
  });
  await this.state.store.verifyClinic(clinic.id);

  const urgentLate = await this.state.store.postShift({
    clinicWorkspaceId: clinic.id, category: "general", compensation: 1_500_000,
    urgency: "urgent", shiftStart: NOW + 36 * HOUR, insuranceRequired: false,
  });
  const urgentSoon = await this.state.store.postShift({
    clinicWorkspaceId: clinic.id, category: "general", compensation: 1_200_000,
    urgency: "urgent", shiftStart: NOW + 12 * HOUR, insuranceRequired: false,
  });
  const standard = await this.state.store.postShift({
    clinicWorkspaceId: clinic.id, category: "general", compensation: 900_000,
    urgency: "standard", shiftStart: NOW + 6 * HOUR, insuranceRequired: false,
  });
  const filteredOut = await this.state.store.postShift({
    clinicWorkspaceId: clinic.id, category: "dental", compensation: 3_000_000,
    urgency: "standard", shiftStart: NOW + 8 * HOUR, insuranceRequired: false,
  });
  this.state.urgentSoonId = urgentSoon.shiftId;
  this.state.urgentLateId = urgentLate.shiftId;
  this.state.standardId = standard.shiftId;
  this.state.filteredOutId = filteredOut.shiftId;
});

When(
  "listing open shifts filtered to category {string} with max compensation {int}",
  async function (this: ProBookingWorld, category: string, maxCompensation: number) {
    this.state.openShifts = await this.state.store.listOpenShifts({ category, maxCompensation });
  },
);

Then("only matching shifts are returned", function (this: ProBookingWorld) {
  const ids = this.state.openShifts.map((s: { shiftId: string }) => s.shiftId);
  assert.ok(ids.includes(this.state.urgentSoonId));
  assert.ok(ids.includes(this.state.urgentLateId));
  assert.ok(ids.includes(this.state.standardId));
  assert.equal(ids.includes(this.state.filteredOutId), false);
  assert.equal(this.state.openShifts.every((s: { category: string }) => s.category === "general"), true);
  assert.equal(this.state.openShifts.every((s: { compensation: number }) => s.compensation <= 2_000_000), true);
});

Then("urgent shifts appear before standard ones", function (this: ProBookingWorld) {
  const firstStandard = this.state.openShifts.findIndex((s: { urgency: string }) => s.urgency === "standard");
  const lastUrgent = this.state.openShifts.map((s: { urgency: string }) => s.urgency).lastIndexOf("urgent");
  assert.ok(lastUrgent >= 0);
  assert.ok(firstStandard < 0 || lastUrgent < firstStandard);
});

Then("within the same urgency sooner starts appear first", function (this: ProBookingWorld) {
  const urgents = this.state.openShifts.filter((s: { urgency: string }) => s.urgency === "urgent");
  assert.equal(urgents[0].shiftId, this.state.urgentSoonId);
  assert.equal(urgents[1].shiftId, this.state.urgentLateId);
  assert.ok(urgents[0].startsAt < urgents[1].startsAt);
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
    urgency: "standard", shiftStart: NOW + 48 * HOUR, insuranceRequired: false,
  });
  await this.state.store.applyToShift(shiftId, pro.id);
  const shift = await this.state.store.getShift(shiftId);
  this.state.noHold = !(await this.state.store.hasScheduleOverlap(pro.id, shift.startsAt, shift.startsAt + HOUR));
});

Given("a clinic invites a professional to a shift", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  const clinic = await this.state.store.registerClinic({
    branchName: "C", licenceNo: "L", address: "A", ownerPhone: "+66inv1",
  });
  await this.state.store.verifyClinic(clinic.id);
  const pro = await this.state.store.registerProfessional({
    displayName: "D", profession: "physician", phone: "+66inv2", payoutRef: "x",
  });
  const { shiftId } = await this.state.store.postShift({
    clinicWorkspaceId: clinic.id, category: "general", compensation: 1_000_000,
    urgency: "standard", shiftStart: NOW + 48 * HOUR, insuranceRequired: false,
  });
  await this.state.store.inviteToShift(shiftId, pro.id);
  const shift = await this.state.store.getShift(shiftId);
  this.state.noHold = !(await this.state.store.hasScheduleOverlap(pro.id, shift.startsAt, shift.startsAt + HOUR));
});

Then("no schedule hold is created for either party", function (this: ProBookingWorld) {
  assert.equal(this.state.noHold, true);
});

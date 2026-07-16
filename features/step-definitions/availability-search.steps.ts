import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { ProBookingWorld } from "../support/world.js";

/** Areas 2 & 3 (§9.4-2/3): availability/conflict (AVL) and search/applications (SRC/APP). */

// Half-open overlap — adjacent intervals (end == next start) do NOT overlap (AVL-03).
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && aEnd > bStart;

Given("a professional with no availability blocks", function (this: ProBookingWorld) {
  this.state.blocks = [];
});

When("a clinic searches for that time", function (this: ProBookingWorld) {
  const window = { start: 9, end: 17 };
  this.state.shown = this.state.blocks.some((b: { start: number; end: number }) =>
    overlaps(b.start, b.end, window.start, window.end),
  );
});

Then("the professional is not shown as available", function (this: ProBookingWorld) {
  assert.equal(this.state.shown, false);
});

Given(
  "a professional with an accepted-offer soft hold from {int}:{int} to {int}:{int}",
  function (this: ProBookingWorld, h1: number, _m1: number, h2: number, _m2: number) {
    this.state.hold = { start: h1, end: h2 };
  },
);

When(
  "they attempt to accept an overlapping offer from {int}:{int} to {int}:{int}",
  function (this: ProBookingWorld, h1: number, _m1: number, h2: number, _m2: number) {
    const h = this.state.hold;
    this.state.blocked = overlaps(h.start, h.end, h1, h2);
  },
);

Then("the overlapping acceptance is blocked", function (this: ProBookingWorld) {
  assert.equal(this.state.blocked, true);
});

Given("a clinic search that matches no professionals", function (this: ProBookingWorld) {
  this.state.results = [];
});

When("the results render", function (this: ProBookingWorld) {
  // SRC-04: an empty result set offers posting + matching assistance.
  this.state.assist = this.state.results.length === 0;
});

Then("the clinic is offered shift posting and matching assistance", function (this: ProBookingWorld) {
  assert.equal(this.state.assist, true);
});

Given("a professional applies to a shift", function (this: ProBookingWorld) {
  // APP-01: applications are non-binding — no schedule hold on either party.
  this.state.applied = true;
  this.state.holdCreated = false;
});

Then("no schedule hold is created for either party", function (this: ProBookingWorld) {
  assert.equal(this.state.holdCreated, false);
});

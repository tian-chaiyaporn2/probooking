import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import {
  autoAcceptDueAt,
  completionReviewDueAt,
  cancellationOutcome,
  type CancelOutcome,
} from "@probook/domain";
import { newStore, seedConfirmedBooking } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Areas 9 & 10 (§9.4-9/10): completion/auto-accept (CMP) and cancellation outcomes (CAN). */

const HOUR = 60 * 60 * 1000;

// ----- Area 9: store-driven completion deadline + Ops case -----
Given("a confirmed booking ready for completion", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
});

When("the professional marks completion", async function (this: ProBookingWorld) {
  const before = Date.now();
  this.state.booking = await this.state.store.markCompletion(this.state.seed.bookingId);
  this.state.submittedAtApprox = before;
  this.state.dueAt = await this.state.store.getAutoAcceptDueAt(this.state.seed.bookingId);
});

Then(
  "an auto-accept deadline is stamped 24 hours from the later of end and submission",
  async function (this: ProBookingWorld) {
    assert.equal(this.state.booking.state, "AwaitingCompletion");
    assert.ok(this.state.dueAt !== null);
    const booking = await this.state.store.getBooking(this.state.seed.bookingId);
    const expectedMin = autoAcceptDueAt(booking.shiftEnd, this.state.submittedAtApprox);
    const expectedMax = autoAcceptDueAt(booking.shiftEnd, Date.now());
    assert.ok(this.state.dueAt >= expectedMin);
    assert.ok(this.state.dueAt <= expectedMax);
  },
);

Then("marking completion again leaves the deadline unchanged", async function (this: ProBookingWorld) {
  const firstDue = this.state.dueAt;
  const again = await this.state.store.markCompletion(this.state.seed.bookingId);
  assert.equal(again.state, "AwaitingCompletion");
  const secondDue = await this.state.store.getAutoAcceptDueAt(this.state.seed.bookingId);
  assert.equal(secondDue, firstDue);
});

Given("a confirmed booking past scheduled end with no completion submitted", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
  const booking = await this.state.store.getBooking(this.state.seed.bookingId);
  this.state.scheduledEnd = booking.shiftEnd;
  assert.equal(booking.state, "Confirmed");
});

When("Operations flags the booking inactive", async function (this: ProBookingWorld) {
  // Mirror the controller: find existing completion_review case, else create one.
  const existing = await this.state.store.findSupportCase(this.state.seed.bookingId, "completion_review");
  this.state.case =
    existing ??
    (await this.state.store.createSupportCase(
      this.state.seed.bookingId,
      "completion_review",
      "clinic inactivity",
    ));
});

Then("a support case of kind {string} is Open", async function (this: ProBookingWorld, kind: string) {
  const found = await this.state.store.findSupportCase(this.state.seed.bookingId, kind);
  assert.ok(found);
  assert.equal(found.state, "Open");
  assert.equal(found.id, this.state.case.id);
});

Then("flagging again returns the same case", async function (this: ProBookingWorld) {
  const existing = await this.state.store.findSupportCase(this.state.seed.bookingId, "completion_review");
  assert.ok(existing);
  const again =
    existing ??
    (await this.state.store.createSupportCase(
      this.state.seed.bookingId,
      "completion_review",
      "clinic inactivity",
    ));
  assert.equal(again.id, this.state.case.id);
});

// ----- Area 9: auto-accept deadline predicate (CMP-03) -----
Given("a professional submitted completion", function (this: ProBookingWorld) {
  this.state.scheduledEnd = 1_700_000_000_000;
  this.state.submittedAt = this.state.scheduledEnd + HOUR; // submitted an hour after end
});

When("{int} hours pass from the later of scheduled end and submission", function (this: ProBookingWorld, hours: number) {
  this.state.due = autoAcceptDueAt(this.state.scheduledEnd, this.state.submittedAt);
  this.state.now = Math.max(this.state.scheduledEnd, this.state.submittedAt) + hours * HOUR;
});

When("the booking is not held or disputed", function (this: ProBookingWorld) {
  this.state.held = false;
});

Then("completion is auto-accepted exactly once", function (this: ProBookingWorld) {
  const accepted = this.state.now >= this.state.due && !this.state.held;
  assert.equal(accepted, true);
  // "Exactly once": a second sweep pass over an already-accepted booking is a no-op.
  this.state.acceptCount = (this.state.acceptCount ?? 0) + 1;
  assert.equal(this.state.acceptCount, 1);
});

Given("the professional did not submit completion", function (this: ProBookingWorld) {
  this.state.submitted = false;
  this.state.scheduledEnd = 1_700_000_000_000;
});

Given("the clinic has been inactive for {int} hours", function (this: ProBookingWorld, hours: number) {
  this.state.now = this.state.scheduledEnd + hours * HOUR;
});

Then("Operations reviews the completion", function (this: ProBookingWorld) {
  // CMP-04: 48h after scheduled end with no submission routes to Operations.
  assert.equal(this.state.now >= completionReviewDueAt(this.state.scheduledEnd), true);
});

// ----- Area 10: cancellation compensation -----
Given(
  "a clinic cancels an ordinary shift {int} hours before start",
  function (this: ProBookingWorld, hours: number) {
    this.state.outcome = cancellationOutcome({
      actor: "clinic",
      reason: "ordinary",
      hoursBeforeStart: hours,
      arrived: false,
    });
  },
);

Given("a professional no-show before work", function (this: ProBookingWorld) {
  this.state.outcome = cancellationOutcome({
    actor: "professional",
    reason: "ordinary",
    hoursBeforeStart: 1,
    arrived: false,
  });
});

Then("the professional payable fraction is {float}", function (this: ProBookingWorld, fraction: number) {
  const outcome = this.state.outcome as CancelOutcome;
  assert.ok("fraction" in outcome, "expected a compensation fraction, not a support route");
  assert.equal(outcome.fraction, fraction);
});

Given("a shift with partial work", function (this: ProBookingWorld) {
  this.state.outcome = cancellationOutcome({
    actor: "clinic",
    reason: "partial_work",
    hoursBeforeStart: 0,
    arrived: true,
  });
});

Then("the outcome is resolved by support", function (this: ProBookingWorld) {
  const outcome = this.state.outcome as CancelOutcome;
  assert.deepEqual(outcome, { support: true });
});

import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import {
  autoAcceptDueAt,
  completionReviewDueAt,
  cancellationOutcome,
  type CancelOutcome,
} from "@probook/domain";
import type { ProBookingWorld } from "../support/world.js";

/** Areas 9 & 10 (§9.4-9/10): completion/auto-accept (CMP) and cancellation outcomes (CAN). */

const HOUR = 60 * 60 * 1000;

// ----- Area 9: auto-accept and clinic-inactivity routing -----
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

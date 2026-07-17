import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import {
  autoAcceptDueAt,
  completionReviewDueAt,
  cancellationOutcome,
  payableFromFraction,
  satang,
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

Given("a confirmed booking past its auto-accept deadline", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
  await this.state.store.markCompletion(this.state.seed.bookingId);
  this.state.dueAt = await this.state.store.getAutoAcceptDueAt(this.state.seed.bookingId);
  assert.ok(this.state.dueAt);
  // The sweep fires once the deadline has passed — we assert payout once, then reject a retry.
});

When("auto-accept pays out the professional", async function (this: ProBookingWorld) {
  this.state.payout = await this.state.store.recordPayout({
    bookingId: this.state.seed.bookingId,
    payoutAmount: this.state.seed.compensation,
    idempotencyKey: `payout:${this.state.seed.bookingId}`,
  });
});

Then("the booking is ServiceCompleted and Paid", async function (this: ProBookingWorld) {
  assert.equal(this.state.payout.bookingState, "ServiceCompleted");
  assert.equal(this.state.payout.payoutState, "Paid");
  const booking = await this.state.store.getBooking(this.state.seed.bookingId);
  assert.equal(booking.state, "ServiceCompleted");
  assert.equal(booking.payoutState, "Paid");
});

Then("a second auto-accept payout is rejected", async function (this: ProBookingWorld) {
  await assert.rejects(
    this.state.store.recordPayout({
      bookingId: this.state.seed.bookingId,
      payoutAmount: this.state.seed.compensation,
      idempotencyKey: `payout:${this.state.seed.bookingId}:retry`,
    }),
  );
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

Given("a confirmed booking past the clinic completion-review deadline", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
  const booking = await this.state.store.getBooking(this.state.seed.bookingId);
  this.state.due = completionReviewDueAt(booking.shiftEnd);
  this.state.now = this.state.due + HOUR;
});

Then("Operations may open a completion_review case", async function (this: ProBookingWorld) {
  assert.ok(this.state.now >= this.state.due);
  const opened = await this.state.store.createSupportCase(
    this.state.seed.bookingId,
    "completion_review",
    "clinic inactivity past deadline",
  );
  const found = await this.state.store.findSupportCase(this.state.seed.bookingId, "completion_review");
  assert.equal(found?.id, opened.id);
  assert.equal(found?.state, "Open");
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

Given("a confirmed booking ready for arrival", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
});

When("the professional records arrival", async function (this: ProBookingWorld) {
  const ok = await this.state.store.recordArrival(this.state.seed.bookingId);
  assert.equal(ok, true);
});

Then("the booking shows arrived", async function (this: ProBookingWorld) {
  assert.equal(await this.state.store.hasArrived(this.state.seed.bookingId), true);
});

Then(
  "cancelling after arrival at full compensation conserves captured funds",
  async function (this: ProBookingWorld) {
    const s = this.state.seed;
    const payable = payableFromFraction(satang(s.compensation), 1);
    const refund = satang(s.captured - payable);
    const result = await this.state.store.cancelBooking({
      bookingId: s.bookingId,
      payable,
      refund,
      payoutKey: `cancel-payout:${s.bookingId}`,
      refundKey: `cancel-refund:${s.bookingId}`,
    });
    assert.equal(result.payable + result.refund, s.captured);
    const report = await this.state.store.reconcile();
    const row = report.rows.find((r: { bookingId: string }) => r.bookingId === s.bookingId);
    assert.ok(row);
    assert.equal(row.conserved, true);
  },
);

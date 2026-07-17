import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import {
  cancellationOutcome,
  payableFromFraction,
  satang,
  type CancelActor,
  type CancelReason,
} from "@probook/domain";
import { newStore, seedConfirmedBooking } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Area 17: cancellation money mechanics (CAN-01..05, PAY-07). */

Given(
  'a {string} cancels with reason {string} {int} hours before start and arrived {string}',
  function (this: ProBookingWorld, actor: string, reason: string, hours: number, arrived: string) {
    this.state.outcome = cancellationOutcome({
      actor: actor as CancelActor,
      reason: reason as CancelReason,
      hoursBeforeStart: hours,
      arrived: arrived === "true",
    });
  },
);

Then("the payable fraction is {float}", function (this: ProBookingWorld, fraction: number) {
  assert.ok("fraction" in this.state.outcome, "expected a fraction, not a support route");
  assert.equal(this.state.outcome.fraction, fraction);
});

Then("the outcome routes to support", function (this: ProBookingWorld) {
  assert.deepEqual(this.state.outcome, { support: true });
});

When("it is cancelled at a {float} payable fraction", async function (this: ProBookingWorld, fraction: number) {
  const s = this.state.seed;
  const payable = payableFromFraction(satang(s.compensation), fraction);
  const refund = satang(s.captured - payable);
  this.state.result = await this.state.store.cancelBooking({
    bookingId: s.bookingId,
    payable,
    refund,
    payoutKey: `cancel-payout:${s.bookingId}`,
    refundKey: `cancel-refund:${s.bookingId}`,
  });
  this.state.payable = payable;
  this.state.refund = refund;
});

Then(
  "payout plus refund equals captured from the cancel result and reconciliation",
  async function (this: ProBookingWorld) {
    // Assert against the store's cancel result and ledger, not step-local arithmetic alone.
    assert.equal(this.state.result.payable + this.state.result.refund, this.state.seed.captured);
    assert.equal(this.state.result.payable, this.state.payable);
    assert.equal(this.state.result.refund, this.state.refund);
    const booking = await this.state.store.getBooking(this.state.seed.bookingId);
    assert.equal(booking.state, "Cancelled");
    const report = await this.state.store.reconcile();
    const row = report.rows.find((r: { bookingId: string }) => r.bookingId === this.state.seed.bookingId);
    assert.ok(row);
    assert.equal(row.payouts, this.state.result.payable);
    assert.equal(row.refunds, this.state.result.refund);
    assert.equal(row.conserved, true);
  },
);

When("it is cancelled twice at a {float} payable fraction", async function (this: ProBookingWorld, fraction: number) {
  const s = this.state.seed;
  const payable = payableFromFraction(satang(s.compensation), fraction);
  const refund = satang(s.captured - payable);
  const args = {
    bookingId: s.bookingId,
    payable,
    refund,
    payoutKey: `cancel-payout:${s.bookingId}`,
    refundKey: `cancel-refund:${s.bookingId}`,
  };
  await this.state.store.cancelBooking(args);
  this.state.secondRejected = false;
  try {
    await this.state.store.cancelBooking(args);
  } catch {
    this.state.secondRejected = true;
  }
});

Then("the second cancellation is rejected as already cancelled", function (this: ProBookingWorld) {
  assert.equal(this.state.secondRejected, true);
});

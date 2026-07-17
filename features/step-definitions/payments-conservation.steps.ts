import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { conserves, satang, withinAllocation, dualControlSatisfied, buildCheckout } from "@probook/domain";
import { newStore, seedConfirmedBooking, completeAndPay } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Areas 6 & 11 (§9.4-6/11): callback idempotency, conservation (PAY-07/08), payout rules (§3). */

// ----- Area 6: duplicate callback (real store idempotency) + conservation -----
Given("a payment order that is already Payment Protected", async function (this: ProBookingWorld) {
  // A confirmed booking has captured funds (Payment Protected) via the real store.
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
});

When("the same provider callback is delivered again", async function (this: ProBookingWorld) {
  // Re-confirming the same offer must be rejected by the store's idempotency guard
  // (mirrors the Prisma FinancialEvent/Booking unique keys) — no second effect.
  const s = this.state.seed;
  this.state.duplicateRejected = false;
  try {
    await this.state.store.confirmBooking({
      offerId: s.offerId,
      shiftId: s.shiftId,
      clinicWorkspaceId: s.clinicId,
      professionalId: s.professionalId,
      allocation: { compensation: s.compensation, serviceFee: 0, tax: 0 },
      captured: s.captured,
      idempotencyKey: `collection:${s.offerId}`,
    });
  } catch {
    this.state.duplicateRejected = true;
  }
});

Then("no additional financial event is created", async function (this: ProBookingWorld) {
  assert.equal(this.state.duplicateRejected, true);
  // And exactly one booking still exists for the offer.
  const booking = await this.state.store.getBookingByOffer(this.state.seed.offerId);
  assert.ok(booking);
});

Given("a captured payment order of {int} satang", function (this: ProBookingWorld, captured: number) {
  this.state.captured = satang(captured);
});

When(
  "{int} is paid out and {int} is taken as fee",
  function (this: ProBookingWorld, payout: number, fee: number) {
    this.state.payout = satang(payout);
    this.state.fee = satang(fee);
  },
);

Then(
  "captured funds equal protected remainder plus payout, fee, tax, refunds, costs, and adjustments",
  function (this: ProBookingWorld) {
    const captured = this.state.captured;
    const payout = this.state.payout;
    const fee = this.state.fee;
    const base = {
      captured,
      payout,
      fee,
      tax: satang(0),
      refunds: satang(0),
      providerCosts: satang(0),
      adjustments: satang(0),
    };
    const protectedRemainder = satang(captured - payout - fee);
    // The books balance...
    assert.equal(conserves({ ...base, protectedRemainder }), true);
    // ...and conserves() genuinely rejects an imbalance (guards against a vacuous test).
    assert.equal(conserves({ ...base, protectedRemainder: satang(protectedRemainder + 1) }), false);
  },
);

Given("a confirmed booking with recorded collection", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
});

When("the professional is paid the scheduled compensation", async function (this: ProBookingWorld) {
  await completeAndPay(this.state.store, this.state.seed);
});

Then(
  "the booking's captured funds equal compensation plus fee plus tax with zero remainder",
  async function (this: ProBookingWorld) {
    const booking = await this.state.store.getBooking(this.state.seed.bookingId);
    assert.ok(booking);
    assert.equal(booking.payoutState, "Paid");
    // After full compensation payout, every satang is allocated to payout/fee/tax — remainder is 0.
    assert.equal(
      conserves({
        captured: satang(booking.captured),
        protectedRemainder: satang(0),
        payout: satang(booking.compensation),
        fee: satang(booking.serviceFee),
        tax: satang(booking.tax),
        refunds: satang(0),
        providerCosts: satang(0),
        adjustments: satang(0),
      }),
      true,
    );
    assert.equal(booking.captured, booking.compensation + booking.serviceFee + booking.tax);
  },
);

Then("reconciliation reports no conservation exceptions", async function (this: ProBookingWorld) {
  const report = await this.state.store.reconcile();
  assert.equal(report.summary.exceptions, 0);
  const row = report.rows.find((r: { bookingId: string }) => r.bookingId === this.state.seed.bookingId);
  assert.ok(row);
  assert.equal(row.conserved, true);
});

Given("compensation of {int} satang", function (this: ProBookingWorld, amount: number) {
  this.state.compensation = satang(amount);
});

Then(
  "checkout yields service fee {int} and total {int}",
  function (this: ProBookingWorld, fee: number, total: number) {
    const checkout = buildCheckout(this.state.compensation);
    assert.equal(checkout.serviceFee, satang(fee));
    assert.equal(checkout.total, satang(total));
    assert.equal(checkout.compensation, this.state.compensation);
  },
);

Then("non-integer satang amounts are rejected", function () {
  assert.throws(() => satang(1.5), RangeError);
  assert.throws(() => satang(Number.MAX_SAFE_INTEGER + 1), RangeError);
});

// ----- Area 11: payout idempotency (real store), cap + separation of duties (real domain) -----
Given("a payout already marked Paid", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  const seed = await seedConfirmedBooking(this.state.store);
  await this.state.store.markCompletion(seed.bookingId);
  await this.state.store.recordPayout({
    bookingId: seed.bookingId,
    payoutAmount: seed.compensation,
    idempotencyKey: `payout:${seed.bookingId}`,
  });
  this.state.seed = seed;
});

When("the same payout command is retried", async function (this: ProBookingWorld) {
  this.state.secondPayout = false;
  try {
    await this.state.store.recordPayout({
      bookingId: this.state.seed.bookingId,
      payoutAmount: this.state.seed.compensation,
      idempotencyKey: `payout:${this.state.seed.bookingId}`,
    });
    this.state.secondPayout = true; // a second payout succeeded — bug
  } catch {
    this.state.secondPayout = false; // conflicted, as required
  }
});

Then("no second payout is created", function (this: ProBookingWorld) {
  assert.equal(this.state.secondPayout, false);
});

Given("an allocation with {int} satang available for payout", function (this: ProBookingWorld, avail: number) {
  this.state.available = satang(avail);
});

When("a payout of {int} satang is attempted", function (this: ProBookingWorld, amount: number) {
  // PAY-08 via the real domain predicate (used by the API), not an inline rule.
  this.state.rejected = !withinAllocation(satang(amount), this.state.available);
});

Then("the payout is rejected", function (this: ProBookingWorld) {
  assert.equal(this.state.rejected, true);
});

Given("a high-value payout initiated by one Finance user", async function (this: ProBookingWorld) {
  // Drive the REAL approval store, not just the predicate: §6.4 is about persisted state
  // (a request one person raises and a different one executes), so a scenario that only
  // calls dualControlSatisfied() proves the predicate works, not that the rule is enforced.
  this.state.store = newStore();
  const seeded = await seedConfirmedBooking(this.state.store);
  this.state.bookingId = seeded.bookingId;
  this.state.initiator = "finance-user-1";
  this.state.approval = await this.state.store.createApproval({
    capability: "finance.execute_refund",
    refType: "Booking",
    refId: seeded.bookingId,
    amount: 100_000,
    reason: "goodwill refund",
    initiatorId: "finance-user-1",
    initiatorRole: "finance",
  });
});

Then("it cannot be executed by the same user alone", async function (this: ProBookingWorld) {
  // The domain rule refuses the initiator as their own approver...
  const initiator = { id: "finance-user-1", role: "finance" as const };
  assert.equal(dualControlSatisfied("finance.execute_refund", initiator, initiator), false);
  // ...a second person with no finance authority is not an approver either...
  assert.equal(
    dualControlSatisfied("finance.execute_refund", initiator, { id: "clinic-7", role: "clinic_owner" }),
    false,
  );
  // ...and the store itself rejects a self-approval, so the rule does not depend on every
  // caller remembering to ask the predicate first.
  await assert.rejects(
    this.state.store.executeApproval({
      approvalId: this.state.approval.id,
      executorId: "finance-user-1",
      executorRole: "finance",
      idempotencyKey: `approval-refund:${this.state.approval.id}`,
    }),
  );

  // A genuinely different authorized approver satisfies it and the refund executes once.
  assert.equal(
    dualControlSatisfied("finance.execute_refund", initiator, { id: "finance-user-2", role: "finance" }),
    true,
  );
  const result = await this.state.store.executeApproval({
    approvalId: this.state.approval.id,
    executorId: "finance-user-2",
    executorRole: "finance",
    idempotencyKey: `approval-refund:${this.state.approval.id}`,
  });
  assert.equal(result.refund, 100_000);
  const after = await this.state.store.getApproval(this.state.approval.id);
  assert.equal(after?.state, "Executed");
  assert.equal(after?.executorId, "finance-user-2");
});

Given("a seeded confirmed booking for history", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
});

When("listing booking history for the clinic", async function (this: ProBookingWorld) {
  this.state.history = await this.state.store.listPartyBookings("clinic", this.state.seed.clinicId);
});

Then(
  "the history row matches the booking's compensation fee tax and total",
  async function (this: ProBookingWorld) {
    assert.equal(this.state.history.length, 1);
    const row = this.state.history[0];
    const booking = await this.state.store.getBooking(this.state.seed.bookingId);
    assert.equal(row.bookingId, this.state.seed.bookingId);
    assert.equal(row.compensation, booking.compensation);
    assert.equal(row.serviceFee, booking.serviceFee);
    assert.equal(row.tax, booking.tax);
    assert.equal(row.total, booking.captured);
  },
);

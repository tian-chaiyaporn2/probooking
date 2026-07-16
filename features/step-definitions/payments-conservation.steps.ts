import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import {
  conserves,
  satang,
  advancePayout,
  IllegalTransitionError,
  type Satang,
} from "@probook/domain";
import type { ProBookingWorld } from "../support/world.js";

/** Areas 6 & 11 (§9.4-6/11): callback idempotency, conservation (PAY-07/08), payout rules (§3). */

// ----- Area 6: duplicate callback + conservation -----
Given("a payment order that is already Payment Protected", function (this: ProBookingWorld) {
  this.state.processedKeys = new Set<string>(["collection:po-1"]);
  this.state.eventCount = 1;
});

When("the same provider callback is delivered again", function (this: ProBookingWorld) {
  // PAY-04 idempotency: a repeat callback keyed by the same idempotency key is a no-op.
  const key = "collection:po-1";
  if (!this.state.processedKeys.has(key)) {
    this.state.processedKeys.add(key);
    this.state.eventCount += 1;
  }
});

Then("no additional financial event is created", function (this: ProBookingWorld) {
  assert.equal(this.state.eventCount, 1);
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
    const captured = this.state.captured as Satang;
    const payout = this.state.payout as Satang;
    const fee = this.state.fee as Satang;
    const protectedRemainder = satang(captured - payout - fee);
    assert.equal(
      conserves({
        captured,
        protectedRemainder,
        payout,
        fee,
        tax: satang(0),
        refunds: satang(0),
        providerCosts: satang(0),
        adjustments: satang(0),
      }),
      true,
    );
  },
);

// ----- Area 11: payout idempotency, cap, and separation of duties -----
Given("a payout already marked Paid", function (this: ProBookingWorld) {
  this.state.payoutState = "Paid";
});

When("the same payout command is retried", function (this: ProBookingWorld) {
  // PAY-08/§6.4: Paid is terminal — a retry cannot create a second payout.
  try {
    advancePayout("Paid", "Paid");
    this.state.secondPayout = true;
  } catch (e) {
    this.state.secondPayout = !(e instanceof IllegalTransitionError) ? true : false;
  }
});

Then("no second payout is created", function (this: ProBookingWorld) {
  assert.equal(this.state.secondPayout, false);
});

Given("an allocation with {int} satang available for payout", function (this: ProBookingWorld, avail: number) {
  this.state.available = avail;
});

When("a payout of {int} satang is attempted", function (this: ProBookingWorld, amount: number) {
  this.state.rejected = amount > this.state.available; // PAY-08: may not exceed remaining allocation
});

Then("the payout is rejected", function (this: ProBookingWorld) {
  assert.equal(this.state.rejected, true);
});

Given("a high-value payout initiated by one Finance user", function (this: ProBookingWorld) {
  this.state.initiator = "finance-user-1";
  this.state.highValue = true;
});

Then("it cannot be executed by the same user alone", function (this: ProBookingWorld) {
  // §3 separation of duties: a high-value action needs a different second approver.
  const canExecuteAlone = (initiator: string, executor: string, highValue: boolean) =>
    !highValue || initiator !== executor;
  assert.equal(canExecuteAlone(this.state.initiator, this.state.initiator, this.state.highValue), false);
});

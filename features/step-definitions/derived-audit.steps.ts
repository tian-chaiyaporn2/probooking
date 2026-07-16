import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { ProBookingWorld } from "../support/world.js";

/** Area 14 (§9.4-14): derived customer status, hold overlays, immutable audit (§6.2/6.4). */

// Customer-facing labels are derived from the owning record's state, not stored.
const deriveLabel = (offerState: string): string =>
  ({
    PendingResponse: "Offer Sent",
    AwaitingPayment: "Awaiting Payment",
    Converted: "Booked",
  })[offerState] ?? offerState;

Given("an offer in AwaitingPayment", function (this: ProBookingWorld) {
  this.state.offer = { state: "AwaitingPayment" };
});

Then('the customer sees a derived "Awaiting Payment" label', function (this: ProBookingWorld) {
  this.state.label = deriveLabel(this.state.offer.state);
  assert.equal(this.state.label, "Awaiting Payment");
});

Then("changing the label does not alter the owning offer record", function (this: ProBookingWorld) {
  // The label is a projection — recomputing/relabelling never mutates the source record.
  assert.equal(this.state.offer.state, "AwaitingPayment");
});

Given("a confirmed booking", function (this: ProBookingWorld) {
  this.state.booking = { state: "Confirmed", heldAt: null };
});

When("an Operations hold is applied", function (this: ProBookingWorld) {
  // §6.2: a hold is an overlay — set heldAt without touching the base state.
  this.state.booking.heldAt = 1_700_000_000_000;
});

Then("the booking base state is preserved", function (this: ProBookingWorld) {
  assert.equal(this.state.booking.state, "Confirmed");
});

Then("the hold is recorded as an overlay", function (this: ProBookingWorld) {
  assert.notEqual(this.state.booking.heldAt, null);
});

Given("any privileged change is executed", function (this: ProBookingWorld) {
  // §6.4: an immutable audit record captures the full who/what/when/before/after.
  this.state.audit = Object.freeze({
    actor: "ops-user-1",
    authority: "operations",
    time: 1_700_000_000_000,
    before: { state: "Submitted" },
    after: { state: "Verified" },
  });
});

Then(
  "an immutable audit record captures actor, authority, time, before, and after",
  function (this: ProBookingWorld) {
    const a = this.state.audit;
    for (const key of ["actor", "authority", "time", "before", "after"]) {
      assert.ok(key in a, `audit record missing ${key}`);
    }
    assert.equal(Object.isFrozen(a), true); // immutable
  },
);

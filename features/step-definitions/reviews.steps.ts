import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { aggregateRating, canLeaveReview, countsTowardPublicReputation } from "@probook/domain";
import { newStore, seedConfirmedBooking } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Area 12 (§9.4-12): review rights, cold-start rating, related-party exclusion (REV-01..05). */

Given("a cancelled booking", async function (this: ProBookingWorld) {
  // Drive the real store: seed a confirmed booking then cancel it, so the state that
  // canLeaveReview() reads is produced by the store, not asserted by the step.
  const store = newStore();
  const b = await seedConfirmedBooking(store);
  await store.cancelBooking({
    bookingId: b.bookingId,
    payable: 0,
    refund: b.captured,
    payoutKey: `cancel-payout:${b.bookingId}`,
    refundKey: `cancel-refund:${b.bookingId}`,
  });
  const cancelled = await store.getBooking(b.bookingId);
  this.state.bookingState = cancelled?.state;
});

Then("neither party may leave a review", function (this: ProBookingWorld) {
  assert.equal(canLeaveReview(this.state.bookingState), false); // REV-01/05 (real domain gate)
});

Given("a professional with two published reviews", function (this: ProBookingWorld) {
  this.state.rating = aggregateRating([5, 4]); // below the 3-review cold-start threshold
});

Then("no aggregate rating or rating-based sorting is shown", function (this: ProBookingWorld) {
  assert.equal(this.state.rating, null); // REV-04: hidden until ≥3 published reviews
});

Given("a related-party booking", function (this: ProBookingWorld) {
  this.state.relatedParty = true;
});

Then("it creates no public reputation", function (this: ProBookingWorld) {
  assert.equal(countsTowardPublicReputation(this.state.relatedParty), false); // REV-05 (real domain rule)
});

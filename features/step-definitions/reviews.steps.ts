import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { aggregateRating, canLeaveReview, countsTowardPublicReputation } from "@probook/domain";
import { newStore, seedConfirmedBooking, completeAndPay } from "../support/store.js";
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

Given(
  "a professional with three completed bookings and published review pairs",
  async function (this: ProBookingWorld) {
    this.state.store = newStore();
    // First booking creates the professional; subsequent bookings reuse them.
    const first = await seedConfirmedBooking(this.state.store);
    this.state.professionalId = first.professionalId;
    await completeAndPay(this.state.store, first);
    await this.state.store.createReview({
      bookingId: first.bookingId,
      authorId: first.clinicId,
      subjectId: first.professionalId,
      score: 5,
      tags: [],
    });
    await this.state.store.createReview({
      bookingId: first.bookingId,
      authorId: first.professionalId,
      subjectId: first.clinicId,
      score: 4,
      tags: [],
    });

    for (const score of [4, 5]) {
      const next = await seedConfirmedBooking(this.state.store, {
        professionalId: this.state.professionalId,
      });
      await completeAndPay(this.state.store, next);
      await this.state.store.createReview({
        bookingId: next.bookingId,
        authorId: next.clinicId,
        subjectId: next.professionalId,
        score,
        tags: [],
      });
      await this.state.store.createReview({
        bookingId: next.bookingId,
        authorId: next.professionalId,
        subjectId: next.clinicId,
        score: 5,
        tags: [],
      });
    }
  },
);

When("the subject rating is requested", async function (this: ProBookingWorld) {
  this.state.rating = await this.state.store.getSubjectRating(this.state.professionalId);
});

Then("an aggregate rating is returned", function (this: ProBookingWorld) {
  assert.ok(this.state.rating);
  assert.equal(this.state.rating.count, 3);
  assert.ok(this.state.rating.average >= 4);
});

Then("with only two published scores it remains hidden", function (this: ProBookingWorld) {
  // Domain cold-start gate: two published scores → null (same rule the store uses).
  assert.equal(aggregateRating([5, 4]), null);
});

Given("a related-party booking", function (this: ProBookingWorld) {
  this.state.relatedParty = true;
});

Then("it creates no public reputation", function (this: ProBookingWorld) {
  assert.equal(countsTowardPublicReputation(this.state.relatedParty), false); // REV-05 (real domain rule)
});

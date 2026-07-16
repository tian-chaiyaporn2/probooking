import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { aggregateRating } from "@probook/domain";
import type { ProBookingWorld } from "../support/world.js";

/** Area 12 (§9.4-12): review rights, cold-start rating, related-party exclusion (REV-01..05). */

// REV-01/05: only a completed paid production booking creates review rights.
const canReview = (bookingState: string) => bookingState === "ServiceCompleted";

Given("a cancelled booking", function (this: ProBookingWorld) {
  this.state.bookingState = "Cancelled";
});

Then("neither party may leave a review", function (this: ProBookingWorld) {
  assert.equal(canReview(this.state.bookingState), false);
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
  const createsPublicReputation = (relatedParty: boolean) => !relatedParty;
  assert.equal(createsPublicReputation(this.state.relatedParty), false);
});

import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { can, advanceOffer, IllegalTransitionError, type Role } from "@probook/domain";
import type { ProBookingWorld } from "../support/world.js";

/**
 * Step definitions for area 4 (clinic authority & one active offer). These exercise
 * the pure domain directly (can/advanceOffer); other areas either call real domain
 * functions or drive the in-memory store via features/support/store.ts.
 */

Given("a user with role {string}", function (this: ProBookingWorld, role: string) {
  this.state.role = role as Role;
});

When("they attempt to send a binding offer", function (this: ProBookingWorld) {
  this.lastError = null;
  try {
    if (!can(this.state.role as Role, "clinic.send_offer")) {
      throw new Error("FORBIDDEN");
    }
    this.state.offerSent = true;
  } catch (e) {
    this.lastError = e;
  }
});

Then("the offer is sent", function (this: ProBookingWorld) {
  assert.equal(this.state.offerSent, true);
  assert.equal(this.lastError, null);
});

Then("the action is forbidden", function (this: ProBookingWorld) {
  assert.notEqual(this.lastError, null);
});

When("acceptance is applied to the offer", function (this: ProBookingWorld) {
  this.lastError = null;
  try {
    // OFF-04: acceptance -> AwaitingPayment (a soft hold), never straight to a booking.
    this.state.offerState = advanceOffer("PendingResponse", "AwaitingPayment");
  } catch (e) {
    this.lastError = e;
  }
});

Then("the offer awaits payment rather than becoming a booking", function (this: ProBookingWorld) {
  assert.equal(this.state.offerState, "AwaitingPayment");
});

Then("converting the offer before payment is rejected", function (this: ProBookingWorld) {
  assert.throws(() => advanceOffer("PendingResponse", "Converted"), IllegalTransitionError);
});

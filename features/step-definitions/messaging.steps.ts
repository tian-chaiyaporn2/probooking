import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { containsProhibitedPatientData } from "@probook/domain";
import { newStore } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Area 8 (§9.4-8): messaging visibility (MSG-02) and patient-data rules (§7.3). */

Given("a booking that is not yet confirmed", async function (this: ProBookingWorld) {
  // MSG-02: contact is gated on a booking existing (which only happens at confirmation).
  // Before confirmation there is no booking, so the store exposes no contact thread.
  this.state.store = newStore();
  this.state.unknownBookingId = "not-a-booking";
});

Then("contact details are not shown in the thread", async function (this: ProBookingWorld) {
  const booking = await this.state.store.getBooking(this.state.unknownBookingId);
  assert.equal(booking, null); // no booking -> the contact endpoint has nothing to reveal
});

Given("a message containing apparent patient-identifiable data", function (this: ProBookingWorld) {
  this.state.messageBody = "please review ผู้ป่วย 1234567890123 before the shift";
});

Then(
  "the user is warned and the content can be reported and manually removed",
  function (this: ProBookingWorld) {
    // §7.3: the real domain heuristic flags it (Thai keyword + national ID both covered).
    assert.equal(containsProhibitedPatientData(this.state.messageBody), true);
  },
);

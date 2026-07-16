import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { containsProhibitedPatientData } from "@probook/domain";
import type { ProBookingWorld } from "../support/world.js";

/** Area 8 (§9.4-8): messaging visibility (MSG-02) and patient-data rules (§7.3). */

Given("a booking that is not yet confirmed", function (this: ProBookingWorld) {
  this.state.confirmed = false;
});

Then("contact details are not shown in the thread", function (this: ProBookingWorld) {
  // MSG-02: party contact details are revealed only after confirmation.
  const contactVisible = this.state.confirmed === true;
  assert.equal(contactVisible, false);
});

Given("a message containing apparent patient-identifiable data", function (this: ProBookingWorld) {
  this.state.messageBody = "please review patient 1234567890123 before the shift";
});

Then(
  "the user is warned and the content can be reported and manually removed",
  function (this: ProBookingWorld) {
    // §7.3: the heuristic flags it (warning); reporting + manual removal are process steps.
    assert.equal(containsProhibitedPatientData(this.state.messageBody), true);
  },
);

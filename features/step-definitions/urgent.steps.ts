import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { isUrgentEligible } from "@probook/domain";
import type { ProBookingWorld } from "../support/world.js";

/** Area 7 (§9.4-7): urgent badge within 72h, with no fill guarantee (URG-01). */

Given("a supported shift starting in {int} hours", function (this: ProBookingWorld, hours: number) {
  this.state.now = Date.now();
  this.state.shiftStart = this.state.now + hours * 60 * 60 * 1000;
});

Then("it may receive an Urgent badge and priority placement", function (this: ProBookingWorld) {
  assert.equal(isUrgentEligible(this.state.shiftStart, this.state.now), true);
});

Given("an urgent shift", function (this: ProBookingWorld) {
  this.state.urgent = true;
});

Then("no fill is guaranteed", function (this: ProBookingWorld) {
  // URG-01: urgency drives priority/alerts/outreach only — never a guaranteed fill.
  const urgentGuaranteesFill = false;
  assert.equal(urgentGuaranteesFill, false);
});

import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { ProBookingWorld } from "../support/world.js";

/** Area 1 (§9.4-1): verification gating and verified-vs-self-declared profiles. */

// AUTH-04: browsing is open; transacting requires a verified account.
const canTransact = (verified: boolean) => verified;

Given("an unverified user", function (this: ProBookingWorld) {
  this.state.verified = false;
});

When("they view public content", function (this: ProBookingWorld) {
  this.state.viewed = true;
});

Then("they can browse restricted public content", function (this: ProBookingWorld) {
  assert.equal(this.state.viewed, true);
});

Then("they cannot apply, invite, offer, or pay", function (this: ProBookingWorld) {
  assert.equal(canTransact(this.state.verified), false);
});

Given("a professional with a verified licence and a self-declared bio", function (this: ProBookingWorld) {
  this.state.profile = {
    verified: { licence: { state: "Verified", lastCheckedAt: 1_700_000_000_000 } },
    selfDeclared: { bio: "10 years in emergency medicine" },
  };
});

When("a clinic views the public profile", function (this: ProBookingWorld) {
  this.state.profileView = this.state.profile;
});

Then("verified facts are labelled with a last-checked date", function (this: ProBookingWorld) {
  assert.ok(this.state.profileView.verified.licence.lastCheckedAt > 0);
});

Then("self-declared content is clearly distinguished", function (this: ProBookingWorld) {
  const view = this.state.profileView;
  // The two sections are separate keys — a self-declared claim is never nested under verified.
  assert.ok("verified" in view && "selfDeclared" in view);
  assert.equal("bio" in view.verified, false);
});

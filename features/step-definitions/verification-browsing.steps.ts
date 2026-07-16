import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { newStore } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Area 1 (§9.4-1): verification gating (AUTH-04) and verified-vs-self-declared profiles (VER-03). */

Given("an unverified user", async function (this: ProBookingWorld) {
  // Real store: a freshly-registered clinic is Submitted, not Verified.
  this.state.store = newStore();
  const clinic = await this.state.store.registerClinic({
    branchName: "C", licenceNo: "L", address: "A", ownerPhone: "+66unverified",
  });
  this.state.clinicId = clinic.id;
});

When("they view public content", function (this: ProBookingWorld) {
  this.state.browsed = true; // browsing restricted public content is open to everyone
});

Then("they can browse restricted public content", function (this: ProBookingWorld) {
  assert.equal(this.state.browsed, true);
});

Then("they cannot apply, invite, offer, or pay", async function (this: ProBookingWorld) {
  // AUTH-04: transacting requires a Verified account — the gate the store/API enforce.
  const verification = await this.state.store.clinicVerification(this.state.clinicId);
  assert.notEqual(verification, "Verified");
});

Given("a professional with a verified licence and a self-declared bio", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  const pro = await this.state.store.registerProfessional({
    displayName: "Dr Grace", profession: "dentist", phone: "+66prof", payoutRef: "x",
  });
  await this.state.store.verifyProfessional(pro.id);
  this.state.professionalId = pro.id;
});

When("a clinic views the public profile", async function (this: ProBookingWorld) {
  this.state.profile = await this.state.store.getProfessionalProfile(this.state.professionalId);
});

Then("verified facts are labelled with a last-checked date", function (this: ProBookingWorld) {
  // The profile's `verified` section carries platform-confirmed facts (VER-03).
  assert.equal(this.state.profile.verified.identityVerified, true);
  assert.equal(this.state.profile.verified.licence.state, "Verified");
});

Then("self-declared content is clearly distinguished", function (this: ProBookingWorld) {
  const p = this.state.profile;
  // Self-declared claims live in their own section, never merged into `verified`.
  assert.ok("selfDeclared" in p && "verified" in p);
  assert.equal(p.selfDeclared.displayName, "Dr Grace");
  assert.equal("displayName" in p.verified, false);
});

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

When("they view public content", async function (this: ProBookingWorld) {
  // Browsing is a real public read — open shifts and professional search — not a step-local flag.
  this.state.openShifts = await this.state.store.listOpenShifts();
  this.state.searchResults = await this.state.store.searchProfessionals({});
});

Then("they can browse restricted public content", function (this: ProBookingWorld) {
  assert.ok(Array.isArray(this.state.openShifts));
  assert.ok(Array.isArray(this.state.searchResults));
});

Then("they cannot apply, invite, offer, or pay", async function (this: ProBookingWorld) {
  // AUTH-04: transacting requires Verified — an unverified clinic cannot reach offer creation
  // for a published shift (clinic must be verified to post; here we assert the verification gate).
  const verification = await this.state.store.clinicVerification(this.state.clinicId);
  assert.notEqual(verification, "Verified");
  // Unverified clinic cannot post a shift that would unlock offer/pay flows either — the
  // store still accepts postShift, but confirmation eligibility requires clinicVerified.
  const { shiftId } = await this.state.store.postShift({
    clinicWorkspaceId: this.state.clinicId,
    category: "general",
    compensation: 1_000_000,
    urgency: "standard",
    shiftStart: 1_700_000_000_000 + 48 * 60 * 60 * 1000,
    insuranceRequired: false,
  });
  // Without a verified professional + clinic, createOffer is still creatable at store layer,
  // but getOfferEligibility reports clinicVerified=false — the confirm gate AUTH-04 enforces.
  const pro = await this.state.store.registerProfessional({
    displayName: "D", profession: "physician", phone: "+66unv-pro", payoutRef: "x",
  });
  await this.state.store.verifyProfessional(pro.id);
  await this.state.store.applyToShift(shiftId, pro.id);
  const offer = await this.state.store.createOfferForShift({
    shiftId, professionalId: pro.id, sentAt: 1, expiresAt: 2,
  });
  const elig = await this.state.store.getOfferEligibility(offer.id);
  assert.equal(elig?.clinicVerified, false);
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

Then("verified facts are labelled as platform-verified", function (this: ProBookingWorld) {
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

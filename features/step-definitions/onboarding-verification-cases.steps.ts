import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { newStore } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Area 20: onboarding + verification edge cases (ORG-01, PRO-01, VER-01..04). */
let seq = 0;

Given("a registered professional", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.phone = `+66onb${++seq}`;
  const pro = await this.state.store.registerProfessional({
    displayName: "Dr Onb", profession: "physician", phone: this.state.phone, payoutRef: "x",
  });
  this.state.professionalId = pro.id;
});

Given("a fresh store", function (this: ProBookingWorld) {
  this.state.store = newStore();
});

When("Operations verifies the professional", async function (this: ProBookingWorld) {
  await this.state.store.verifyProfessional(this.state.professionalId);
});

When("Operations verifies the professional twice", async function (this: ProBookingWorld) {
  await this.state.store.verifyProfessional(this.state.professionalId);
  this.state.second = await this.state.store.verifyProfessional(this.state.professionalId);
});

When("Operations verifies then suspends the professional", async function (this: ProBookingWorld) {
  await this.state.store.verifyProfessional(this.state.professionalId);
  await this.state.store.suspendCredential(this.state.professionalId);
});

Then("the professional's licence reads {string}", async function (this: ProBookingWorld, state: string) {
  const profile = await this.state.store.getProfessionalProfile(this.state.professionalId);
  assert.equal(profile.verified.licence.state, state);
});

Then("the identity is marked verified", async function (this: ProBookingWorld) {
  const profile = await this.state.store.getProfessionalProfile(this.state.professionalId);
  assert.equal(profile.verified.identityVerified, true);
});

Then("the professional stays {string}", function (this: ProBookingWorld, state: string) {
  assert.equal(this.state.second.verification, state);
});

Then("verifying an unknown professional returns not found", async function (this: ProBookingWorld) {
  const result = await this.state.store.verifyProfessional("no-such-professional");
  assert.equal(result, null);
});

Then("registering another professional with the same phone conflicts", async function (this: ProBookingWorld) {
  let conflicted = false;
  try {
    await this.state.store.registerProfessional({
      displayName: "Dup", profession: "physician", phone: this.state.phone, payoutRef: "y",
    });
  } catch {
    conflicted = true;
  }
  assert.equal(conflicted, true);
});

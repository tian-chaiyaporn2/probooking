import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import {
  DEMO_ACCOUNTS,
  DEMO_PARTY_ACCOUNTS,
  DEMO_STAFF_ACCOUNTS,
} from "../../apps/web/src/lib/demo-accounts.ts";
import { th } from "../../apps/web/src/lib/strings.ts";

Given("the landing marketing strings are loaded", function () {
  assert.ok(th.home);
});

Given("the demo account catalogue is loaded", function () {
  assert.ok(DEMO_ACCOUNTS.length > 0);
});

Then("the hero eyebrow should be {string}", function (expected: string) {
  assert.equal(th.home.marketSignal, expected);
});

Then("the hero lead should mention payment protection", function () {
  assert.match(th.home.lead, /คุ้มครอง/);
});

Then("the hero primary CTA should be {string}", function (expected: string) {
  assert.equal(th.home.ctaPrimary, expected);
});

Then("the contact CTA should be {string}", function (expected: string) {
  assert.equal(th.home.contactCta, expected);
});

Then("the contact email should be a valid mailbox address", function () {
  assert.match(th.home.contactEmail, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});

Then("the clinic how-it-works should have {int} steps", function (count: number) {
  assert.equal(th.home.stepsClinic.length, count);
});

Then("the professional how-it-works should have {int} steps", function (count: number) {
  assert.equal(th.home.stepsPro.length, count);
});

Then("the guided demo path should mention clinic and professional roles", function () {
  assert.match(th.home.guidedDemo, /คลินิก/);
  assert.match(th.home.guidedDemo, /บุคลากร/);
});

Then("there should be {int} party demo accounts", function (count: number) {
  assert.equal(DEMO_PARTY_ACCOUNTS.length, count);
});

Then("there should be {int} staff demo accounts", function (count: number) {
  assert.equal(DEMO_STAFF_ACCOUNTS.length, count);
});

Then("every finance approver sublabel should be Thai-only", function () {
  const approver = DEMO_ACCOUNTS.find((a) => a.id === "finance-approver");
  assert.ok(approver);
  assert.doesNotMatch(approver!.sublabel, /§|Operations|Finance/i);
});

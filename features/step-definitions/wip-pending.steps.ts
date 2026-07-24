import { Given, When, Then } from "@cucumber/cucumber";

/**
 * Pending stubs for @wip scenarios. Product code does not yet support these paths;
 * returning "pending" keeps `pnpm test:bdd:all` honest without undefined-step noise.
 * Do not implement these until the matching product hooks exist.
 */

Given("a professional marked Open to requests with no fixed block for a window", function () {
  return "pending";
});

When("a clinic searches for coverage in that window", function () {
  return "pending";
});

Then("the professional is included as open-to-request supply", function () {
  return "pending";
});

// ----- SRC: location / availability filters -----
Given("verified professionals with location and availability metadata", function () {
  return "pending";
});

When("searching with availability and location filters", function () {
  return "pending";
});

Then("only professionals matching those filters are returned", function () {
  return "pending";
});

// ----- CMP-04 clinic-confirm-without-submit + CMP-05 adjustments -----
Given("a confirmed booking past scheduled end with no professional completion", function () {
  return "pending";
});

When("the clinic confirms full completion", function () {
  return "pending";
});

Then("the booking reaches ServiceCompleted and payout proceeds", function () {
  return "pending";
});

Given("a completed shift with overtime or shortened hours or disputed attendance", function () {
  return "pending";
});

When("compensation is finalized", function () {
  return "pending";
});

Then("the outcome is resolved by support rather than the scheduled default alone", function () {
  return "pending";
});

// ----- PAY-10 refund split -----
Given("a cancelled booking with a refund", function () {
  return "pending";
});

When("the refund statement is produced", function () {
  return "pending";
});

Then(
  "compensation platform fee tax adjustment and any provider charge are listed separately",
  function () {
    return "pending";
  },
);

// ----- REV-05 store exclusion -----
Given("a related-party or self-dealing completed booking with published reviews", function () {
  return "pending";
});

Then("those scores do not count toward the public aggregate", function () {
  return "pending";
});

import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { conserves, satang, advanceBooking, IllegalTransitionError } from "@probook/domain";
import { newStore, seedConfirmedBooking } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Area 16: completion + payout money mechanics (CMP, PAY-07..09, §6.4). */

Given(
  "a confirmed booking worth {int} satang compensation",
  async function (this: ProBookingWorld, comp: number) {
    this.state.store = newStore();
    this.state.seed = await seedConfirmedBooking(this.state.store, { compensation: comp });
  },
);

When("the professional completes and the clinic accepts completion", async function (this: ProBookingWorld) {
  const s = this.state.seed;
  await this.state.store.markCompletion(s.bookingId);
  this.state.payout = await this.state.store.recordPayout({
    bookingId: s.bookingId,
    payoutAmount: s.compensation,
    idempotencyKey: `payout:${s.bookingId}`,
  });
});

Then("the professional is paid the compensation", function (this: ProBookingWorld) {
  assert.equal(this.state.payout.payoutState, "Paid");
  assert.equal(this.state.payout.payoutAmount, this.state.seed.compensation);
});

Then(
  "captured funds conserve after payout from stored booking amounts",
  async function (this: ProBookingWorld) {
    const booking = await this.state.store.getBooking(this.state.seed.bookingId);
    assert.ok(booking);
    assert.equal(
      conserves({
        captured: satang(booking.captured),
        protectedRemainder: satang(0),
        payout: satang(booking.compensation),
        fee: satang(booking.serviceFee),
        tax: satang(booking.tax),
        refunds: satang(0),
        providerCosts: satang(0),
        adjustments: satang(0),
      }),
      true,
    );
  },
);

When("completion is accepted twice", async function (this: ProBookingWorld) {
  const s = this.state.seed;
  await this.state.store.markCompletion(s.bookingId);
  await this.state.store.recordPayout({
    bookingId: s.bookingId,
    payoutAmount: s.compensation,
    idempotencyKey: `payout:${s.bookingId}`,
  });
  this.state.secondRejected = false;
  try {
    await this.state.store.recordPayout({
      bookingId: s.bookingId,
      payoutAmount: s.compensation,
      idempotencyKey: `payout:${s.bookingId}`,
    });
  } catch {
    this.state.secondRejected = true;
  }
});

Then("only one payout is recorded", function (this: ProBookingWorld) {
  assert.equal(this.state.secondRejected, true);
});

When("completion is submitted twice", async function (this: ProBookingWorld) {
  await this.state.store.markCompletion(this.state.seed.bookingId);
  await this.state.store.markCompletion(this.state.seed.bookingId);
});

Then("the booking is awaiting completion", async function (this: ProBookingWorld) {
  const booking = await this.state.store.getBooking(this.state.seed.bookingId);
  assert.equal(booking.state, "AwaitingCompletion");
});

Given("a cancelled booking state", function (this: ProBookingWorld) {
  this.state.bookingState = "Cancelled";
});

Then("advancing it to awaiting completion is rejected", function (this: ProBookingWorld) {
  assert.throws(() => advanceBooking(this.state.bookingState, "AwaitingCompletion"), IllegalTransitionError);
});

When(
  "the professional marks completion and Operations places a credential hold",
  async function (this: ProBookingWorld) {
    await this.state.store.markCompletion(this.state.seed.bookingId);
    await this.state.store.holdBooking(this.state.seed.bookingId, "credential_or_insurance_invalid");
  },
);

Then("payout while held is rejected", async function (this: ProBookingWorld) {
  const booking = await this.state.store.getBooking(this.state.seed.bookingId);
  assert.notEqual(booking.heldAt, null);
  assert.equal(booking.state, "AwaitingCompletion");
  await assert.rejects(
    this.state.store.recordPayout({
      bookingId: this.state.seed.bookingId,
      payoutAmount: this.state.seed.compensation,
      idempotencyKey: `payout:${this.state.seed.bookingId}`,
    }),
  );
});

Then("resolving the hold clears it", async function (this: ProBookingWorld) {
  await this.state.store.resolveHold(this.state.seed.bookingId);
  const booking = await this.state.store.getBooking(this.state.seed.bookingId);
  assert.equal(booking.heldAt, null);
});

Then("payout after resolve succeeds", async function (this: ProBookingWorld) {
  const payout = await this.state.store.recordPayout({
    bookingId: this.state.seed.bookingId,
    payoutAmount: this.state.seed.compensation,
    idempotencyKey: `payout:${this.state.seed.bookingId}`,
  });
  assert.equal(payout.payoutState, "Paid");
  const booking = await this.state.store.getBooking(this.state.seed.bookingId);
  assert.equal(booking.state, "ServiceCompleted");
});

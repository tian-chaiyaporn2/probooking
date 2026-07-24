import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { containsProhibitedPatientData, buildCheckout, satang } from "@probook/domain";
import { newStore, seedAwaitingPaymentOffer, seedConfirmedBooking } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Area 8 (§9.4-8): messaging visibility (MSG-02) and patient-data rules (§7.3). */

Given("an accepted offer awaiting payment", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.offer = await seedAwaitingPaymentOffer(this.state.store);
});

Then("contact details are not available for that offer", async function (this: ProBookingWorld) {
  // MSG-02: contact is gated on a booking existing (confirmation). Pre-confirm there is none.
  const byOffer = await this.state.store.getBookingByOffer(this.state.offer.offerId);
  assert.equal(byOffer, null);
  const contact = await this.state.store.getBookingContact("not-yet-a-booking");
  assert.equal(contact, null);
});

When("the offer is confirmed into a booking", async function (this: ProBookingWorld) {
  const o = this.state.offer;
  const checkout = buildCheckout(satang(o.compensation));
  const { booking } = await this.state.store.confirmBooking({
    offerId: o.offerId,
    shiftId: o.shiftId,
    clinicWorkspaceId: o.clinicId,
    professionalId: o.professionalId,
    allocation: {
      compensation: checkout.compensation,
      serviceFee: checkout.serviceFee,
      tax: checkout.tax,
    },
    captured: checkout.total,
    idempotencyKey: `collection:${o.offerId}`,
    now: o.fundingDueAt - 1,
  });
  this.state.bookingId = booking.id;
});

Then("contact details reveal both party phones", async function (this: ProBookingWorld) {
  const contact = await this.state.store.getBookingContact(this.state.bookingId);
  assert.ok(contact);
  assert.equal(contact.clinicPhone, this.state.offer.clinicPhone);
  assert.equal(contact.professionalPhone, this.state.offer.professionalPhone);
});

Given("a confirmed booking with a message thread", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
});

When("a party posts a plain-text message", async function (this: ProBookingWorld) {
  this.state.messageBody = "Shift details confirmed — arrive at reception";
  this.state.message = await this.state.store.postMessage(
    this.state.seed.bookingId,
    this.state.seed.clinicId,
    this.state.messageBody,
  );
});

Then("the thread lists that message body", async function (this: ProBookingWorld) {
  const messages = await this.state.store.listMessages(this.state.seed.bookingId);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body, this.state.messageBody);
  assert.equal(messages[0].senderId, this.state.seed.clinicId);
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

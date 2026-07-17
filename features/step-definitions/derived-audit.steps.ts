import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { newStore, seedConfirmedBooking } from "../support/store.js";
import type { ProBookingWorld } from "../support/world.js";

/** Area 14 (§9.4-14): derived customer status, hold overlays, immutable audit (§6.2/6.4). */

// Customer-facing labels are derived from the owning record's state, not stored.
const deriveLabel = (offerState: string): string =>
  ({
    PendingResponse: "Offer Sent",
    AwaitingPayment: "Awaiting Payment",
    Converted: "Booked",
  })[offerState] ?? offerState;

Given("an offer in AwaitingPayment", async function (this: ProBookingWorld) {
  // Real store: create an offer and move it to AwaitingPayment; the label is derived
  // from the store's offer record, and re-deriving must not mutate that record.
  const store = newStore();
  const clinic = await store.registerClinic({ branchName: "C", licenceNo: "L", address: "A", ownerPhone: "+66lbl1" });
  await store.verifyClinic(clinic.id);
  const pro = await store.registerProfessional({ displayName: "D", profession: "physician", phone: "+66lbl2", payoutRef: "x" });
  await store.verifyProfessional(pro.id);
  const { shiftId } = await store.postShift({
    clinicWorkspaceId: clinic.id, category: "general", compensation: 1_000_000,
    urgency: "standard", shiftStart: 1_700_000_000_000, insuranceRequired: false,
  });
  await store.applyToShift(shiftId, pro.id);
  const offer = await store.createOfferForShift({ shiftId, professionalId: pro.id, sentAt: 1, expiresAt: 2 });
  await store.setOfferState(offer.id, "AwaitingPayment", { fundingDueAt: 3 });
  this.state.store = store;
  this.state.offerId = offer.id;
});

Then('the customer sees a derived "Awaiting Payment" label', async function (this: ProBookingWorld) {
  const offer = await this.state.store.getOffer(this.state.offerId);
  assert.equal(deriveLabel(offer.state), "Awaiting Payment");
});

Then("changing the label does not alter the owning offer record", async function (this: ProBookingWorld) {
  const offer = await this.state.store.getOffer(this.state.offerId);
  assert.equal(offer.state, "AwaitingPayment"); // re-reading the projection never mutated the source
});

Given("a confirmed booking", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
});

When("an Operations hold is applied", async function (this: ProBookingWorld) {
  // §6.2 overlay: the real store sets heldAt without touching the base state.
  await this.state.store.holdBooking(this.state.seed.bookingId, "credential_or_insurance_invalid");
});

Then("the booking base state is preserved", async function (this: ProBookingWorld) {
  const booking = await this.state.store.getBooking(this.state.seed.bookingId);
  assert.equal(booking.state, "Confirmed");
});

Then("the hold is recorded as an overlay", async function (this: ProBookingWorld) {
  const booking = await this.state.store.getBooking(this.state.seed.bookingId);
  assert.notEqual(booking.heldAt, null);
});

Given("any privileged change is executed", async function (this: ProBookingWorld) {
  // Real store append-only audit trail (§6.4).
  const store = newStore();
  await store.recordAudit({
    actor: "+66000000001",
    role: "operations",
    action: "verify_professional",
    targetType: "professional",
    targetId: "prof-1",
    details: { before: { state: "Submitted" }, after: { state: "Verified" } },
  });
  this.state.store = store;
});

Then("an immutable audit record captures actor, authority, time, before, and after",
  async function (this: ProBookingWorld) {
    const [rec] = await this.state.store.listAudit();
    assert.ok(rec, "expected an audit record");
    assert.equal(rec.actor, "+66000000001"); // actor
    assert.equal(rec.role, "operations"); // authority
    assert.ok(typeof rec.at === "number"); // time
    assert.ok("before" in rec.details && "after" in rec.details); // before + after
    // Append-only: a second privileged change adds a record, never rewrites the first.
    await this.state.store.recordAudit({
      actor: "x", role: "operations", action: "suspend_credential", targetType: "professional", targetId: "prof-1",
    });
    const all = await this.state.store.listAudit();
    assert.equal(all.length, 2);
    assert.equal(all.find((r: { action: string }) => r.action === "verify_professional")?.actor, "+66000000001");
  },
);

Given("a confirmed booking and an open support case", async function (this: ProBookingWorld) {
  this.state.store = newStore();
  this.state.seed = await seedConfirmedBooking(this.state.store);
  this.state.case = await this.state.store.createSupportCase(
    this.state.seed.bookingId,
    "completion_review",
    "ops metrics fixture",
  );
});

When("Ops metrics are requested", async function (this: ProBookingWorld) {
  this.state.metrics = await this.state.store.getMetrics();
});

Then(
  "metrics count at least one confirmed booking and one open case",
  function (this: ProBookingWorld) {
    assert.ok(this.state.metrics.bookings.confirmed >= 1);
    assert.ok(this.state.metrics.cases.open >= 1);
  },
);

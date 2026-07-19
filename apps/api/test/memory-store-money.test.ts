import { describe, it, expect } from "vitest";
import { InMemoryMarketplaceStore } from "../src/modules/marketplace/marketplace.memory-store.js";
import { ConflictError } from "../src/modules/marketplace/errors.util.js";

describe("InMemoryMarketplaceStore money headroom", () => {
  it("rejects payout when a prior refund reduced headroom", async () => {
    const store = new InMemoryMarketplaceStore();
    const clinic = await store.registerClinic({
      branchName: "C",
      licenceNo: "L",
      address: "A",
      ownerPhone: "+66111111111",
    });
    await store.verifyClinic(clinic.id);
    const pro = await store.registerProfessional({
      displayName: "P",
      profession: "nurse",
      phone: "+66222222222",
      payoutRef: "x",
    });
    await store.verifyProfessional(pro.id);
    const { shiftId } = await store.postShift({
      clinicWorkspaceId: clinic.id,
      category: "general",
      compensation: 1_000_000,
      urgency: "standard",
      shiftStart: Date.now() + 48 * 3_600_000,
      insuranceRequired: false,
    });
    await store.applyToShift(shiftId, pro.id);
    const offer = await store.createOfferForShift({
      shiftId,
      professionalId: pro.id,
      sentAt: Date.now(),
      expiresAt: Date.now() + 12 * 3_600_000,
    });
    await store.setOfferState(offer.id, "AwaitingPayment", { fundingDueAt: Date.now() + 30 * 60_000 });
    const { booking } = await store.confirmBooking({
      offerId: offer.id,
      shiftId,
      clinicWorkspaceId: clinic.id,
      professionalId: pro.id,
      allocation: { compensation: 1_000_000, serviceFee: 120_000, tax: 0 },
      captured: 1_120_000,
      idempotencyKey: `collection:${offer.id}`,
    });
    const approval = await store.createApproval({
      capability: "finance.execute_refund",
      refType: "Booking",
      refId: booking.id,
      amount: 500_000,
      reason: "test",
      initiatorId: "fin1",
      initiatorRole: "finance",
    });
    await store.executeApproval({
      approvalId: approval.id,
      executorId: "fin2",
      executorRole: "finance",
      idempotencyKey: `approval-refund:${approval.id}`,
    });
    await store.markCompletion(booking.id);
    await expect(
      store.recordPayout({
        bookingId: booking.id,
        payoutAmount: 1_000_000,
        idempotencyKey: `payout:${booking.id}`,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

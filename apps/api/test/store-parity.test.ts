import { describe, it, expect } from "vitest";
import { InMemoryMarketplaceStore } from "../src/modules/marketplace/marketplace.memory-store.js";
import { PrismaMarketplaceStore } from "../src/modules/marketplace/marketplace.prisma-store.js";
import { ConflictError, isConflict } from "../src/modules/marketplace/errors.util.js";
import { LIST_LIMITS } from "../src/modules/marketplace/list-limits.js";
import type { MarketplaceRepository } from "../src/modules/marketplace/marketplace.types.js";

/**
 * Store contract / parity suite (P1.6 — the "highest-leverage" follow-up).
 *
 * Two implementations back the same MarketplaceRepository interface: the in-memory store the
 * demo and BDD suite drive, and the Prisma store that runs in production. They are easy to
 * drift apart — a sort direction, a rounding rule, a headroom check — and the only thing that
 * catches drift today is whichever leg of CI happens to exercise a path. These tests run the
 * SAME scenarios against BOTH stores and assert identical observable behaviour on the
 * invariants that matter: money conservation and list ordering.
 *
 * The memory param always runs; the prisma param runs only when DATABASE_URL is set (CI's
 * postgres leg), matching the existing prisma-store.int.test.ts convention.
 */
const DB = !!process.env.DATABASE_URL;

const stores: { name: string; make: () => MarketplaceRepository }[] = [
  { name: "memory", make: () => new InMemoryMarketplaceStore() },
  ...(DB ? [{ name: "prisma", make: () => new PrismaMarketplaceStore() }] : []),
];

let seq = 0;
const uniq = () => `pty${Date.now()}${seq++}`;

/** A verified clinic + professional with a confirmed, funded booking. Uses unique phones/refs
 * so the persistent Prisma store is safe across runs; the memory store ignores uniqueness. */
async function seedConfirmedBooking(store: MarketplaceRepository, compensation = 1_000_000) {
  const n = uniq();
  const clinic = await store.registerClinic({
    branchName: `C ${n}`,
    licenceNo: "L",
    address: "BKK",
    ownerPhone: `+66pc${n}`,
  });
  await store.verifyClinic(clinic.id);
  const pro = await store.registerProfessional({
    displayName: "P",
    profession: "nurse",
    phone: `+66pp${n}`,
    payoutRef: "x",
  });
  await store.verifyProfessional(pro.id);
  const { shiftId } = await store.postShift({
    clinicWorkspaceId: clinic.id,
    category: "general",
    compensation,
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
  const serviceFee = Math.round(compensation * 0.12);
  const { booking } = await store.confirmBooking({
    offerId: offer.id,
    shiftId,
    clinicWorkspaceId: clinic.id,
    professionalId: pro.id,
    allocation: { compensation, serviceFee, tax: 0 },
    captured: compensation + serviceFee,
    idempotencyKey: `collection:${offer.id}`,
  });
  return { clinic, pro, shiftId, offer, booking };
}

describe.each(stores)("$name store contract", ({ make }) => {
  it("conserves captured funds: a refund shrinks payout headroom so a full payout is rejected (PAY-07/08)", async () => {
    const store = make();
    const { booking } = await seedConfirmedBooking(store, 1_000_000);

    // Refund half the compensation via the dual-control approval path (§6.4).
    const approval = await store.createApproval({
      capability: "finance.execute_refund",
      refType: "Booking",
      refId: booking.id,
      amount: 500_000,
      reason: "parity-test",
      initiatorId: "fin1",
      initiatorRole: "finance",
    });
    await store.executeApproval({
      approvalId: approval.id,
      executorId: "fin2",
      executorRole: "finance",
      idempotencyKey: `approval-refund:${approval.id}`,
    });

    // captured 1_120_000 − refund 500_000 = 620_000 headroom; a 1_000_000 payout must be
    // refused. A refund and a payout can NOT both consume the same captured funds.
    await store.markCompletion(booking.id);
    await expect(
      store.recordPayout({
        bookingId: booking.id,
        payoutAmount: 1_000_000,
        idempotencyKey: `payout:${booking.id}`,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("orders booking messages by creation time ascending (MSG-01)", async () => {
    const store = make();
    const { booking, pro } = await seedConfirmedBooking(store);
    await store.postMessage(booking.id, pro.id, "first");
    await store.postMessage(booking.id, pro.id, "second");
    await store.postMessage(booking.id, pro.id, "third");

    const list = await store.listMessages(booking.id);
    expect(list.map((m) => m.body)).toEqual(["first", "second", "third"]);
    for (let i = 1; i < list.length; i++) {
      expect(list[i].createdAt).toBeGreaterThanOrEqual(list[i - 1].createdAt);
    }
  });

  it("orders availability blocks by start time ascending, regardless of insert order", async () => {
    const store = make();
    const n = uniq();
    const pro = await store.registerProfessional({
      displayName: "AV",
      profession: "nurse",
      phone: `+66av${n}`,
      payoutRef: "x",
    });
    await store.verifyProfessional(pro.id);
    const base = Date.now() + 72 * 3_600_000;
    // Insert out of chronological order.
    await store.addAvailability(pro.id, base + 2 * 3_600_000, base + 3 * 3_600_000, true);
    await store.addAvailability(pro.id, base, base + 3_600_000, true);
    await store.addAvailability(pro.id, base + 4 * 3_600_000, base + 5 * 3_600_000, false);

    const list = await store.listAvailability(pro.id);
    const starts = list.map((b) => b.startsAt);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(list[0].startsAt).toBe(base);
  });

  /** A shift with one offer moved to PaymentFailed (accepted, then the capture failed). */
  async function seedPaymentFailedOffer(store: MarketplaceRepository) {
    const n = uniq();
    const clinic = await store.registerClinic({
      branchName: `OC ${n}`,
      licenceNo: "L",
      address: "BKK",
      ownerPhone: `+66oc${n}`,
    });
    await store.verifyClinic(clinic.id);
    const pro1 = await store.registerProfessional({
      displayName: "P1",
      profession: "nurse",
      phone: `+66o1${n}`,
      payoutRef: "x",
    });
    await store.verifyProfessional(pro1.id);
    const { shiftId } = await store.postShift({
      clinicWorkspaceId: clinic.id,
      category: "general",
      compensation: 1_000_000,
      urgency: "standard",
      shiftStart: Date.now() + 48 * 3_600_000,
      insuranceRequired: false,
    });
    await store.applyToShift(shiftId, pro1.id);
    const offer = await store.createOfferForShift({
      shiftId,
      professionalId: pro1.id,
      sentAt: Date.now(),
      expiresAt: Date.now() + 12 * 3_600_000,
    });
    await store.setOfferState(offer.id, "AwaitingPayment", {
      fundingDueAt: Date.now() + 30 * 60_000,
    });
    await store.setOfferState(offer.id, "PaymentFailed"); // capture failed; retry window open
    return { clinic, shiftId, offerId: offer.id };
  }

  it("treats a PaymentFailed offer as active: a second offer for the shift is refused (OFF-02)", async () => {
    const store = make();
    const { shiftId } = await seedPaymentFailedOffer(store);
    const n = uniq();
    const pro2 = await store.registerProfessional({
      displayName: "P2",
      profession: "nurse",
      phone: `+66o2${n}`,
      payoutRef: "x",
    });
    await store.verifyProfessional(pro2.id);
    await store.applyToShift(shiftId, pro2.id);
    // The failed-but-retryable offer still holds the single active-offer slot, in both stores
    // (memory throws ConflictError; Prisma via the partial unique index → P2002).
    let err: unknown;
    try {
      await store.createOfferForShift({
        shiftId,
        professionalId: pro2.id,
        sentAt: Date.now(),
        expiresAt: Date.now() + 12 * 3_600_000,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(isConflict(err)).toBe(true);
  });

  it("credential model is profession-dependent: a dental assistant has no licence, a nurse does (VER-04)", async () => {
    const store = make();
    const n = uniq();
    const assistant = await store.registerProfessional({
      displayName: "A",
      profession: "dental_assistant",
      phone: `+66da${n}`,
      payoutRef: "x",
    });
    await store.verifyProfessional(assistant.id);
    const nurse = await store.registerProfessional({
      displayName: "N",
      profession: "nurse",
      phone: `+66nu${n}`,
      payoutRef: "x",
    });
    await store.verifyProfessional(nurse.id);

    const aProfile = await store.getProfessionalProfile(assistant.id);
    const nProfile = await store.getProfessionalProfile(nurse.id);
    // A dental assistant is not a licensed practitioner — no licence credential at all.
    expect(aProfile?.verified.licence).toBeNull();
    // A nurse is licensed — the licence verifies with the professional.
    expect(nProfile?.verified.licence).not.toBeNull();
    expect(nProfile?.verified.licence?.state).toBe("Verified");
  });

  it("expires a PaymentFailed offer once its funding window has elapsed", async () => {
    const store = make();
    const n = uniq();
    const clinic = await store.registerClinic({
      branchName: `EX ${n}`,
      licenceNo: "L",
      address: "BKK",
      ownerPhone: `+66ec${n}`,
    });
    await store.verifyClinic(clinic.id);
    const pro = await store.registerProfessional({
      displayName: "P",
      profession: "nurse",
      phone: `+66ep${n}`,
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
    // Funding window already in the past, then the capture fails.
    await store.setOfferState(offer.id, "AwaitingPayment", { fundingDueAt: Date.now() - 1_000 });
    await store.setOfferState(offer.id, "PaymentFailed");
    const expired = await store.expireStaleOffers(Date.now());
    expect(expired).toBeGreaterThanOrEqual(1);
  });
});

/**
 * List-cap truncation (M6). Proving the cap actually truncates needs more rows than the cap,
 * which is cheap only in memory (the Prisma store applies the SAME LIST_LIMITS constant via a
 * `take:`, so the shared constant is the parity guarantee — seeding thousands of Postgres rows
 * per run would not add signal). Run against the in-memory store only.
 */
describe("in-memory list caps truncate at LIST_LIMITS (M6)", () => {
  it("caps a booking message thread at LIST_LIMITS.messages", async () => {
    const store = new InMemoryMarketplaceStore();
    const { booking, pro } = await seedConfirmedBooking(store);
    const over = LIST_LIMITS.messages + 5;
    for (let i = 0; i < over; i++) {
      await store.postMessage(booking.id, pro.id, `m${i}`);
    }
    const list = await store.listMessages(booking.id);
    expect(list).toHaveLength(LIST_LIMITS.messages);
    // The cap keeps the earliest messages (ascending order preserved).
    expect(list[0].body).toBe("m0");
  });
});

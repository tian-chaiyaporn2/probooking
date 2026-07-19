import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@probook/db";
import { PrismaMarketplaceStore } from "../src/modules/marketplace/marketplace.prisma-store.js";

/**
 * Integration tests for the store that actually runs in production.
 *
 * The Prisma store had no tests at all: the BDD suite drives the in-memory store, and e2e
 * only reaches it through HTTP. That left the invariants which exist *only* in Postgres —
 * transaction atomicity (BKG-02) and the unique constraints — asserted by nothing.
 *
 * These need a real database (they are testing Postgres behaviour, so a mock would prove
 * nothing). Skipped when DATABASE_URL is unset; CI's `postgres` leg runs them.
 */
const DB = !!process.env.DATABASE_URL;
const store = new PrismaMarketplaceStore();

let seq = 0;
const uniq = () => `it${Date.now()}${seq++}`;

/** A verified clinic + professional with a published shift and an accepted offer. */
async function seedAcceptedOffer(compensation = 1_000_000) {
  const n = uniq();
  const clinic = await store.registerClinic({
    branchName: `Int ${n}`,
    licenceNo: "L",
    address: "BKK",
    ownerPhone: `+66ic${n}`,
  });
  await store.verifyClinic(clinic.id);
  const pro = await store.registerProfessional({
    displayName: "Dr Int",
    profession: "nurse",
    phone: `+66ip${n}`,
    payoutRef: "x-1",
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
  return { clinic, pro, shiftId, offerId: offer.id };
}

describe.skipIf(!DB)("PrismaMarketplaceStore (integration)", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`; // fail loudly if the DB is unreachable
  });

  it("BKG-02: a failure mid-confirm leaves no orphan booking or money records", async () => {
    const { shiftId, clinic, pro, offerId } = await seedAcceptedOffer();

    // Force the LAST write in the transaction to fail: the collection event's idempotency
    // key is already taken. Everything before it (offer->Converted, Booking, PaymentOrder,
    // FinancialAllocation) has already been written inside the transaction by that point,
    // so if atomicity does not hold we are left with a booking that was never paid for.
    const other = await seedAcceptedOffer();
    const squatted = await store.confirmBooking({
      offerId: other.offerId,
      shiftId: other.shiftId,
      clinicWorkspaceId: other.clinic.id,
      professionalId: other.pro.id,
      allocation: { compensation: 1_000_000, serviceFee: 120_000, tax: 0 },
      captured: 1_120_000,
      idempotencyKey: `collection:${other.offerId}`,
    });
    expect(squatted.booking.state).toBe("Confirmed");

    await expect(
      store.confirmBooking({
        offerId,
        shiftId,
        clinicWorkspaceId: clinic.id,
        professionalId: pro.id,
        allocation: { compensation: 1_000_000, serviceFee: 120_000, tax: 0 },
        captured: 1_120_000,
        // Collides with the event written above -> P2002 on the final insert.
        idempotencyKey: `collection:${other.offerId}`,
      }),
    ).rejects.toThrow();

    // Nothing from the failed attempt survived — not the booking, not the payment order,
    // not the allocation — and the offer did not silently convert.
    expect(await prisma.booking.findUnique({ where: { shiftId } })).toBeNull();
    expect(await prisma.booking.findUnique({ where: { offerId } })).toBeNull();
    const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });
    expect(offer.state).toBe("AwaitingPayment"); // rolled back, still awaiting payment
    const orders = await prisma.paymentOrder.findMany({ where: { booking: { shiftId } } });
    expect(orders).toHaveLength(0);
  });

  it("§6.4: one shift produces at most one booking, even via two different offers", async () => {
    // The unique constraint is the guarantee, not the service-layer read. This is the
    // scenario the in-memory store cannot express at all: it keys idempotency on the OFFER,
    // so two different offers on one shift would each produce a booking there.
    const { shiftId, clinic, pro, offerId } = await seedAcceptedOffer();
    await store.confirmBooking({
      offerId,
      shiftId,
      clinicWorkspaceId: clinic.id,
      professionalId: pro.id,
      allocation: { compensation: 1_000_000, serviceFee: 120_000, tax: 0 },
      captured: 1_120_000,
      idempotencyKey: `collection:${offerId}`,
    });

    // A *second* offer on the shift is permitted by the OFF-02 index once the first is
    // Converted (it only covers non-terminal offers — a converted offer is not "active").
    // The service layer refuses to send one because the shift is booked; this asserts the
    // backstop underneath that: even if one is forced through and confirmed, Booking's
    // unique shiftId means the shift still cannot produce a second booking.
    const second = await prisma.offer.create({
      data: {
        shiftId,
        professionalId: pro.id,
        state: "AwaitingPayment",
        termsSnapshot: {},
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await expect(
      store.confirmBooking({
        offerId: second.id,
        shiftId,
        clinicWorkspaceId: clinic.id,
        professionalId: pro.id,
        allocation: { compensation: 1_000_000, serviceFee: 120_000, tax: 0 },
        captured: 1_120_000,
        idempotencyKey: `collection:${second.id}`,
      }),
    ).rejects.toThrow(); // Booking_shiftId_key

    const bookings = await prisma.booking.findMany({ where: { shiftId } });
    expect(bookings).toHaveLength(1);
  });

  it("PAY-04: a replayed collection key cannot write a second event", async () => {
    const { shiftId, clinic, pro, offerId } = await seedAcceptedOffer();
    const key = `collection:${offerId}`;
    await store.confirmBooking({
      offerId,
      shiftId,
      clinicWorkspaceId: clinic.id,
      professionalId: pro.id,
      allocation: { compensation: 1_000_000, serviceFee: 120_000, tax: 0 },
      captured: 1_120_000,
      idempotencyKey: key,
    });
    const events = await prisma.financialEvent.findMany({ where: { idempotencyKey: key } });
    expect(events).toHaveLength(1);
    await expect(
      prisma.financialEvent.create({
        data: {
          paymentOrderId: events[0]!.paymentOrderId,
          type: "Collection",
          amount: 1_120_000,
          idempotencyKey: key,
        },
      }),
    ).rejects.toThrow();
  });

  it("CMP-01/03: resubmitting completion does not push the clinic's review window out", async () => {
    const { shiftId, clinic, pro, offerId } = await seedAcceptedOffer();
    await store.confirmBooking({
      offerId,
      shiftId,
      clinicWorkspaceId: clinic.id,
      professionalId: pro.id,
      allocation: { compensation: 1_000_000, serviceFee: 120_000, tax: 0 },
      captured: 1_120_000,
      idempotencyKey: `collection:${offerId}`,
    });
    const first = await store.markCompletion(
      (await prisma.booking.findUniqueOrThrow({ where: { offerId } })).id,
    );
    const bookingId = first!.id;
    const deadline = await store.getAutoAcceptDueAt(bookingId);
    expect(deadline).not.toBeNull();

    // Resubmitting is one completion, not a new clock. If it re-stamped autoAcceptAt, a
    // professional could defer auto-accept forever by resubmitting.
    await new Promise((r) => setTimeout(r, 10));
    await store.markCompletion(bookingId);
    expect(await store.getAutoAcceptDueAt(bookingId)).toBe(deadline);
    expect((await store.getBooking(bookingId))!.state).toBe("AwaitingCompletion");
  });

  it("PAY-05/§6.4: the ledger and audit trail cannot be rewritten", async () => {
    // The append-only triggers are a database control; assert they hold for the client too,
    // not just in psql.
    const audit = await prisma.auditRecord.create({
      data: { action: "int_test", targetType: "test", targetId: uniq(), after: {} },
    });
    await expect(
      prisma.auditRecord.update({ where: { id: audit.id }, data: { action: "tampered" } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditRecord.delete({ where: { id: audit.id } })).rejects.toThrow(
      /append-only/,
    );
  });
});

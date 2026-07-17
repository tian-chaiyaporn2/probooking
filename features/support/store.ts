import { InMemoryMarketplaceStore } from "../../apps/api/src/modules/marketplace/marketplace.memory-store.js";
import { buildCheckout, satang } from "@probook/domain";

/**
 * BDD store harness. The in-memory MarketplaceRepository has no Nest/Prisma deps, so
 * scenarios can drive the REAL persistence code in-process rather than re-implementing
 * rules inline. This replicates the minimal controller orchestration needed to reach a
 * given state (register -> verify -> post -> apply -> offer -> accept -> confirm).
 */
export function newStore(): InMemoryMarketplaceStore {
  return new InMemoryMarketplaceStore();
}

let seq = 0;
const HOUR = 60 * 60 * 1000;

export interface SeededBooking {
  clinicId: string;
  professionalId: string;
  shiftId: string;
  offerId: string;
  bookingId: string;
  captured: number;
  compensation: number;
  clinicPhone: string;
  professionalPhone: string;
}

export interface SeedOpts {
  compensation?: number;
  now?: number;
  /** Reuse an already-registered verified clinic workspace. */
  clinicId?: string;
  /** Reuse an already-registered verified professional. */
  professionalId?: string;
  urgency?: "standard" | "urgent";
  category?: string;
  shiftStartOffsetHours?: number;
}

/** Seed a confirmed booking in the store and return the ids/amounts. */
export async function seedConfirmedBooking(
  store: InMemoryMarketplaceStore,
  opts: SeedOpts = {},
): Promise<SeededBooking> {
  const compensation = opts.compensation ?? 1_000_000;
  const now = opts.now ?? 1_700_000_000_000;
  const n = ++seq;
  const clinicPhone = `+66c${n}`;
  const professionalPhone = `+66p${n}`;

  let clinicId = opts.clinicId;
  if (!clinicId) {
    const clinic = await store.registerClinic({
      branchName: "Test Clinic",
      licenceNo: "L",
      address: "BKK",
      ownerPhone: clinicPhone,
    });
    await store.verifyClinic(clinic.id);
    clinicId = clinic.id;
  }

  let professionalId = opts.professionalId;
  if (!professionalId) {
    const pro = await store.registerProfessional({
      displayName: "Dr Test",
      profession: "physician",
      phone: professionalPhone,
      payoutRef: "x-1",
    });
    await store.verifyProfessional(pro.id);
    professionalId = pro.id;
  }

  const { shiftId } = await store.postShift({
    clinicWorkspaceId: clinicId,
    category: opts.category ?? "general",
    compensation,
    urgency: opts.urgency ?? "standard",
    shiftStart: now + (opts.shiftStartOffsetHours ?? 48) * HOUR,
    insuranceRequired: false,
  });
  await store.applyToShift(shiftId, professionalId);
  const offer = await store.createOfferForShift({
    shiftId,
    professionalId,
    sentAt: now,
    expiresAt: now + HOUR,
  });
  await store.setOfferState(offer.id, "AwaitingPayment", now + HOUR);

  const checkout = buildCheckout(satang(compensation));
  const { booking } = await store.confirmBooking({
    offerId: offer.id,
    shiftId,
    clinicWorkspaceId: clinicId,
    professionalId,
    allocation: {
      compensation: checkout.compensation,
      serviceFee: checkout.serviceFee,
      tax: checkout.tax,
    },
    captured: checkout.total,
    idempotencyKey: `collection:${offer.id}`,
  });

  return {
    clinicId,
    professionalId,
    shiftId,
    offerId: offer.id,
    bookingId: booking.id,
    captured: checkout.total,
    compensation: checkout.compensation,
    clinicPhone,
    professionalPhone,
  };
}

/** Take a shift through apply → offer → AwaitingPayment without confirming. */
export async function seedAwaitingPaymentOffer(
  store: InMemoryMarketplaceStore,
  opts: SeedOpts = {},
): Promise<Omit<SeededBooking, "bookingId" | "captured"> & { fundingDueAt: number }> {
  const compensation = opts.compensation ?? 1_000_000;
  const now = opts.now ?? 1_700_000_000_000;
  const n = ++seq;

  const clinic = await store.registerClinic({
    branchName: "Test Clinic",
    licenceNo: "L",
    address: "BKK",
    ownerPhone: `+66c${n}`,
  });
  await store.verifyClinic(clinic.id);
  const pro = await store.registerProfessional({
    displayName: "Dr Test",
    profession: "physician",
    phone: `+66p${n}`,
    payoutRef: "x-1",
  });
  await store.verifyProfessional(pro.id);

  const { shiftId } = await store.postShift({
    clinicWorkspaceId: clinic.id,
    category: opts.category ?? "general",
    compensation,
    urgency: opts.urgency ?? "standard",
    shiftStart: now + (opts.shiftStartOffsetHours ?? 48) * HOUR,
    insuranceRequired: false,
  });
  await store.applyToShift(shiftId, pro.id);
  const offer = await store.createOfferForShift({
    shiftId,
    professionalId: pro.id,
    sentAt: now,
    expiresAt: now + HOUR,
  });
  const fundingDueAt = now + HOUR;
  await store.setOfferState(offer.id, "AwaitingPayment", fundingDueAt);

  return {
    clinicId: clinic.id,
    professionalId: pro.id,
    shiftId,
    offerId: offer.id,
    compensation,
    clinicPhone: `+66c${n}`,
    professionalPhone: `+66p${n}`,
    fundingDueAt,
  };
}

/** Complete a confirmed booking and record payout (ServiceCompleted + Paid). */
export async function completeAndPay(
  store: InMemoryMarketplaceStore,
  seed: SeededBooking,
): Promise<void> {
  await store.markCompletion(seed.bookingId);
  await store.recordPayout({
    bookingId: seed.bookingId,
    payoutAmount: seed.compensation,
    idempotencyKey: `payout:${seed.bookingId}`,
  });
}

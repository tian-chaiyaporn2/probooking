import { InMemoryMarketplaceStore } from "../../apps/api/src/modules/marketplace/marketplace.memory-store.js";
import {
  seedDemoFixtures,
  type DemoSeedResult,
} from "../../apps/api/src/fixtures/demo-fixtures.js";
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

/** Load the full demo fixture set (same data as API boot seeding). */
export async function seedDemo(store: InMemoryMarketplaceStore): Promise<DemoSeedResult> {
  return seedDemoFixtures(store);
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
  insuranceRequired?: boolean;
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
      profession: "nurse",
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
    insuranceRequired: opts.insuranceRequired ?? false,
  });
  await store.applyToShift(shiftId, professionalId);
  // When the shift requires insurance, VER-05 evidence must be valid through shift end
  // before confirmBooking's §6.3 re-check will convert the offer.
  if (opts.insuranceRequired) {
    const shiftEnd = now + (opts.shiftStartOffsetHours ?? 48) * HOUR + 4 * HOUR;
    await store.submitInsurance(professionalId, shiftEnd + HOUR);
    await store.verifyInsurance(professionalId);
  }
  const offer = await store.createOfferForShift({
    shiftId,
    professionalId,
    sentAt: now,
    expiresAt: now + HOUR,
  });
  await store.setOfferState(offer.id, "AwaitingPayment", { fundingDueAt: now + HOUR });

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
    // Scenario clock: fundingDueAt is anchored to `now`, which may be far in the past.
    now,
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
    profession: "nurse",
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
  await store.setOfferState(offer.id, "AwaitingPayment", { fundingDueAt });

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

/** Seed a confirmed booking that is on hold with an open credential_hold case. */
export async function seedHeldBooking(
  store: InMemoryMarketplaceStore,
  opts: SeedOpts = {},
): Promise<SeededBooking> {
  const s = await seedConfirmedBooking(store, opts);
  await store.holdBooking(s.bookingId, "credential_or_insurance_invalid");
  await store.createSupportCase(s.bookingId, "credential_hold", "Credential review required");
  return s;
}

/** Seed a completed, paid-out booking. */
export async function seedCompletedBooking(
  store: InMemoryMarketplaceStore,
  opts: SeedOpts = {},
): Promise<SeededBooking> {
  const s = await seedConfirmedBooking(store, opts);
  await completeAndPay(store, s);
  return s;
}

/** Seed an urgent shift (starts within 72h). */
export async function seedUrgentShift(
  store: InMemoryMarketplaceStore,
  opts: SeedOpts = {},
): Promise<{ clinicId: string; shiftId: string }> {
  const now = opts.now ?? 1_700_000_000_000;
  const n = ++seq;
  const clinic = await store.registerClinic({
    branchName: "Urgent Clinic",
    licenceNo: "L",
    address: "BKK",
    ownerPhone: `+66u${n}`,
  });
  await store.verifyClinic(clinic.id);
  const { shiftId } = await store.postShift({
    clinicWorkspaceId: clinic.id,
    category: opts.category ?? "general",
    compensation: opts.compensation ?? 1_200_000,
    urgency: "urgent",
    shiftStart: now + 24 * HOUR,
    insuranceRequired: false,
  });
  return { clinicId: clinic.id, shiftId };
}

/** Seed N completed bookings with published reviews for a professional. */
export async function seedWithReviews(
  store: InMemoryMarketplaceStore,
  count: number,
  opts: SeedOpts = {},
): Promise<SeededBooking[]> {
  const out: SeededBooking[] = [];
  let professionalId = opts.professionalId;
  for (let i = 0; i < count; i++) {
    const s = await seedCompletedBooking(store, {
      ...opts,
      ...(professionalId ? { professionalId } : {}),
    });
    professionalId = s.professionalId;
    await store.createReview({
      bookingId: s.bookingId,
      authorId: s.clinicId,
      subjectId: s.professionalId,
      score: 5,
      tags: ["reliable"],
    });
    await store.createReview({
      bookingId: s.bookingId,
      authorId: s.professionalId,
      subjectId: s.clinicId,
      score: 5,
      tags: ["professional"],
    });
    out.push(s);
  }
  return out;
}

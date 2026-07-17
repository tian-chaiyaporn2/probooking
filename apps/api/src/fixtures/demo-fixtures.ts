import { buildCheckout, satang } from "@probook/domain";
import type { MarketplaceRepository } from "../modules/marketplace/marketplace.types.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Stable demo phones — safe to re-run; registration rejects duplicates per store. */
export const DEMO_PHONES = {
  clinicA: "+66910000001",
  clinicB: "+66910000002",
  clinicPending: "+66910000003",
  drSomchai: "+66920000001",
  drWanida: "+66920000002",
  drPrasert: "+66920000003",
  drPending: "+66920000004",
} as const;

export interface DemoSeedResult {
  clinics: { sukhumvit: string; rama: string; pending: string };
  professionals: { somchai: string; wanida: string; prasert: string; pending: string };
  shifts: { openStandard: string; openUrgent: string; withApplication: string; insuranceRequired: string };
  offers: { awaitingPayment: string };
  bookings: {
    completed: string;
    confirmedWithMessages: string;
    awaitingCompletion: string;
    held: string;
    cancelled: string;
  };
}

async function confirmFromOffer(
  store: MarketplaceRepository,
  offerId: string,
  compensation: number,
) {
  const offer = await store.getOffer(offerId);
  if (!offer) throw new Error(`offer ${offerId} not found`);
  const checkout = buildCheckout(satang(compensation));
  return store.confirmBooking({
    offerId,
    shiftId: offer.shiftId,
    clinicWorkspaceId: offer.clinicWorkspaceId,
    professionalId: offer.professionalId,
    allocation: {
      compensation: checkout.compensation,
      serviceFee: checkout.serviceFee,
      tax: checkout.tax,
    },
    captured: checkout.total,
    idempotencyKey: `collection:${offerId}`,
  });
}

/**
 * Populate a MarketplaceRepository with a rich, deterministic demo dataset that
 * exercises every Phase 0 flow: onboarding, verification, discovery, offers,
 * bookings (all lifecycle states), ops cases, finance reconciliation, reviews,
 * messaging, availability, and insurance.
 */
export async function seedDemoFixtures(
  store: MarketplaceRepository,
  now = Date.now(),
): Promise<DemoSeedResult> {
  // --- Pending verifications (ops dashboard) ---
  const pendingClinic = await store.registerClinic({
    branchName: "คลินิกรอยจอง",
    licenceNo: "TH-PEND-001",
    address: "กรุงเทพฯ",
    ownerPhone: DEMO_PHONES.clinicPending,
  });
  const pendingPro = await store.registerProfessional({
    displayName: "นพ. รอตรวจ",
    profession: "physician",
    phone: DEMO_PHONES.drPending,
    payoutRef: "xxxx-0000",
  });

  // --- Verified clinics ---
  const clinicA = await store.registerClinic({
    branchName: "คลินิกสุขุมวิทสไมล์",
    licenceNo: "TH-DEMO-001",
    address: "สุขุมวิท กรุงเทพฯ",
    ownerPhone: DEMO_PHONES.clinicA,
  });
  await store.verifyClinic(clinicA.id);
  const clinicB = await store.registerClinic({
    branchName: "คลินิกพระราม",
    licenceNo: "TH-DEMO-002",
    address: "พระราม 9 กรุงเทพฯ",
    ownerPhone: DEMO_PHONES.clinicB,
  });
  await store.verifyClinic(clinicB.id);

  // --- Verified professionals ---
  const somchai = await store.registerProfessional({
    displayName: "นพ. สมชาย ใจดี",
    profession: "physician",
    phone: DEMO_PHONES.drSomchai,
    payoutRef: "xxxx-1111",
  });
  await store.verifyProfessional(somchai.id);
  const wanida = await store.registerProfessional({
    displayName: "ทพ. วนิดา รักษ์ฟัน",
    profession: "dentist",
    phone: DEMO_PHONES.drWanida,
    payoutRef: "xxxx-2222",
  });
  await store.verifyProfessional(wanida.id);
  const prasert = await store.registerProfessional({
    displayName: "นพ. ประเสริฐ มั่นคง",
    profession: "physician",
    phone: DEMO_PHONES.drPrasert,
    payoutRef: "xxxx-3333",
  });
  await store.verifyProfessional(prasert.id);

  // Insurance evidence for dentistry shifts (VER-05).
  await store.submitInsurance(wanida.id, now + 365 * DAY);
  await store.verifyInsurance(wanida.id);

  // --- Availability blocks (AVL-01) ---
  await store.addAvailability(somchai.id, now + 2 * DAY, now + 2 * DAY + 8 * HOUR, true);
  await store.addAvailability(wanida.id, now + 3 * DAY, now + 3 * DAY + 6 * HOUR, true);

  // --- Open shifts for discovery (SRC-03) ---
  const openStandard = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "general",
    compensation: 800_000,
    urgency: "standard",
    shiftStart: now + 5 * DAY,
    insuranceRequired: false,
  });
  const openUrgent = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "dentistry",
    compensation: 1_200_000,
    urgency: "urgent",
    shiftStart: now + 36 * HOUR,
    insuranceRequired: true,
  });
  const withApplication = await store.postShift({
    clinicWorkspaceId: clinicB.id,
    category: "general",
    compensation: 1_000_000,
    urgency: "standard",
    shiftStart: now + 4 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(withApplication.shiftId, somchai.id);
  await store.inviteToShift(withApplication.shiftId, prasert.id);

  const insuranceRequired = await store.postShift({
    clinicWorkspaceId: clinicB.id,
    category: "dentistry",
    compensation: 1_500_000,
    urgency: "standard",
    shiftStart: now + 6 * DAY,
    insuranceRequired: true,
  });

  // --- Offer awaiting payment (OFF-04 soft hold) ---
  const awaitingShift = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "general",
    compensation: 950_000,
    urgency: "standard",
    shiftStart: now + 9 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(awaitingShift.shiftId, somchai.id);
  const awaitingOffer = await store.createOfferForShift({
    shiftId: awaitingShift.shiftId,
    professionalId: somchai.id,
    sentAt: now,
    expiresAt: now + 2 * HOUR,
  });
  await store.setOfferState(awaitingOffer.id, "AwaitingPayment", now + HOUR);

  // --- Completed + paid booking (finance reconciliation, REP-01/02) ---
  const completedShift = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "general",
    compensation: 1_000_000,
    urgency: "standard",
    shiftStart: now - 2 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(completedShift.shiftId, prasert.id);
  const completedOffer = await store.createOfferForShift({
    shiftId: completedShift.shiftId,
    professionalId: prasert.id,
    sentAt: now - 5 * DAY,
    expiresAt: now - 5 * DAY + HOUR,
  });
  await store.setOfferState(completedOffer.id, "AwaitingPayment", now - 5 * DAY + HOUR);
  const completed = await confirmFromOffer(store, completedOffer.id, 1_000_000);
  await store.markCompletion(completed.booking.id);
  await store.recordPayout({
    bookingId: completed.booking.id,
    payoutAmount: 1_000_000,
    idempotencyKey: `payout:${completed.booking.id}`,
  });
  await store.createReview({
    bookingId: completed.booking.id,
    authorId: clinicA.id,
    subjectId: prasert.id,
    score: 5,
    tags: ["punctual"],
    text: "ทำงานดีมาก",
  });
  await store.createReview({
    bookingId: completed.booking.id,
    authorId: prasert.id,
    subjectId: clinicA.id,
    score: 5,
    tags: ["professional"],
  });

  // --- Confirmed booking with messages (MSG-01) ---
  const msgShift = await store.postShift({
    clinicWorkspaceId: clinicB.id,
    category: "general",
    compensation: 900_000,
    urgency: "standard",
    shiftStart: now + 7 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(msgShift.shiftId, somchai.id);
  const msgOffer = await store.createOfferForShift({
    shiftId: msgShift.shiftId,
    professionalId: somchai.id,
    sentAt: now - HOUR,
    expiresAt: now + HOUR,
  });
  await store.setOfferState(msgOffer.id, "AwaitingPayment", now + HOUR);
  const confirmedWithMessages = await confirmFromOffer(store, msgOffer.id, 900_000);
  await store.postMessage(confirmedWithMessages.booking.id, clinicB.id, "สวัสดีครับ พร้อมเริ่มงานตามเวลา");
  await store.postMessage(confirmedWithMessages.booking.id, somchai.id, "ครับ พร้อมครับ");

  // --- Awaiting completion (CMP-01) ---
  const awaitShift = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "general",
    compensation: 750_000,
    urgency: "standard",
    shiftStart: now - DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(awaitShift.shiftId, somchai.id);
  const awaitOffer = await store.createOfferForShift({
    shiftId: awaitShift.shiftId,
    professionalId: somchai.id,
    sentAt: now - 3 * DAY,
    expiresAt: now - 3 * DAY + HOUR,
  });
  await store.setOfferState(awaitOffer.id, "AwaitingPayment", now - 3 * DAY + HOUR);
  const awaitingCompletion = await confirmFromOffer(store, awaitOffer.id, 750_000);
  await store.markCompletion(awaitingCompletion.booking.id);

  // --- Held booking + credential_hold case (VER-06, ops dashboard) ---
  const heldShift = await store.postShift({
    clinicWorkspaceId: clinicB.id,
    category: "general",
    compensation: 850_000,
    urgency: "standard",
    shiftStart: now + 8 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(heldShift.shiftId, prasert.id);
  const heldOffer = await store.createOfferForShift({
    shiftId: heldShift.shiftId,
    professionalId: prasert.id,
    sentAt: now - 2 * HOUR,
    expiresAt: now + 2 * HOUR,
  });
  await store.setOfferState(heldOffer.id, "AwaitingPayment", now + HOUR);
  const held = await confirmFromOffer(store, heldOffer.id, 850_000);
  await store.holdBooking(held.booking.id, "credential_or_insurance_invalid");
  await store.createSupportCase(held.booking.id, "credential_hold", "Credential review required");

  // --- Cancelled booking with refund (CAN-01, finance) ---
  const cancelShift = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "general",
    compensation: 600_000,
    urgency: "standard",
    shiftStart: now + 10 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(cancelShift.shiftId, wanida.id);
  const cancelOffer = await store.createOfferForShift({
    shiftId: cancelShift.shiftId,
    professionalId: wanida.id,
    sentAt: now - 4 * DAY,
    expiresAt: now - 4 * DAY + HOUR,
  });
  await store.setOfferState(cancelOffer.id, "AwaitingPayment", now - 4 * DAY + HOUR);
  const cancelled = await confirmFromOffer(store, cancelOffer.id, 600_000);
  const cancelCheckout = buildCheckout(satang(600_000));
  await store.cancelBooking({
    bookingId: cancelled.booking.id,
    payable: 0,
    refund: cancelCheckout.total,
    payoutKey: `payout:${cancelled.booking.id}:cancel`,
    refundKey: `refund:${cancelled.booking.id}`,
  });

  // --- Extra completed bookings so Dr. Prasert reaches the 3-review cold-start threshold (REV-04) ---
  for (let i = 0; i < 2; i++) {
    const extraShift = await store.postShift({
      clinicWorkspaceId: clinicB.id,
      category: "general",
      compensation: 500_000,
      urgency: "standard",
      shiftStart: now - (10 + i) * DAY,
      insuranceRequired: false,
    });
    await store.applyToShift(extraShift.shiftId, prasert.id);
    const extraOffer = await store.createOfferForShift({
      shiftId: extraShift.shiftId,
      professionalId: prasert.id,
      sentAt: now - (12 + i) * DAY,
      expiresAt: now - (12 + i) * DAY + HOUR,
    });
    await store.setOfferState(extraOffer.id, "AwaitingPayment", now - (12 + i) * DAY + HOUR);
    const extra = await confirmFromOffer(store, extraOffer.id, 500_000);
    await store.markCompletion(extra.booking.id);
    await store.recordPayout({
      bookingId: extra.booking.id,
      payoutAmount: 500_000,
      idempotencyKey: `payout:${extra.booking.id}`,
    });
    await store.createReview({
      bookingId: extra.booking.id,
      authorId: clinicB.id,
      subjectId: prasert.id,
      score: 4 + i,
      tags: ["reliable"],
    });
    await store.createReview({
      bookingId: extra.booking.id,
      authorId: prasert.id,
      subjectId: clinicB.id,
      score: 5,
      tags: ["well_equipped"],
    });
  }

  return {
    clinics: { sukhumvit: clinicA.id, rama: clinicB.id, pending: pendingClinic.id },
    professionals: {
      somchai: somchai.id,
      wanida: wanida.id,
      prasert: prasert.id,
      pending: pendingPro.id,
    },
    shifts: {
      openStandard: openStandard.shiftId,
      openUrgent: openUrgent.shiftId,
      withApplication: withApplication.shiftId,
      insuranceRequired: insuranceRequired.shiftId,
    },
    offers: { awaitingPayment: awaitingOffer.id },
    bookings: {
      completed: completed.booking.id,
      confirmedWithMessages: confirmedWithMessages.booking.id,
      awaitingCompletion: awaitingCompletion.booking.id,
      held: held.booking.id,
      cancelled: cancelled.booking.id,
    },
  };
}

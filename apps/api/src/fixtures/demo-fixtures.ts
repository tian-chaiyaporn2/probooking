import { buildCheckout, satang } from "@probook/domain";
import type { MarketplaceRepository } from "../modules/marketplace/marketplace.types.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Stable demo phones — safe to re-run; registration rejects duplicates per store. */
const DEMO_PHONES = {
  clinicA: "+66910000001",
  clinicB: "+66910000002",
  clinicPending: "+66910000003",
  drSomchai: "+66920000001",
  drWanida: "+66920000002",
  drPrasert: "+66920000003",
  drPending: "+66920000004",
  drSuspended: "+66920000005",
} as const;

export interface DemoSeedResult {
  clinics: { sukhumvit: string; rama: string; pending: string };
  professionals: {
    somchai: string;
    wanida: string;
    prasert: string;
    pending: string;
    suspended: string;
  };
  shifts: { openStandard: string; openUrgent: string; withApplication: string; insuranceRequired: string };
  offers: { pendingResponse: string; awaitingPayment: string; expired: string };
  bookings: {
    completed: string;
    confirmedWithMessages: string;
    awaitingCompletion: string;
    awaitingCompletionOverdue: string;
    held: string;
    cancelled: string;
    partialCancel: string;
    completionReview: string;
    reminderDue: string;
    unpublishedReview: string;
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

  // Verified but suspended — demonstrates VER-04/06 without blocking other fixtures.
  const suspended = await store.registerProfessional({
    displayName: "นพ. ถูกระงับ",
    profession: "physician",
    phone: DEMO_PHONES.drSuspended,
    payoutRef: "xxxx-4444",
  });
  await store.verifyProfessional(suspended.id);
  await store.suspendCredential(suspended.id);

  // Insurance evidence for dentistry shifts (VER-05).
  await store.submitInsurance(wanida.id, now + 365 * DAY);
  await store.verifyInsurance(wanida.id);
  // A second professional's insurance is submitted but NOT yet verified — populates the
  // operations insurance-review queue so that gate is walkable in the demo.
  await store.submitInsurance(prasert.id, now + 365 * DAY);

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
  await store.setOfferState(awaitingOffer.id, "AwaitingPayment", { fundingDueAt: now + HOUR });

  // --- PendingResponse offer (OFF-01, not yet accepted) ---
  const pendingShift = await store.postShift({
    clinicWorkspaceId: clinicB.id,
    category: "general",
    compensation: 700_000,
    urgency: "standard",
    shiftStart: now + 11 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(pendingShift.shiftId, wanida.id);
  const pendingOffer = await store.createOfferForShift({
    shiftId: pendingShift.shiftId,
    professionalId: wanida.id,
    sentAt: now - 30 * 60 * 1000,
    expiresAt: now + 2 * HOUR,
  });

  // --- Expired offer (OFF-03 terminal state) ---
  const expiredShift = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "general",
    compensation: 650_000,
    urgency: "standard",
    shiftStart: now + 12 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(expiredShift.shiftId, prasert.id);
  const expiredOffer = await store.createOfferForShift({
    shiftId: expiredShift.shiftId,
    professionalId: prasert.id,
    sentAt: now - 3 * DAY,
    expiresAt: now - 2 * DAY,
  });
  await store.setOfferState(expiredOffer.id, "Expired");

  // --- Actionable states OWNED BY THE SIGN-IN DEMO ACCOUNTS (clinicA + Dr Somchai) ---
  // The states above sit on secondary accounts (wanida/clinicB), so the interactive flows
  // weren't walkable from the accounts a demo tester actually signs in as. These make them so.

  // (a) A clinicA shift Somchai has applied to, with NO offer yet → the demo CLINIC can see a
  //     candidate and send an offer straight from its own dashboard.
  const demoClinicOpen = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "general",
    compensation: 950_000,
    urgency: "standard",
    shiftStart: now + 3 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(demoClinicOpen.shiftId, somchai.id);
  await store.applyToShift(demoClinicOpen.shiftId, wanida.id);

  // (b) A PendingResponse offer TO Somchai on another clinicA shift → the demo PRO can accept
  //     or decline an offer immediately after signing in.
  const demoProShift = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "general",
    compensation: 1_100_000,
    urgency: "urgent",
    shiftStart: now + 2 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(demoProShift.shiftId, somchai.id);
  await store.createOfferForShift({
    shiftId: demoProShift.shiftId,
    professionalId: somchai.id,
    sentAt: now,
    expiresAt: now + 12 * HOUR,
  });

  // (c) A completed + paid booking for Somchai (ServiceCompleted) → the demo PRO can leave a
  //     review immediately; it also appears in the clinic's completed history.
  const somchaiDoneShift = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "general",
    compensation: 900_000,
    urgency: "standard",
    shiftStart: now - 2 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(somchaiDoneShift.shiftId, somchai.id);
  const somchaiDoneOffer = await store.createOfferForShift({
    shiftId: somchaiDoneShift.shiftId,
    professionalId: somchai.id,
    sentAt: now - 4 * DAY,
    expiresAt: now - 4 * DAY + HOUR,
  });
  await store.setOfferState(somchaiDoneOffer.id, "AwaitingPayment", {
    fundingDueAt: now - 4 * DAY + HOUR,
  });
  const somchaiDone = await confirmFromOffer(store, somchaiDoneOffer.id, 900_000);
  await store.markCompletion(somchaiDone.booking.id);
  await store.recordPayout({
    bookingId: somchaiDone.booking.id,
    payoutAmount: 900_000,
    idempotencyKey: `payout:${somchaiDone.booking.id}`,
  });

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
  await store.setOfferState(completedOffer.id, "AwaitingPayment", { fundingDueAt: now - 5 * DAY + HOUR });
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
  await store.setOfferState(msgOffer.id, "AwaitingPayment", { fundingDueAt: now + HOUR });
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
  await store.setOfferState(awaitOffer.id, "AwaitingPayment", { fundingDueAt: now - 3 * DAY + HOUR });
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
  await store.setOfferState(heldOffer.id, "AwaitingPayment", { fundingDueAt: now + HOUR });
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
  await store.setOfferState(cancelOffer.id, "AwaitingPayment", { fundingDueAt: now - 4 * DAY + HOUR });
  const cancelled = await confirmFromOffer(store, cancelOffer.id, 600_000);
  const cancelCheckout = buildCheckout(satang(600_000));
  await store.cancelBooking({
    bookingId: cancelled.booking.id,
    payable: 0,
    refund: cancelCheckout.total,
    payoutKey: `payout:${cancelled.booking.id}:cancel`,
    refundKey: `refund:${cancelled.booking.id}`,
  });

  // --- Partial cancellation (CAN-01: 50% payable, clinic ordinary <24h) ---
  const partialShift = await store.postShift({
    clinicWorkspaceId: clinicB.id,
    category: "general",
    compensation: 1_000_000,
    urgency: "standard",
    shiftStart: now + 5 * HOUR,
    insuranceRequired: false,
  });
  await store.applyToShift(partialShift.shiftId, somchai.id);
  const partialOffer = await store.createOfferForShift({
    shiftId: partialShift.shiftId,
    professionalId: somchai.id,
    sentAt: now - 2 * DAY,
    expiresAt: now - 2 * DAY + HOUR,
  });
  await store.setOfferState(partialOffer.id, "AwaitingPayment", { fundingDueAt: now - 2 * DAY + HOUR });
  const partialCancel = await confirmFromOffer(store, partialOffer.id, 1_000_000);
  const partialCheckout = buildCheckout(satang(1_000_000));
  const partialPayable = 500_000; // 50% of compensation
  await store.cancelBooking({
    bookingId: partialCancel.booking.id,
    payable: partialPayable,
    refund: partialCheckout.total - partialPayable,
    payoutKey: `payout:${partialCancel.booking.id}:cancel`,
    refundKey: `refund:${partialCancel.booking.id}`,
  });

  // --- cancellation_support case (CAN: force_majeure routes to ops) ---
  const supportShift = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "general",
    compensation: 550_000,
    urgency: "standard",
    shiftStart: now + 14 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(supportShift.shiftId, wanida.id);
  const supportOffer = await store.createOfferForShift({
    shiftId: supportShift.shiftId,
    professionalId: wanida.id,
    sentAt: now - DAY,
    expiresAt: now + DAY,
  });
  await store.setOfferState(supportOffer.id, "AwaitingPayment", { fundingDueAt: now + HOUR });
  const supportBooking = await confirmFromOffer(store, supportOffer.id, 550_000);
  await store.createSupportCase(
    supportBooking.booking.id,
    "cancellation_support",
    "Cancellation requires support (reason: force_majeure)",
  );

  // --- completion_review case (CMP-04: shift ended >48h, still Confirmed) ---
  const reviewShift = await store.postShift({
    clinicWorkspaceId: clinicB.id,
    category: "general",
    compensation: 720_000,
    urgency: "standard",
    shiftStart: now - 4 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(reviewShift.shiftId, wanida.id);
  const reviewOffer = await store.createOfferForShift({
    shiftId: reviewShift.shiftId,
    professionalId: wanida.id,
    sentAt: now - 6 * DAY,
    expiresAt: now - 6 * DAY + HOUR,
  });
  await store.setOfferState(reviewOffer.id, "AwaitingPayment", { fundingDueAt: now - 6 * DAY + HOUR });
  const completionReview = await confirmFromOffer(store, reviewOffer.id, 720_000);
  await store.createSupportCase(
    completionReview.booking.id,
    "completion_review",
    "Clinic inactivity — professional never marked completion",
  );

  // --- Confirmed booking in 24h reminder window (NOT-01) ---
  const reminderShift = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "general",
    compensation: 680_000,
    urgency: "standard",
    shiftStart: now + 12 * HOUR,
    insuranceRequired: false,
  });
  await store.applyToShift(reminderShift.shiftId, prasert.id);
  const reminderOffer = await store.createOfferForShift({
    shiftId: reminderShift.shiftId,
    professionalId: prasert.id,
    sentAt: now - 2 * DAY,
    expiresAt: now - 2 * DAY + HOUR,
  });
  await store.setOfferState(reminderOffer.id, "AwaitingPayment", { fundingDueAt: now - 2 * DAY + HOUR });
  const reminderDue = await confirmFromOffer(store, reminderOffer.id, 680_000);

  // --- AwaitingCompletion past auto-accept deadline (CMP-03 worker target) ---
  const overdueShift = await store.postShift({
    clinicWorkspaceId: clinicB.id,
    category: "general",
    compensation: 640_000,
    urgency: "standard",
    shiftStart: now - 3 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(overdueShift.shiftId, somchai.id);
  const overdueOffer = await store.createOfferForShift({
    shiftId: overdueShift.shiftId,
    professionalId: somchai.id,
    sentAt: now - 5 * DAY,
    expiresAt: now - 5 * DAY + HOUR,
  });
  await store.setOfferState(overdueOffer.id, "AwaitingPayment", { fundingDueAt: now - 5 * DAY + HOUR });
  const awaitingCompletionOverdue = await confirmFromOffer(store, overdueOffer.id, 640_000);
  await store.markCompletion(awaitingCompletionOverdue.booking.id);

  // --- Unpublished review (REV-03: one party reviewed, awaiting counterpart) ---
  const unpubShift = await store.postShift({
    clinicWorkspaceId: clinicA.id,
    category: "general",
    compensation: 480_000,
    urgency: "standard",
    shiftStart: now - 8 * DAY,
    insuranceRequired: false,
  });
  await store.applyToShift(unpubShift.shiftId, wanida.id);
  const unpubOffer = await store.createOfferForShift({
    shiftId: unpubShift.shiftId,
    professionalId: wanida.id,
    sentAt: now - 10 * DAY,
    expiresAt: now - 10 * DAY + HOUR,
  });
  await store.setOfferState(unpubOffer.id, "AwaitingPayment", { fundingDueAt: now - 10 * DAY + HOUR });
  const unpublishedReview = await confirmFromOffer(store, unpubOffer.id, 480_000);
  await store.markCompletion(unpublishedReview.booking.id);
  await store.recordPayout({
    bookingId: unpublishedReview.booking.id,
    payoutAmount: 480_000,
    idempotencyKey: `payout:${unpublishedReview.booking.id}`,
  });
  await store.createReview({
    bookingId: unpublishedReview.booking.id,
    authorId: clinicA.id,
    subjectId: wanida.id,
    score: 4,
    tags: ["thorough"],
    text: "รอรีวิวจากทีม",
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
    await store.setOfferState(extraOffer.id, "AwaitingPayment", { fundingDueAt: now - (12 + i) * DAY + HOUR });
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

  // A refund proposal awaiting a second approver (§6.4) — populates the finance approvals
  // queue so a tester can either execute it (as the approver account) or be blocked by dual
  // control (as the proposer account +66900000005).
  await store.createApproval({
    capability: "finance.execute_refund",
    refType: "Booking",
    refId: completed.booking.id,
    amount: 50_000,
    reason: "ลูกค้าขอคืนเงินบางส่วน (demo)",
    initiatorId: "+66900000005",
    initiatorRole: "finance",
  });

  return {
    clinics: { sukhumvit: clinicA.id, rama: clinicB.id, pending: pendingClinic.id },
    professionals: {
      somchai: somchai.id,
      wanida: wanida.id,
      prasert: prasert.id,
      pending: pendingPro.id,
      suspended: suspended.id,
    },
    shifts: {
      openStandard: openStandard.shiftId,
      openUrgent: openUrgent.shiftId,
      withApplication: withApplication.shiftId,
      insuranceRequired: insuranceRequired.shiftId,
    },
    offers: {
      pendingResponse: pendingOffer.id,
      awaitingPayment: awaitingOffer.id,
      expired: expiredOffer.id,
    },
    bookings: {
      completed: completed.booking.id,
      confirmedWithMessages: confirmedWithMessages.booking.id,
      awaitingCompletion: awaitingCompletion.booking.id,
      awaitingCompletionOverdue: awaitingCompletionOverdue.booking.id,
      held: held.booking.id,
      cancelled: cancelled.booking.id,
      partialCancel: partialCancel.booking.id,
      completionReview: completionReview.booking.id,
      reminderDue: reminderDue.booking.id,
      unpublishedReview: unpublishedReview.booking.id,
    },
  };
}

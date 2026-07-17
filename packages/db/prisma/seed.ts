/**
 * Postgres demo fixtures — mirrors apps/api/src/fixtures/demo-fixtures.ts so
 * `pnpm db:seed` populates the same scenarios as in-memory boot seeding.
 */
import { buildCheckout, satang } from "@probook/domain";
import { prisma } from "../src/index.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SHIFT_LEN = 4 * HOUR;

const PHONES = {
  clinicA: "+66910000001",
  clinicB: "+66910000002",
  clinicPending: "+66910000003",
  drSomchai: "+66920000001",
  drWanida: "+66920000002",
  drPrasert: "+66920000003",
  drPending: "+66920000004",
} as const;

async function registerClinic(
  branchName: string,
  licenceNo: string,
  address: string,
  phone: string,
  verified: boolean,
) {
  const owner = await prisma.user.create({ data: { phone } });
  const clinic = await prisma.clinicWorkspace.create({
    data: {
      branchName,
      licenceNo,
      address,
      verification: verified ? "Verified" : "Submitted",
    },
  });
  await prisma.membership.create({
    data: { userId: owner.id, workspaceId: clinic.id, role: "clinic_owner" },
  });
  return clinic;
}

async function registerProfessional(
  displayName: string,
  profession: string,
  phone: string,
  payoutRef: string,
  verified: boolean,
) {
  const user = await prisma.user.create({ data: { phone } });
  const profile = await prisma.professionalProfile.create({
    data: {
      userId: user.id,
      displayName,
      profession,
      verification: verified ? "Verified" : "Submitted",
    },
  });
  await prisma.credential.create({
    data: { professionalId: profile.id, kind: "licence", state: verified ? "Verified" : "Submitted" },
  });
  await prisma.payoutAccount.create({
    data: { professionalId: profile.id, bankRefMasked: payoutRef, verified },
  });
  return profile;
}

async function postShift(
  workspaceId: string,
  category: string,
  compensation: number,
  urgency: "standard" | "urgent",
  startsAt: Date,
  insuranceRequired: boolean,
) {
  return prisma.shift.create({
    data: {
      workspaceId,
      state: "Published",
      urgency,
      category,
      scope: category,
      startsAt,
      endsAt: new Date(startsAt.getTime() + SHIFT_LEN),
      compensation,
      insuranceRequired,
    },
  });
}

async function confirmBooking(
  offerId: string,
  shiftId: string,
  professionalId: string,
  compensation: number,
) {
  const checkout = buildCheckout(satang(compensation));
  return prisma.$transaction(async (tx) => {
    await tx.offer.update({ where: { id: offerId }, data: { state: "Converted" } });
    const booking = await tx.booking.create({
      data: {
        offerId,
        shiftId,
        professionalId,
        state: "Confirmed",
        termsSnapshot: {},
        feeSnapshot: checkout.serviceFee,
        taxSnapshot: checkout.tax,
      },
    });
    const paymentOrder = await tx.paymentOrder.create({
      data: { bookingId: booking.id, state: "PaymentProtected", captured: checkout.total },
    });
    await tx.financialAllocation.create({
      data: {
        paymentOrderId: paymentOrder.id,
        compensation: checkout.compensation,
        serviceFee: checkout.serviceFee,
        tax: checkout.tax,
      },
    });
    await tx.financialEvent.create({
      data: {
        paymentOrderId: paymentOrder.id,
        type: "Collection",
        amount: checkout.total,
        idempotencyKey: `collection:${offerId}`,
      },
    });
    return booking;
  });
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { phone: PHONES.clinicA } });
  if (existing) {
    console.log("Demo fixtures already present — skipping (delete demo users to re-seed)");
    return;
  }

  console.log("Seeding ProBooking demo fixtures…");
  const now = Date.now();

  await registerClinic("คลินิกรอยจอง", "TH-PEND-001", "กรุงเทพฯ", PHONES.clinicPending, false);
  await registerProfessional("นพ. รอตรวจ", "physician", PHONES.drPending, "xxxx-0000", false);

  const clinicA = await registerClinic(
    "คลินิกสุขุมวิทสไมล์",
    "TH-DEMO-001",
    "สุขุมวิท กรุงเทพฯ",
    PHONES.clinicA,
    true,
  );
  const clinicB = await registerClinic(
    "คลินิกพระราม",
    "TH-DEMO-002",
    "พระราม 9 กรุงเทพฯ",
    PHONES.clinicB,
    true,
  );

  const somchai = await registerProfessional(
    "นพ. สมชาย ใจดี",
    "physician",
    PHONES.drSomchai,
    "xxxx-1111",
    true,
  );
  const wanida = await registerProfessional(
    "ทพ. วนิดา รักษ์ฟัน",
    "dentist",
    PHONES.drWanida,
    "xxxx-2222",
    true,
  );
  const prasert = await registerProfessional(
    "นพ. ประเสริฐ มั่นคง",
    "physician",
    PHONES.drPrasert,
    "xxxx-3333",
    true,
  );

  await prisma.insuranceEvidence.create({
    data: {
      professionalId: wanida.id,
      state: "Verified",
      validUntil: new Date(now + 365 * DAY),
    },
  });

  await prisma.availability.createMany({
    data: [
      {
        professionalId: somchai.id,
        startsAt: new Date(now + 2 * DAY),
        endsAt: new Date(now + 2 * DAY + 8 * HOUR),
        openToRequests: true,
      },
      {
        professionalId: wanida.id,
        startsAt: new Date(now + 3 * DAY),
        endsAt: new Date(now + 3 * DAY + 6 * HOUR),
        openToRequests: true,
      },
    ],
  });

  await postShift(clinicA.id, "general", 800_000, "standard", new Date(now + 5 * DAY), false);
  await postShift(clinicA.id, "dentistry", 1_200_000, "urgent", new Date(now + 36 * HOUR), true);

  const withApp = await postShift(
    clinicB.id,
    "general",
    1_000_000,
    "standard",
    new Date(now + 4 * DAY),
    false,
  );
  await prisma.application.create({ data: { shiftId: withApp.id, professionalId: somchai.id } });
  await prisma.invitation.create({ data: { shiftId: withApp.id, professionalId: prasert.id } });

  await postShift(clinicB.id, "dentistry", 1_500_000, "standard", new Date(now + 6 * DAY), true);

  const awaitingShift = await postShift(
    clinicA.id,
    "general",
    950_000,
    "standard",
    new Date(now + 9 * DAY),
    false,
  );
  await prisma.application.create({ data: { shiftId: awaitingShift.id, professionalId: somchai.id } });
  const awaitingOffer = await prisma.offer.create({
    data: {
      shiftId: awaitingShift.id,
      professionalId: somchai.id,
      state: "AwaitingPayment",
      termsSnapshot: {},
      sentAt: new Date(now),
      expiresAt: new Date(now + 2 * HOUR),
      fundingDueAt: new Date(now + HOUR),
    },
  });

  // Completed + paid booking
  const completedShift = await postShift(
    clinicA.id,
    "general",
    1_000_000,
    "standard",
    new Date(now - 2 * DAY),
    false,
  );
  await prisma.application.create({ data: { shiftId: completedShift.id, professionalId: prasert.id } });
  const completedOffer = await prisma.offer.create({
    data: {
      shiftId: completedShift.id,
      professionalId: prasert.id,
      state: "PendingResponse",
      termsSnapshot: {},
      sentAt: new Date(now - 5 * DAY),
      expiresAt: new Date(now - 5 * DAY + HOUR),
      fundingDueAt: new Date(now - 5 * DAY + HOUR),
    },
  });
  const completedBooking = await confirmBooking(
    completedOffer.id,
    completedShift.id,
    prasert.id,
    1_000_000,
  );
  await prisma.booking.update({
    where: { id: completedBooking.id },
    data: { state: "ServiceCompleted" },
  });
  const completedPo = await prisma.paymentOrder.findUniqueOrThrow({
    where: { bookingId: completedBooking.id },
    include: { allocation: true },
  });
  await prisma.financialAllocation.update({
    where: { paymentOrderId: completedPo.id },
    data: { payoutState: "Paid" },
  });
  await prisma.financialEvent.create({
    data: {
      paymentOrderId: completedPo.id,
      type: "Payout",
      amount: 1_000_000,
      idempotencyKey: `payout:${completedBooking.id}`,
    },
  });
  await prisma.review.createMany({
    data: [
      {
        bookingId: completedBooking.id,
        authorId: clinicA.id,
        subjectId: prasert.id,
        score: 5,
        tags: ["punctual"],
        text: "ทำงานดีมาก",
        publishedAt: new Date(now - DAY),
      },
      {
        bookingId: completedBooking.id,
        authorId: prasert.id,
        subjectId: clinicA.id,
        score: 5,
        tags: ["professional"],
        publishedAt: new Date(now - DAY),
      },
    ],
  });

  // Confirmed booking with messages
  const msgShift = await postShift(
    clinicB.id,
    "general",
    900_000,
    "standard",
    new Date(now + 7 * DAY),
    false,
  );
  await prisma.application.create({ data: { shiftId: msgShift.id, professionalId: somchai.id } });
  const msgOffer = await prisma.offer.create({
    data: {
      shiftId: msgShift.id,
      professionalId: somchai.id,
      state: "PendingResponse",
      termsSnapshot: {},
      sentAt: new Date(now - HOUR),
      expiresAt: new Date(now + HOUR),
      fundingDueAt: new Date(now + HOUR),
    },
  });
  const msgBooking = await confirmBooking(msgOffer.id, msgShift.id, somchai.id, 900_000);
  await prisma.message.createMany({
    data: [
      { bookingId: msgBooking.id, senderId: clinicB.id, body: "สวัสดีครับ พร้อมเริ่มงานตามเวลา" },
      { bookingId: msgBooking.id, senderId: somchai.id, body: "ครับ พร้อมครับ" },
    ],
  });

  // Awaiting completion
  const awaitShift = await postShift(
    clinicA.id,
    "general",
    750_000,
    "standard",
    new Date(now - DAY),
    false,
  );
  await prisma.application.create({ data: { shiftId: awaitShift.id, professionalId: somchai.id } });
  const awaitOffer = await prisma.offer.create({
    data: {
      shiftId: awaitShift.id,
      professionalId: somchai.id,
      state: "PendingResponse",
      termsSnapshot: {},
      sentAt: new Date(now - 3 * DAY),
      expiresAt: new Date(now - 3 * DAY + HOUR),
      fundingDueAt: new Date(now - 3 * DAY + HOUR),
    },
  });
  const awaitBooking = await confirmBooking(awaitOffer.id, awaitShift.id, somchai.id, 750_000);
  await prisma.booking.update({
    where: { id: awaitBooking.id },
    data: { state: "AwaitingCompletion", autoAcceptAt: new Date(now + DAY) },
  });

  // Held booking + credential_hold case
  const heldShift = await postShift(
    clinicB.id,
    "general",
    850_000,
    "standard",
    new Date(now + 8 * DAY),
    false,
  );
  await prisma.application.create({ data: { shiftId: heldShift.id, professionalId: prasert.id } });
  const heldOffer = await prisma.offer.create({
    data: {
      shiftId: heldShift.id,
      professionalId: prasert.id,
      state: "PendingResponse",
      termsSnapshot: {},
      sentAt: new Date(now - 2 * HOUR),
      expiresAt: new Date(now + 2 * HOUR),
      fundingDueAt: new Date(now + HOUR),
    },
  });
  const heldBooking = await confirmBooking(heldOffer.id, heldShift.id, prasert.id, 850_000);
  await prisma.booking.update({
    where: { id: heldBooking.id },
    data: { heldAt: new Date(), heldReason: "credential_or_insurance_invalid" },
  });
  await prisma.supportCase.create({
    data: {
      subject: "Credential review required",
      kind: "credential_hold",
      state: "Open",
      refType: "Booking",
      refId: heldBooking.id,
    },
  });

  // Cancelled booking with refund
  const cancelShift = await postShift(
    clinicA.id,
    "general",
    600_000,
    "standard",
    new Date(now + 10 * DAY),
    false,
  );
  await prisma.application.create({ data: { shiftId: cancelShift.id, professionalId: wanida.id } });
  const cancelOffer = await prisma.offer.create({
    data: {
      shiftId: cancelShift.id,
      professionalId: wanida.id,
      state: "PendingResponse",
      termsSnapshot: {},
      sentAt: new Date(now - 4 * DAY),
      expiresAt: new Date(now - 4 * DAY + HOUR),
      fundingDueAt: new Date(now - 4 * DAY + HOUR),
    },
  });
  const cancelBooking = await confirmBooking(cancelOffer.id, cancelShift.id, wanida.id, 600_000);
  const cancelCheckout = buildCheckout(satang(600_000));
  const cancelPo = await prisma.paymentOrder.findUniqueOrThrow({
    where: { bookingId: cancelBooking.id },
    include: { allocation: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: cancelBooking.id }, data: { state: "Cancelled" } });
    await tx.financialAllocation.update({
      where: { paymentOrderId: cancelPo.id },
      data: { refundState: "Refunded" },
    });
    await tx.financialEvent.create({
      data: {
        paymentOrderId: cancelPo.id,
        type: "Refund",
        amount: cancelCheckout.total,
        idempotencyKey: `refund:${cancelBooking.id}`,
      },
    });
  });

  // Extra completed bookings for 3-review cold-start threshold
  for (let i = 0; i < 2; i++) {
    const extraShift = await postShift(
      clinicB.id,
      "general",
      500_000,
      "standard",
      new Date(now - (10 + i) * DAY),
      false,
    );
    await prisma.application.create({ data: { shiftId: extraShift.id, professionalId: prasert.id } });
    const extraOffer = await prisma.offer.create({
      data: {
        shiftId: extraShift.id,
        professionalId: prasert.id,
        state: "PendingResponse",
        termsSnapshot: {},
        sentAt: new Date(now - (12 + i) * DAY),
        expiresAt: new Date(now - (12 + i) * DAY + HOUR),
        fundingDueAt: new Date(now - (12 + i) * DAY + HOUR),
      },
    });
    const extraBooking = await confirmBooking(extraOffer.id, extraShift.id, prasert.id, 500_000);
    await prisma.booking.update({
      where: { id: extraBooking.id },
      data: { state: "ServiceCompleted" },
    });
    const extraPo = await prisma.paymentOrder.findUniqueOrThrow({
      where: { bookingId: extraBooking.id },
      include: { allocation: true },
    });
    await prisma.financialAllocation.update({
      where: { paymentOrderId: extraPo.id },
      data: { payoutState: "Paid" },
    });
    await prisma.financialEvent.create({
      data: {
        paymentOrderId: extraPo.id,
        type: "Payout",
        amount: 500_000,
        idempotencyKey: `payout:${extraBooking.id}`,
      },
    });
    await prisma.review.createMany({
      data: [
        {
          bookingId: extraBooking.id,
          authorId: clinicB.id,
          subjectId: prasert.id,
          score: 4 + i,
          tags: ["reliable"],
          publishedAt: new Date(now - (8 + i) * DAY),
        },
        {
          bookingId: extraBooking.id,
          authorId: prasert.id,
          subjectId: clinicB.id,
          score: 5,
          tags: ["well_equipped"],
          publishedAt: new Date(now - (8 + i) * DAY),
        },
      ],
    });
  }

  console.log("Done — demo fixtures loaded.");
  console.log(`  Awaiting-payment offer: ${awaitingOffer.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

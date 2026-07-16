import { prisma } from "@probook/db";
import { autoAcceptDueAt, advanceVerification, aggregateRating } from "@probook/domain";
import type {
  OfferState,
  BookingState,
  PayoutState,
  CaseState,
  VerificationState,
  ShiftUrgency,
  RatingSummary,
} from "@probook/domain";
import type {
  MarketplaceRepository,
  OfferRecord,
  BookingRecord,
  BookingDetail,
  ShiftPostInput,
  ShiftRecord,
  Candidate,
  CreateOfferForShiftInput,
  ConfirmBookingInput,
  ConfirmBookingResult,
  PayoutInput,
  PayoutResult,
  ReviewCase,
  CancelInput,
  CancelResult,
  RegisterClinicInput,
  RegisterProfessionalInput,
  EntityRef,
  OfferEligibility,
  ReviewInput,
  ReviewResult,
  NotificationInput,
  OpenShift,
  CaseSummary,
  PendingVerification,
  AvailabilityBlock,
  ShiftFilters,
  ProfessionalFilters,
  ProfessionalSearchResult,
  MessageRecord,
  BookingContact,
} from "./marketplace.types.js";

const SHIFT_LENGTH_MS = 4 * 60 * 60 * 1000;

type OfferWithShift = {
  id: string;
  professionalId: string;
  state: string;
  sentAt: Date;
  expiresAt: Date;
  fundingDueAt: Date | null;
  shift: { id: string; workspaceId: string; compensation: number; urgency: string; startsAt: Date };
};

/**
 * Postgres-backed implementation via @probook/db (Prisma). Persists the real graph:
 * registered ClinicWorkspace (+ owner User + Membership) and ProfessionalProfile
 * (+ User, Credential, PayoutAccount) that Operations verifies (VER-01/02), then a
 * Shift, the Offer, and — on confirmation — the Booking plus its Payment Protected
 * money records, all in one transaction (BKG-02). Booking's unique constraints on
 * shiftId/offerId enforce §6.4 at the database level.
 */
export class PrismaMarketplaceStore implements MarketplaceRepository {
  async registerClinic(
    input: RegisterClinicInput,
  ): Promise<EntityRef & { ownerUserId: string }> {
    const owner = await prisma.user.create({ data: { phone: input.ownerPhone } });
    const clinic = await prisma.clinicWorkspace.create({
      data: {
        branchName: input.branchName,
        licenceNo: input.licenceNo,
        address: input.address,
        verification: "Submitted",
      },
    });
    await prisma.membership.create({
      data: { userId: owner.id, workspaceId: clinic.id, role: "clinic_owner" },
    });
    return { id: clinic.id, verification: "Submitted", ownerUserId: owner.id };
  }

  async registerProfessional(input: RegisterProfessionalInput): Promise<EntityRef> {
    const user = await prisma.user.create({ data: { phone: input.phone } });
    const profile = await prisma.professionalProfile.create({
      data: {
        userId: user.id,
        displayName: input.displayName,
        profession: input.profession,
        verification: "Submitted",
      },
    });
    await prisma.credential.create({
      data: { professionalId: profile.id, kind: "licence", state: "Submitted" },
    });
    await prisma.payoutAccount.create({
      data: { professionalId: profile.id, bankRefMasked: input.payoutRef, verified: false },
    });
    return { id: profile.id, verification: "Submitted" };
  }

  async verifyClinic(id: string): Promise<EntityRef | null> {
    const clinic = await prisma.clinicWorkspace.findUnique({ where: { id } });
    if (!clinic) return null;
    if (clinic.verification === "Verified") return { id, verification: "Verified" }; // idempotent
    const next = advanceVerification(clinic.verification as VerificationState, "Verified");
    await prisma.clinicWorkspace.update({ where: { id }, data: { verification: next } });
    return { id, verification: next };
  }

  async verifyProfessional(id: string): Promise<EntityRef | null> {
    const p = await prisma.professionalProfile.findUnique({ where: { id } });
    if (!p) return null;
    if (p.verification === "Verified") return { id, verification: "Verified" }; // idempotent
    const next = advanceVerification(p.verification as VerificationState, "Verified");
    await prisma.$transaction([
      prisma.professionalProfile.update({ where: { id }, data: { verification: next } }),
      // VER-04/07: the licence credential and the payout account are confirmed too.
      prisma.credential.updateMany({ where: { professionalId: id }, data: { state: "Verified" } }),
      prisma.payoutAccount.updateMany({ where: { professionalId: id }, data: { verified: true } }),
    ]);
    return { id, verification: next };
  }

  async clinicVerification(id: string): Promise<VerificationState | null> {
    const c = await prisma.clinicWorkspace.findUnique({
      where: { id },
      select: { verification: true },
    });
    return c ? (c.verification as VerificationState) : null;
  }

  async getOfferEligibility(offerId: string): Promise<OfferEligibility | null> {
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { shift: { include: { workspace: true } }, professional: true },
    });
    if (!offer) return null;
    return {
      clinicVerified: offer.shift.workspace.verification === "Verified",
      professionalVerified: offer.professional.verification === "Verified",
    };
  }

  async postShift(input: ShiftPostInput): Promise<{ shiftId: string }> {
    const shift = await prisma.shift.create({
      data: {
        workspaceId: input.clinicWorkspaceId,
        state: "Published",
        urgency: input.urgency,
        category: input.category,
        scope: input.category,
        startsAt: new Date(input.shiftStart),
        endsAt: new Date(input.shiftStart + SHIFT_LENGTH_MS),
        compensation: input.compensation,
        termsLocked: false,
      },
    });
    return { shiftId: shift.id };
  }

  async getShift(id: string): Promise<ShiftRecord | null> {
    const s = await prisma.shift.findUnique({
      where: { id },
      include: { offers: { select: { state: true } }, booking: { select: { id: true } } },
    });
    if (!s) return null;
    return {
      id: s.id,
      clinicWorkspaceId: s.workspaceId,
      category: s.category,
      compensation: s.compensation,
      urgency: s.urgency as ShiftUrgency,
      startsAt: s.startsAt.getTime(),
      state: s.state,
      hasActiveOffer: s.offers.some((o) => o.state === "PendingResponse" || o.state === "AwaitingPayment"),
      booked: s.booking !== null,
    };
  }

  async applyToShift(shiftId: string, professionalId: string): Promise<{ id: string }> {
    const a = await prisma.application.create({
      data: { shiftId, professionalId, state: "Submitted" },
    });
    return { id: a.id };
  }

  async inviteToShift(shiftId: string, professionalId: string): Promise<{ id: string }> {
    const i = await prisma.invitation.create({
      data: { shiftId, professionalId, state: "Sent" },
    });
    return { id: i.id };
  }

  async listShiftCandidates(shiftId: string): Promise<Candidate[]> {
    const apps = await prisma.application.findMany({
      where: { shiftId },
      select: { professionalId: true, state: true },
    });
    const invs = await prisma.invitation.findMany({
      where: { shiftId },
      select: { professionalId: true, state: true },
    });
    return [
      ...apps.map((a) => ({ professionalId: a.professionalId, via: "application" as const, state: a.state })),
      ...invs.map((i) => ({ professionalId: i.professionalId, via: "invitation" as const, state: i.state })),
    ];
  }

  async createOfferForShift(input: CreateOfferForShiftInput): Promise<OfferRecord> {
    // Atomic: create the one binding offer, mark the applicant OfferSent, lock terms (SHF-04).
    const offer = await prisma.$transaction(async (tx) => {
      const o = await tx.offer.create({
        data: {
          shiftId: input.shiftId,
          professionalId: input.professionalId,
          state: "PendingResponse",
          termsSnapshot: {},
          sentAt: new Date(input.sentAt),
          expiresAt: new Date(input.expiresAt),
        },
        include: { shift: true },
      });
      await tx.application.updateMany({
        where: { shiftId: input.shiftId, professionalId: input.professionalId },
        data: { state: "OfferSent" },
      });
      await tx.shift.update({ where: { id: input.shiftId }, data: { termsLocked: true } });
      return o;
    });
    return this.toRecord(offer as OfferWithShift);
  }

  async getOffer(id: string): Promise<OfferRecord | null> {
    const offer = await prisma.offer.findUnique({ where: { id }, include: { shift: true } });
    return offer ? this.toRecord(offer as OfferWithShift) : null;
  }

  async addAvailability(
    professionalId: string,
    startsAt: number,
    endsAt: number,
    openToRequests: boolean,
  ): Promise<AvailabilityBlock> {
    const a = await prisma.availability.create({
      data: { professionalId, startsAt: new Date(startsAt), endsAt: new Date(endsAt), openToRequests },
    });
    return { id: a.id, startsAt: a.startsAt.getTime(), endsAt: a.endsAt.getTime(), openToRequests: a.openToRequests };
  }

  async listAvailability(professionalId: string): Promise<AvailabilityBlock[]> {
    const list = await prisma.availability.findMany({
      where: { professionalId },
      orderBy: { startsAt: "asc" },
    });
    return list.map((a) => ({
      id: a.id,
      startsAt: a.startsAt.getTime(),
      endsAt: a.endsAt.getTime(),
      openToRequests: a.openToRequests,
    }));
  }

  async hasScheduleOverlap(professionalId: string, startsAt: number, endsAt: number): Promise<boolean> {
    // Overlap when an active booking's shift spans into [startsAt, endsAt).
    const count = await prisma.booking.count({
      where: {
        professionalId,
        state: { in: ["Confirmed", "InProgress", "AwaitingCompletion"] },
        shift: { startsAt: { lt: new Date(endsAt) }, endsAt: { gt: new Date(startsAt) } },
      },
    });
    return count > 0;
  }

  async searchProfessionals(filters: ProfessionalFilters): Promise<ProfessionalSearchResult[]> {
    const pros = await prisma.professionalProfile.findMany({
      where: {
        verification: "Verified",
        ...(filters.profession ? { profession: filters.profession } : {}),
        ...(filters.specialty ? { specialty: filters.specialty } : {}),
      },
      select: { id: true, displayName: true, profession: true, specialty: true },
      take: 50,
    });
    const results: ProfessionalSearchResult[] = [];
    for (const p of pros) {
      const rating = await this.getSubjectRating(p.id);
      results.push({
        id: p.id,
        displayName: p.displayName,
        profession: p.profession,
        specialty: p.specialty,
        rating: rating ? rating.average : null,
      });
    }
    return results;
  }

  async listOpenShifts(filters?: ShiftFilters): Promise<OpenShift[]> {
    // Open = Published, unbooked, and with no active offer yet — priority-ordered:
    // urgent first (enum sorts "urgent" > "standard"), then soonest (SRC-03 deterministic).
    const shifts = await prisma.shift.findMany({
      where: {
        state: "Published",
        booking: null,
        offers: { none: { state: { in: ["PendingResponse", "AwaitingPayment"] } } },
        ...(filters?.urgency ? { urgency: filters.urgency } : {}),
        ...(filters?.category ? { category: { contains: filters.category, mode: "insensitive" as const } } : {}),
        ...(filters?.minCompensation !== undefined || filters?.maxCompensation !== undefined
          ? {
              compensation: {
                ...(filters?.minCompensation !== undefined ? { gte: filters.minCompensation } : {}),
                ...(filters?.maxCompensation !== undefined ? { lte: filters.maxCompensation } : {}),
              },
            }
          : {}),
      },
      select: { id: true, category: true, compensation: true, urgency: true, startsAt: true },
      orderBy: [{ urgency: "desc" }, { startsAt: "asc" }],
    });
    return shifts.map((s) => ({
      shiftId: s.id,
      category: s.category,
      compensation: s.compensation,
      startsAt: s.startsAt.getTime(),
      urgency: s.urgency as ShiftUrgency,
      urgent: s.urgency === "urgent",
    }));
  }

  async setOfferState(id: string, state: OfferState, fundingDueAt?: number): Promise<OfferRecord | null> {
    const offer = await prisma.offer.update({
      where: { id },
      data: {
        state,
        ...(fundingDueAt !== undefined ? { fundingDueAt: new Date(fundingDueAt) } : {}),
      },
      include: { shift: true },
    });
    return this.toRecord(offer as OfferWithShift);
  }

  async confirmBooking(input: ConfirmBookingInput): Promise<ConfirmBookingResult> {
    // Atomic (BKG-02): offer -> Converted + booking + Payment Protected money records
    // all commit together, or none do.
    return prisma.$transaction(async (tx) => {
      await tx.offer.update({ where: { id: input.offerId }, data: { state: "Converted" } });
      const booking = await tx.booking.create({
        data: {
          offerId: input.offerId,
          shiftId: input.shiftId,
          professionalId: input.professionalId,
          state: "Confirmed",
          termsSnapshot: {},
          feeSnapshot: input.allocation.serviceFee,
          taxSnapshot: input.allocation.tax,
        },
      });
      const paymentOrder = await tx.paymentOrder.create({
        data: {
          bookingId: booking.id,
          state: "PaymentProtected", // funds captured/guaranteed (PAY-01, BKG-01)
          captured: input.captured,
        },
      });
      await tx.financialAllocation.create({
        data: {
          paymentOrderId: paymentOrder.id,
          compensation: input.allocation.compensation,
          serviceFee: input.allocation.serviceFee,
          tax: input.allocation.tax,
        },
      });
      // Immutable collection event, idempotent by key (PAY-04/05).
      await tx.financialEvent.create({
        data: {
          paymentOrderId: paymentOrder.id,
          type: "Collection",
          amount: input.captured,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return {
        booking: {
          id: booking.id,
          offerId: booking.offerId,
          shiftId: booking.shiftId,
          professionalId: booking.professionalId,
          state: "Confirmed" as const,
        },
        paymentOrderId: paymentOrder.id,
      };
    });
  }

  async getBookingByOffer(offerId: string): Promise<BookingRecord | null> {
    const booking = await prisma.booking.findUnique({ where: { offerId } });
    return booking
      ? {
          id: booking.id,
          offerId: booking.offerId,
          shiftId: booking.shiftId,
          professionalId: booking.professionalId,
          state: booking.state as BookingRecord["state"],
        }
      : null;
  }

  async getBooking(id: string): Promise<BookingDetail | null> {
    const b = await prisma.booking.findUnique({
      where: { id },
      include: { paymentOrder: { include: { allocation: true } }, shift: true },
    });
    if (!b) return null;
    const alloc = b.paymentOrder?.allocation ?? null;
    return {
      id: b.id,
      offerId: b.offerId,
      shiftId: b.shiftId,
      clinicWorkspaceId: b.shift.workspaceId,
      professionalId: b.professionalId,
      state: b.state as BookingState,
      compensation: alloc?.compensation ?? 0,
      serviceFee: alloc?.serviceFee ?? b.feeSnapshot,
      tax: alloc?.tax ?? b.taxSnapshot,
      captured: b.paymentOrder?.captured ?? 0,
      payoutState: (alloc?.payoutState ?? "NotEligible") as PayoutState,
      paymentOrderId: b.paymentOrder?.id ?? null,
      heldAt: b.heldAt ? b.heldAt.getTime() : null,
    };
  }

  async suspendCredential(professionalId: string): Promise<boolean> {
    const cred = await prisma.credential.findFirst({
      where: { professionalId, kind: "licence" },
    });
    if (!cred) return false;
    if (cred.state === "Suspended") return true; // idempotent
    const next = advanceVerification(cred.state as VerificationState, "Suspended");
    await prisma.credential.update({ where: { id: cred.id }, data: { state: next } });
    return true;
  }

  async holdBooking(bookingId: string, reason: string): Promise<BookingDetail | null> {
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b) return null;
    if (!b.heldAt) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { heldAt: new Date(), heldReason: reason },
      });
    }
    return this.getBooking(bookingId);
  }

  async resolveHold(bookingId: string): Promise<BookingDetail | null> {
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b) return null;
    await prisma.booking.update({
      where: { id: bookingId },
      data: { heldAt: null, heldReason: null },
    });
    return this.getBooking(bookingId);
  }

  async markCompletion(id: string): Promise<BookingDetail | null> {
    const existing = await prisma.booking.findUnique({ where: { id }, include: { shift: true } });
    if (!existing) return null;
    // CMP-01: professional marks completion; booking -> AwaitingCompletion. Stamp the
    // auto-accept deadline (CMP-03): 24h after the later of shift end and submission.
    const autoAcceptAt = new Date(autoAcceptDueAt(existing.shift.endsAt.getTime(), Date.now()));
    await prisma.booking.update({
      where: { id },
      data: { state: "AwaitingCompletion", autoAcceptAt },
    });
    await prisma.attendanceEvent.create({
      data: { bookingId: id, kind: "Completed", actorId: existing.professionalId },
    });
    return this.getBooking(id);
  }

  async recordPayout(input: PayoutInput): Promise<PayoutResult> {
    // Atomic: booking -> ServiceCompleted, allocation payout -> Paid, Payout event.
    return prisma.$transaction(async (tx) => {
      const po = await tx.paymentOrder.findUnique({
        where: { bookingId: input.bookingId },
        include: { allocation: true },
      });
      if (!po?.allocation) {
        throw new Error("no payment allocation for booking");
      }
      await tx.booking.update({ where: { id: input.bookingId }, data: { state: "ServiceCompleted" } });
      await tx.financialAllocation.update({
        where: { paymentOrderId: po.id },
        data: { payoutState: "Paid" },
      });
      // Immutable payout event, idempotent by key (PAY-04/05, PAY-09).
      await tx.financialEvent.create({
        data: {
          paymentOrderId: po.id,
          type: "Payout",
          amount: input.payoutAmount,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return {
        bookingState: "ServiceCompleted" as const,
        payoutState: "Paid" as const,
        payoutAmount: input.payoutAmount,
      };
    });
  }

  async findSupportCase(bookingId: string, kind: string): Promise<ReviewCase | null> {
    const c = await prisma.supportCase.findFirst({
      where: { refType: "Booking", refId: bookingId, kind },
    });
    return c ? { id: c.id, state: c.state as CaseState, bookingId } : null;
  }

  async createSupportCase(bookingId: string, kind: string, subject: string): Promise<ReviewCase> {
    const c = await prisma.supportCase.create({
      data: { subject, kind, state: "Open", refType: "Booking", refId: bookingId },
    });
    return { id: c.id, state: "Open", bookingId };
  }

  async cancelBooking(input: CancelInput): Promise<CancelResult> {
    // Atomic: booking -> Cancelled, professional payout (if any), clinic refund, and
    // the payment-order/allocation states, all commit together.
    return prisma.$transaction(async (tx) => {
      const po = await tx.paymentOrder.findUnique({
        where: { bookingId: input.bookingId },
        include: { allocation: true },
      });
      if (!po?.allocation) throw new Error("no payment allocation for booking");

      await tx.booking.update({ where: { id: input.bookingId }, data: { state: "Cancelled" } });

      if (input.payable > 0) {
        await tx.financialEvent.create({
          data: {
            paymentOrderId: po.id,
            type: "Payout",
            amount: input.payable,
            idempotencyKey: input.payoutKey,
          },
        });
      }
      await tx.financialEvent.create({
        data: {
          paymentOrderId: po.id,
          type: "Refund",
          amount: input.refund,
          idempotencyKey: input.refundKey,
        },
      });

      const payoutState = input.payable > 0 ? "Paid" : "NotEligible";
      const refundState = input.payable > 0 ? "PartiallyRefunded" : "Refunded";
      await tx.financialAllocation.update({
        where: { paymentOrderId: po.id },
        data: { payoutState, refundState },
      });
      await tx.paymentOrder.update({ where: { id: po.id }, data: { state: "Refunded" } });

      return {
        bookingState: "Cancelled" as const,
        payoutState,
        refundState,
        payable: input.payable,
        refund: input.refund,
      };
    });
  }

  async createReview(input: ReviewInput): Promise<ReviewResult> {
    return prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          bookingId: input.bookingId,
          authorId: input.authorId,
          subjectId: input.subjectId,
          score: input.score,
          tags: input.tags,
          text: input.text ?? null,
        },
      });
      // REV-03: if the other party already reviewed this booking, publish both now.
      const counterpart = await tx.review.findFirst({
        where: { bookingId: input.bookingId, authorId: { not: input.authorId } },
      });
      if (counterpart) {
        await tx.review.updateMany({
          where: { bookingId: input.bookingId, publishedAt: null },
          data: { publishedAt: new Date() },
        });
        return { id: review.id, published: true };
      }
      return { id: review.id, published: false };
    });
  }

  async getSubjectRating(subjectId: string): Promise<RatingSummary | null> {
    // REV-04: only PUBLISHED reviews count; REV-05: cancelled bookings never produced
    // a review (the API gates creation on ServiceCompleted), so none appear here.
    const reviews = await prisma.review.findMany({
      where: { subjectId, publishedAt: { not: null } },
      select: { score: true },
    });
    return aggregateRating(reviews.map((r) => r.score));
  }

  async listOpenCases(): Promise<CaseSummary[]> {
    const cases = await prisma.supportCase.findMany({
      where: { state: { not: "Resolved" } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return cases.map((c) => ({
      id: c.id,
      kind: c.kind,
      state: c.state as CaseSummary["state"],
      refId: c.refId,
      subject: c.subject,
    }));
  }

  async listPendingVerifications(): Promise<PendingVerification[]> {
    const clinics = await prisma.clinicWorkspace.findMany({
      where: { verification: "Submitted" },
      select: { id: true, branchName: true },
      take: 50,
    });
    const pros = await prisma.professionalProfile.findMany({
      where: { verification: "Submitted" },
      select: { id: true, displayName: true },
      take: 50,
    });
    return [
      ...clinics.map((c) => ({ kind: "clinic" as const, id: c.id, name: c.branchName })),
      ...pros.map((p) => ({ kind: "professional" as const, id: p.id, name: p.displayName })),
    ];
  }

  async postMessage(bookingId: string, senderId: string, body: string): Promise<MessageRecord> {
    const m = await prisma.message.create({ data: { bookingId, senderId, body } });
    return { id: m.id, senderId: m.senderId, body: m.body, createdAt: m.createdAt.getTime() };
  }

  async listMessages(bookingId: string): Promise<MessageRecord[]> {
    const list = await prisma.message.findMany({
      where: { bookingId },
      orderBy: { createdAt: "asc" },
    });
    return list.map((m) => ({ id: m.id, senderId: m.senderId, body: m.body, createdAt: m.createdAt.getTime() }));
  }

  async getBookingContact(bookingId: string): Promise<BookingContact | null> {
    const b = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        professional: { include: { user: true } },
        shift: {
          include: {
            workspace: {
              include: { memberships: { where: { role: "clinic_owner" }, include: { user: true }, take: 1 } },
            },
          },
        },
      },
    });
    if (!b) return null;
    return {
      clinicPhone: b.shift.workspace.memberships[0]?.user.phone ?? null,
      professionalPhone: b.professional.user.phone,
    };
  }

  async recordNotification(input: NotificationInput): Promise<void> {
    await prisma.notification.create({
      data: {
        channel: input.channel,
        to: input.to,
        event: input.event,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
      },
    });
  }

  private toRecord(o: OfferWithShift): OfferRecord {
    return {
      id: o.id,
      shiftId: o.shift.id,
      clinicWorkspaceId: o.shift.workspaceId,
      professionalId: o.professionalId,
      compensation: o.shift.compensation,
      urgency: o.shift.urgency as ShiftUrgency,
      state: o.state as OfferState,
      sentAt: o.sentAt.getTime(),
      shiftStart: o.shift.startsAt.getTime(),
      expiresAt: o.expiresAt.getTime(),
      fundingDueAt: o.fundingDueAt ? o.fundingDueAt.getTime() : null,
    };
  }
}

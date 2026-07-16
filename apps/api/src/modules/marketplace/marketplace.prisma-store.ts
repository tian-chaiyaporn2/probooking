import { prisma } from "@probook/db";
import { autoAcceptDueAt } from "@probook/domain";
import type { OfferState, BookingState, PayoutState, ShiftUrgency } from "@probook/domain";
import type {
  MarketplaceRepository,
  OfferRecord,
  BookingRecord,
  BookingDetail,
  CreateOfferInput,
  ConfirmBookingInput,
  ConfirmBookingResult,
  PayoutInput,
  PayoutResult,
} from "./marketplace.types.js";

const SHIFT_LENGTH_MS = 4 * 60 * 60 * 1000;

// Fixed Phase-0 identity fixtures. In later phases these come from real
// registration/verification (ORG-01, PRO-01); here they are ensured idempotently
// so the flow references a real ClinicWorkspace + ProfessionalProfile.
const DEMO = {
  workspaceId: "demo-clinic",
  ownerUserId: "demo-owner",
  ownerPhone: "+66800000001",
  proUserId: "demo-pro-user",
  proPhone: "+66800000002",
  professionalId: "demo-pro",
} as const;

type OfferWithShift = {
  id: string;
  professionalId: string;
  state: string;
  sentAt: Date;
  expiresAt: Date;
  fundingDueAt: Date | null;
  shift: { id: string; compensation: number; urgency: string; startsAt: Date };
};

/**
 * Postgres-backed implementation via @probook/db (Prisma). Persists the real graph:
 * ClinicWorkspace + owner User + Membership, a ProfessionalProfile (+ its User), a
 * Shift, the Offer, and — on confirmation — the Booking plus its Payment Protected
 * money records, all in one transaction (BKG-02). Booking's unique constraints on
 * shiftId/offerId enforce §6.4 at the database level.
 */
export class PrismaMarketplaceStore implements MarketplaceRepository {
  async createOffer(input: CreateOfferInput): Promise<OfferRecord> {
    const { workspaceId, professionalId } = await this.ensureIdentity();
    const shift = await prisma.shift.create({
      data: {
        workspaceId,
        state: "Published",
        urgency: input.urgency,
        category: input.shiftLabel,
        scope: input.shiftLabel,
        startsAt: new Date(input.shiftStart),
        endsAt: new Date(input.shiftStart + SHIFT_LENGTH_MS),
        compensation: input.compensation,
        termsLocked: true,
      },
    });
    const offer = await prisma.offer.create({
      data: {
        shiftId: shift.id,
        professionalId, // real ProfessionalProfile reference
        state: "PendingResponse",
        termsSnapshot: { compensation: input.compensation, urgency: input.urgency },
        sentAt: new Date(input.sentAt),
        expiresAt: new Date(input.expiresAt),
      },
      include: { shift: true },
    });
    return this.toRecord(offer as OfferWithShift);
  }

  async getOffer(id: string): Promise<OfferRecord | null> {
    const offer = await prisma.offer.findUnique({ where: { id }, include: { shift: true } });
    return offer ? this.toRecord(offer as OfferWithShift) : null;
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
      include: { paymentOrder: { include: { allocation: true } } },
    });
    if (!b) return null;
    const alloc = b.paymentOrder?.allocation ?? null;
    return {
      id: b.id,
      offerId: b.offerId,
      shiftId: b.shiftId,
      professionalId: b.professionalId,
      state: b.state as BookingState,
      compensation: alloc?.compensation ?? 0,
      serviceFee: alloc?.serviceFee ?? b.feeSnapshot,
      tax: alloc?.tax ?? b.taxSnapshot,
      captured: b.paymentOrder?.captured ?? 0,
      payoutState: (alloc?.payoutState ?? "NotEligible") as PayoutState,
      paymentOrderId: b.paymentOrder?.id ?? null,
    };
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

  /**
   * Idempotently ensure the demo clinic (with an owner User + Membership) and the
   * demo professional (with its User) exist, so Shift.workspaceId and
   * Offer.professionalId reference real rows.
   */
  private async ensureIdentity(): Promise<{ workspaceId: string; professionalId: string }> {
    await prisma.clinicWorkspace.upsert({
      where: { id: DEMO.workspaceId },
      update: {},
      create: {
        id: DEMO.workspaceId,
        branchName: "Demo Clinic — Sukhumvit",
        licenceNo: "TH-DEMO-001",
        address: "Bangkok",
        verification: "Verified",
      },
    });
    await prisma.user.upsert({
      where: { id: DEMO.ownerUserId },
      update: {},
      create: { id: DEMO.ownerUserId, phone: DEMO.ownerPhone },
    });
    await prisma.membership.upsert({
      where: { userId_workspaceId: { userId: DEMO.ownerUserId, workspaceId: DEMO.workspaceId } },
      update: {},
      create: { userId: DEMO.ownerUserId, workspaceId: DEMO.workspaceId, role: "clinic_owner" },
    });
    await prisma.user.upsert({
      where: { id: DEMO.proUserId },
      update: {},
      create: { id: DEMO.proUserId, phone: DEMO.proPhone },
    });
    await prisma.professionalProfile.upsert({
      where: { id: DEMO.professionalId },
      update: {},
      create: {
        id: DEMO.professionalId,
        userId: DEMO.proUserId,
        displayName: "Dr. Demo",
        profession: "physician",
        verification: "Verified",
      },
    });
    return { workspaceId: DEMO.workspaceId, professionalId: DEMO.professionalId };
  }

  private toRecord(o: OfferWithShift): OfferRecord {
    return {
      id: o.id,
      shiftId: o.shift.id,
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

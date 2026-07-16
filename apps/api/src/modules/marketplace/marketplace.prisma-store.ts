import { prisma } from "@probook/db";
import type { OfferState, ShiftUrgency } from "@probook/domain";
import type {
  MarketplaceRepository,
  OfferRecord,
  BookingRecord,
  CreateOfferInput,
  CreateBookingInput,
} from "./marketplace.types.js";

const DEMO_WORKSPACE_ID = "demo-clinic";
const SHIFT_LENGTH_MS = 4 * 60 * 60 * 1000;

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
 * Postgres-backed implementation via @probook/db (Prisma). Persists the flow against
 * the real schema: a Shift (under an ensured demo ClinicWorkspace), an Offer, and a
 * Booking. The Booking's unique constraints on shiftId/offerId enforce §6.4
 * (one position -> at most one confirmed booking) at the database level.
 *
 * professionalId is stored as an opaque string for now (Phase 0); it becomes a real
 * ProfessionalProfile reference when the identity module lands.
 */
export class PrismaMarketplaceStore implements MarketplaceRepository {
  async createOffer(input: CreateOfferInput): Promise<OfferRecord> {
    await this.ensureWorkspace();
    const shift = await prisma.shift.create({
      data: {
        workspaceId: DEMO_WORKSPACE_ID,
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
        professionalId: input.professionalId,
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

  async createBooking(input: CreateBookingInput): Promise<BookingRecord> {
    const booking = await prisma.booking.create({
      data: {
        offerId: input.offerId,
        shiftId: input.shiftId,
        professionalId: input.professionalId,
        state: "Confirmed",
        termsSnapshot: {},
        feeSnapshot: input.feeSnapshot,
        taxSnapshot: 0,
      },
    });
    return {
      id: booking.id,
      offerId: booking.offerId,
      shiftId: booking.shiftId,
      professionalId: booking.professionalId,
      state: "Confirmed",
    };
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

  /** Idempotently ensure a demo clinic branch exists to satisfy Shift.workspaceId. */
  private async ensureWorkspace(): Promise<void> {
    await prisma.clinicWorkspace.upsert({
      where: { id: DEMO_WORKSPACE_ID },
      update: {},
      create: {
        id: DEMO_WORKSPACE_ID,
        branchName: "Demo Clinic — Sukhumvit",
        licenceNo: "TH-DEMO-001",
        address: "Bangkok",
        verification: "Verified",
      },
    });
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

import type { OfferState, BookingState, ShiftUrgency } from "@probook/domain";

/** The offer view the flow works with (joins Shift fields for compensation/urgency/start). */
export interface OfferRecord {
  id: string;
  shiftId: string;
  professionalId: string;
  compensation: number; // integer satang
  urgency: ShiftUrgency;
  state: OfferState;
  sentAt: number; // epoch ms UTC
  shiftStart: number; // epoch ms UTC
  expiresAt: number; // epoch ms UTC
  fundingDueAt: number | null;
}

export interface BookingRecord {
  id: string;
  offerId: string;
  shiftId: string;
  professionalId: string;
  state: BookingState;
}

export interface CreateOfferInput {
  shiftLabel: string; // client-facing shift identifier / category
  professionalId: string;
  compensation: number; // integer satang
  urgency: ShiftUrgency;
  sentAt: number;
  shiftStart: number;
  expiresAt: number;
}

export interface CreateBookingInput {
  offerId: string;
  shiftId: string;
  professionalId: string;
  feeSnapshot: number; // integer satang
}

/**
 * Persistence port for the booking flow. Two implementations exist:
 *  - InMemoryMarketplaceStore  (no DATABASE_URL — zero-service dev/e2e)
 *  - PrismaMarketplaceStore    (DATABASE_URL set — real Postgres via @probook/db)
 * The controller depends only on this interface.
 */
export interface MarketplaceRepository {
  createOffer(input: CreateOfferInput): Promise<OfferRecord>;
  getOffer(id: string): Promise<OfferRecord | null>;
  /** Transition an offer's state (and optionally set fundingDueAt). Returns the updated record. */
  setOfferState(id: string, state: OfferState, fundingDueAt?: number): Promise<OfferRecord | null>;
  createBooking(input: CreateBookingInput): Promise<BookingRecord>;
  getBookingByOffer(offerId: string): Promise<BookingRecord | null>;
}

/** DI token for the repository. */
export const MARKETPLACE_REPOSITORY = Symbol("MARKETPLACE_REPOSITORY");

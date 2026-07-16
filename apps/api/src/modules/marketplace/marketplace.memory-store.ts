import { randomUUID } from "node:crypto";
import type {
  MarketplaceRepository,
  OfferRecord,
  BookingRecord,
  CreateOfferInput,
  CreateBookingInput,
} from "./marketplace.types.js";
import type { OfferState } from "@probook/domain";

/**
 * Zero-dependency in-memory implementation. Used when DATABASE_URL is unset so the
 * flow (and the e2e) run without Postgres. State is lost on restart — dev only.
 */
export class InMemoryMarketplaceStore implements MarketplaceRepository {
  private readonly offers = new Map<string, OfferRecord>();
  private readonly bookings = new Map<string, BookingRecord>();
  private readonly bookingByOffer = new Map<string, string>();

  async createOffer(input: CreateOfferInput): Promise<OfferRecord> {
    const record: OfferRecord = {
      id: randomUUID(),
      shiftId: randomUUID(),
      professionalId: input.professionalId,
      compensation: input.compensation,
      urgency: input.urgency,
      state: "PendingResponse",
      sentAt: input.sentAt,
      shiftStart: input.shiftStart,
      expiresAt: input.expiresAt,
      fundingDueAt: null,
    };
    this.offers.set(record.id, record);
    return record;
  }

  async getOffer(id: string): Promise<OfferRecord | null> {
    return this.offers.get(id) ?? null;
  }

  async setOfferState(id: string, state: OfferState, fundingDueAt?: number): Promise<OfferRecord | null> {
    const offer = this.offers.get(id);
    if (!offer) return null;
    offer.state = state;
    if (fundingDueAt !== undefined) offer.fundingDueAt = fundingDueAt;
    return offer;
  }

  async createBooking(input: CreateBookingInput): Promise<BookingRecord> {
    const booking: BookingRecord = {
      id: randomUUID(),
      offerId: input.offerId,
      shiftId: input.shiftId,
      professionalId: input.professionalId,
      state: "Confirmed",
    };
    this.bookings.set(booking.id, booking);
    this.bookingByOffer.set(input.offerId, booking.id);
    return booking;
  }

  async getBookingByOffer(offerId: string): Promise<BookingRecord | null> {
    const id = this.bookingByOffer.get(offerId);
    return id ? (this.bookings.get(id) ?? null) : null;
  }
}

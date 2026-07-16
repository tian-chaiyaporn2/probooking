import { Injectable } from "@nestjs/common";
import type { OfferState, BookingState, ShiftUrgency } from "@probook/domain";

/**
 * In-memory marketplace store for the Phase 0 vertical slice. This stands in for
 * the Prisma-backed repositories (packages/db) so the flow runs end to end without
 * a database. Swap for @probook/db repositories when persistence is wired; the
 * controller depends only on these method shapes.
 */
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

@Injectable()
export class MarketplaceStore {
  private readonly offers = new Map<string, OfferRecord>();
  private readonly bookings = new Map<string, BookingRecord>();
  private readonly bookingByOffer = new Map<string, string>();

  putOffer(offer: OfferRecord): void {
    this.offers.set(offer.id, offer);
  }

  getOffer(id: string): OfferRecord | undefined {
    return this.offers.get(id);
  }

  /** One position -> at most one confirmed booking (§6.4): keyed by offer. */
  putBooking(booking: BookingRecord): void {
    this.bookings.set(booking.id, booking);
    this.bookingByOffer.set(booking.offerId, booking.id);
  }

  getBookingByOffer(offerId: string): BookingRecord | undefined {
    const id = this.bookingByOffer.get(offerId);
    return id ? this.bookings.get(id) : undefined;
  }
}

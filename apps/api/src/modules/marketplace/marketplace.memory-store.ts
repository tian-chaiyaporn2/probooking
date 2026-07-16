import { randomUUID } from "node:crypto";
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
import type { OfferState } from "@probook/domain";

/**
 * Zero-dependency in-memory implementation. Used when DATABASE_URL is unset so the
 * flow (and the e2e) run without Postgres. State is lost on restart — dev only.
 */
export class InMemoryMarketplaceStore implements MarketplaceRepository {
  private readonly offers = new Map<string, OfferRecord>();
  private readonly bookings = new Map<string, BookingDetail>();
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

  async confirmBooking(input: ConfirmBookingInput): Promise<ConfirmBookingResult> {
    const offer = this.offers.get(input.offerId);
    if (offer) offer.state = "Converted"; // atomic with the booking here by construction
    const detail: BookingDetail = {
      id: randomUUID(),
      offerId: input.offerId,
      shiftId: input.shiftId,
      professionalId: input.professionalId,
      state: "Confirmed",
      compensation: input.allocation.compensation,
      serviceFee: input.allocation.serviceFee,
      tax: input.allocation.tax,
      captured: input.captured,
      payoutState: "NotEligible",
      paymentOrderId: randomUUID(),
    };
    this.bookings.set(detail.id, detail);
    this.bookingByOffer.set(input.offerId, detail.id);
    return { booking: this.toRecord(detail), paymentOrderId: detail.paymentOrderId ?? randomUUID() };
  }

  async getBookingByOffer(offerId: string): Promise<BookingRecord | null> {
    const id = this.bookingByOffer.get(offerId);
    const detail = id ? this.bookings.get(id) : undefined;
    return detail ? this.toRecord(detail) : null;
  }

  async getBooking(id: string): Promise<BookingDetail | null> {
    return this.bookings.get(id) ?? null;
  }

  async markCompletion(id: string): Promise<BookingDetail | null> {
    const detail = this.bookings.get(id);
    if (!detail) return null;
    detail.state = "AwaitingCompletion";
    return detail;
  }

  async recordPayout(input: PayoutInput): Promise<PayoutResult> {
    const detail = this.bookings.get(input.bookingId);
    if (!detail) throw new Error("booking not found");
    detail.state = "ServiceCompleted";
    detail.payoutState = "Paid";
    return {
      bookingState: "ServiceCompleted",
      payoutState: "Paid",
      payoutAmount: input.payoutAmount,
    };
  }

  private toRecord(d: BookingDetail): BookingRecord {
    return {
      id: d.id,
      offerId: d.offerId,
      shiftId: d.shiftId,
      professionalId: d.professionalId,
      state: d.state,
    };
  }
}

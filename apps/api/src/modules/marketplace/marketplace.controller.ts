import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  advanceOffer,
  satang,
  type ConfirmationContext,
  type Role,
  type ShiftUrgency,
} from "@probook/domain";
import { OffersService } from "../offers/offers.service.js";
import { BookingsService } from "../bookings/bookings.service.js";
import { PaymentsService } from "../payments/payments.service.js";
import { MarketplaceStore } from "./marketplace.store.js";

const HOUR_MS = 60 * 60 * 1000;

interface CreateOfferDto {
  shiftId: string;
  professionalId: string;
  compensation: number; // integer satang
  urgency?: ShiftUrgency;
  actorRole?: Role;
  shiftStartInHours?: number;
}

/**
 * The Phase 0 booking flow as controlled API endpoints (OFF-01..04, §6.3, PAY-02):
 *   POST /offers            create a binding offer   (authority gate, OFF-01)
 *   POST /offers/:id/accept professional accepts     (soft hold, OFF-04)
 *   POST /offers/:id/confirm confirm the booking      (eligibility §6.3 + atomic)
 *   GET  /offers/:id         current offer + booking status
 *
 * All state transitions run through @probook/domain so the rules are enforced in
 * one place. Persistence is the in-memory MarketplaceStore for now.
 */
@Controller()
export class MarketplaceController {
  constructor(
    private readonly offers: OffersService,
    private readonly bookings: BookingsService,
    private readonly payments: PaymentsService,
    private readonly store: MarketplaceStore,
  ) {}

  @Post("offers")
  createOffer(@Body() dto: CreateOfferDto) {
    const role: Role = dto.actorRole ?? "clinic_owner";
    // OFF-01: only a clinic owner/admin may send a binding offer.
    try {
      this.offers.assertCanSendOffer(role);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const now = Date.now();
    const shiftStart = now + (dto.shiftStartInHours ?? 48) * HOUR_MS;
    const urgency: ShiftUrgency = dto.urgency ?? "standard";
    const expiresAt = this.offers.computeExpiry(now, shiftStart, urgency);
    const id = randomUUID();

    this.store.putOffer({
      id,
      shiftId: dto.shiftId,
      professionalId: dto.professionalId,
      compensation: dto.compensation,
      urgency,
      state: "PendingResponse",
      sentAt: now,
      shiftStart,
      expiresAt,
      fundingDueAt: null,
    });

    return {
      id,
      state: "PendingResponse" as const,
      expiresAt,
      checkout: this.payments.checkout(satang(dto.compensation)),
    };
  }

  @Post("offers/:id/accept")
  accept(@Param("id") id: string) {
    const offer = this.requireOffer(id);
    // OFF-04: acceptance -> AwaitingPayment (soft hold), never straight to a booking.
    try {
      offer.state = advanceOffer(offer.state, "AwaitingPayment");
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const { fundingDueAt } = this.offers.accept(Date.now());
    offer.fundingDueAt = fundingDueAt;
    this.store.putOffer(offer);
    return { id: offer.id, state: offer.state, fundingDueAt };
  }

  @Post("offers/:id/confirm")
  confirm(@Param("id") id: string, @Body() body: { prefundingSucceeded?: boolean }) {
    const offer = this.requireOffer(id);

    // Atomic + idempotent: one shift -> one booking (§6.4). If already booked, return it.
    const existing = this.store.getBookingByOffer(id);
    if (existing) {
      return { booking: existing, checkout: this.payments.checkout(satang(offer.compensation)) };
    }

    const ctx: ConfirmationContext = {
      clinicActiveVerified: true,
      professionalActiveVerified: true,
      licenceValidThroughShiftEnd: true,
      specialtyValidThroughShiftEnd: true,
      insuranceRequired: false,
      insuranceValidThroughShiftEnd: true,
      clinicServiceSupported: true,
      shiftCategorySupported: true,
      hasSuspension: false,
      hasBlockingHold: false,
      hasScheduleOverlap: false,
      offerExpired: Date.now() > offer.expiresAt, // §6.3: late payment after expiry never books
      durablePrefundingSucceeded: body?.prefundingSucceeded ?? true,
    };

    try {
      this.bookings.assertEligible(ctx); // §6.3 gate — throws NOT_ELIGIBLE with reasons
      // Offer AwaitingPayment -> Converted. Throws if the offer was never accepted.
      offer.state = advanceOffer(offer.state, "Converted");
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const booking = {
      id: randomUUID(),
      offerId: offer.id,
      shiftId: offer.shiftId,
      professionalId: offer.professionalId,
      state: "Confirmed" as const,
    };
    this.store.putBooking(booking);
    this.store.putOffer(offer);

    return { booking, checkout: this.payments.checkout(satang(offer.compensation)) };
  }

  @Get("offers/:id")
  getOffer(@Param("id") id: string) {
    const offer = this.requireOffer(id);
    return { offer, booking: this.store.getBookingByOffer(id) ?? null };
  }

  private requireOffer(id: string) {
    const offer = this.store.getOffer(id);
    if (!offer) throw new NotFoundException("offer not found");
    return offer;
  }
}

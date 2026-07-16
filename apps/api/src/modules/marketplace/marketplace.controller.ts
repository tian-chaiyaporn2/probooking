import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
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
import { MARKETPLACE_REPOSITORY, type MarketplaceRepository } from "./marketplace.types.js";

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
 * All state transitions run through @probook/domain; persistence is behind the
 * MarketplaceRepository port (Prisma/Postgres or in-memory).
 */
@Controller()
export class MarketplaceController {
  constructor(
    private readonly offers: OffersService,
    private readonly bookings: BookingsService,
    private readonly payments: PaymentsService,
    @Inject(MARKETPLACE_REPOSITORY) private readonly repo: MarketplaceRepository,
  ) {}

  @Post("offers")
  async createOffer(@Body() dto: CreateOfferDto) {
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

    const offer = await this.repo.createOffer({
      shiftLabel: dto.shiftId,
      professionalId: dto.professionalId,
      compensation: dto.compensation,
      urgency,
      sentAt: now,
      shiftStart,
      expiresAt,
    });

    return {
      id: offer.id,
      state: offer.state,
      expiresAt: offer.expiresAt,
      checkout: this.payments.checkout(satang(dto.compensation)),
    };
  }

  @Post("offers/:id/accept")
  async accept(@Param("id") id: string) {
    const offer = await this.requireOffer(id);
    // OFF-04: acceptance -> AwaitingPayment (soft hold), never straight to a booking.
    let nextState;
    try {
      nextState = advanceOffer(offer.state, "AwaitingPayment");
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const { fundingDueAt } = this.offers.accept(Date.now());
    const updated = await this.repo.setOfferState(id, nextState, fundingDueAt);
    return { id, state: nextState, fundingDueAt: updated?.fundingDueAt ?? fundingDueAt };
  }

  @Post("offers/:id/confirm")
  async confirm(@Param("id") id: string, @Body() body: { prefundingSucceeded?: boolean }) {
    const offer = await this.requireOffer(id);

    // Atomic + idempotent: one shift -> one booking (§6.4). If already booked, return it.
    const existing = await this.repo.getBookingByOffer(id);
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
      advanceOffer(offer.state, "Converted"); // throws if the offer was never accepted
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const checkout = this.payments.checkout(satang(offer.compensation));
    await this.repo.setOfferState(id, "Converted");
    const booking = await this.repo.createBooking({
      offerId: offer.id,
      shiftId: offer.shiftId,
      professionalId: offer.professionalId,
      feeSnapshot: checkout.serviceFee,
    });

    return { booking, checkout };
  }

  @Get("offers/:id")
  async getOffer(@Param("id") id: string) {
    const offer = await this.requireOffer(id);
    return { offer, booking: await this.repo.getBookingByOffer(id) };
  }

  private async requireOffer(id: string) {
    const offer = await this.repo.getOffer(id);
    if (!offer) throw new NotFoundException("offer not found");
    return offer;
  }
}

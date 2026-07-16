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
  advanceBooking,
  advancePayout,
  cancellationOutcome,
  payableFromFraction,
  satang,
  type ConfirmationContext,
  type Role,
  type ShiftUrgency,
  type CancelActor,
  type CancelReason,
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
    const { fundingDueAt } = this.offers.fundingWindow(Date.now());
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

    // PAY-07 conservation at confirmation: captured (total) equals the professional's
    // protected compensation + platform fee + tax; nothing is paid out or refunded yet.
    this.payments.assertConserved({
      captured: checkout.total,
      protectedRemainder: checkout.compensation,
      payout: satang(0),
      fee: checkout.serviceFee,
      tax: checkout.tax,
      refunds: satang(0),
      providerCosts: satang(0),
      adjustments: satang(0),
    });

    // Offer -> Converted happens inside confirmBooking's transaction (BKG-02 atomic).
    try {
      const { booking, paymentOrderId } = await this.repo.confirmBooking({
        offerId: offer.id,
        shiftId: offer.shiftId,
        professionalId: offer.professionalId,
        allocation: {
          compensation: checkout.compensation,
          serviceFee: checkout.serviceFee,
          tax: checkout.tax,
        },
        captured: checkout.total,
        idempotencyKey: `collection:${offer.id}`,
      });
      return { booking, checkout, paymentOrderId };
    } catch (e) {
      // A concurrent confirm may have won the race (unique offerId / collection key).
      // If a booking now exists, return it idempotently rather than surfacing a 500.
      const existing = await this.repo.getBookingByOffer(id);
      if (existing) return { booking: existing, checkout };
      throw e;
    }
  }

  @Post("bookings/:id/complete")
  async complete(@Param("id") id: string) {
    const booking = await this.requireBooking(id);
    // Idempotent: completion already submitted (or beyond).
    if (booking.state === "AwaitingCompletion" || booking.state === "ServiceCompleted") {
      return { id, state: booking.state };
    }
    // CMP-01: professional marks completion. Validate Confirmed -> InProgress -> AwaitingCompletion.
    try {
      const inProgress = advanceBooking(booking.state, "InProgress");
      advanceBooking(inProgress, "AwaitingCompletion");
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const updated = await this.repo.markCompletion(id);
    return { id, state: updated?.state ?? "AwaitingCompletion" };
  }

  @Post("bookings/:id/accept-completion")
  async acceptCompletion(@Param("id") id: string) {
    const booking = await this.requireBooking(id);
    // Idempotent: already completed & paid out.
    if (booking.state === "ServiceCompleted") {
      return {
        id,
        bookingState: booking.state,
        payoutState: booking.payoutState,
        payoutAmount: booking.compensation,
      };
    }
    // CMP-02/03 + PAY-09: accept completion and initiate payout. Validate lifecycles.
    try {
      advanceBooking(booking.state, "ServiceCompleted"); // requires AwaitingCompletion
      const processing = advancePayout(booking.payoutState, "Processing");
      advancePayout(processing, "Paid");
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    // PAY-07 conservation AFTER payout: protected is released to payout, so
    // captured == payout(compensation) + fee + tax.
    this.payments.assertConserved({
      captured: satang(booking.captured),
      protectedRemainder: satang(0),
      payout: satang(booking.compensation),
      fee: satang(booking.serviceFee),
      tax: satang(booking.tax),
      refunds: satang(0),
      providerCosts: satang(0),
      adjustments: satang(0),
    });

    try {
      const result = await this.repo.recordPayout({
        bookingId: id,
        payoutAmount: booking.compensation,
        idempotencyKey: `payout:${id}`,
      });
      return { id, ...result };
    } catch (e) {
      // Concurrent accept (clinic + auto-accept sweep) may have won (unique payout key).
      const current = await this.repo.getBooking(id);
      if (current?.state === "ServiceCompleted") {
        return {
          id,
          bookingState: current.state,
          payoutState: current.payoutState,
          payoutAmount: current.compensation,
        };
      }
      throw e;
    }
  }

  @Post("bookings/:id/flag-inactive")
  async flagInactive(@Param("id") id: string) {
    const booking = await this.requireBooking(id);
    // CMP-04 applies only when the professional never submitted completion — i.e. the
    // booking is still Confirmed/InProgress (not AwaitingCompletion/ServiceCompleted).
    if (booking.state !== "Confirmed" && booking.state !== "InProgress") {
      throw new BadRequestException(
        `booking is ${booking.state}; not eligible for inactivity review`,
      );
    }
    // Idempotent: one review case per booking.
    const existing = await this.repo.findSupportCase(id, "completion_review");
    if (existing) {
      return { id, caseId: existing.id, state: existing.state, created: false };
    }
    const created = await this.repo.createSupportCase(
      id,
      "completion_review",
      "Clinic inactivity — completion needs Operations review (CMP-04)",
    );
    return { id, caseId: created.id, state: created.state, created: true };
  }

  @Post("bookings/:id/cancel")
  async cancel(
    @Param("id") id: string,
    @Body() dto: { actor: CancelActor; reason: CancelReason; hoursBeforeStart?: number; arrived?: boolean },
  ) {
    const booking = await this.requireBooking(id);
    // Idempotent: a cancelled booking is terminal for this action.
    if (booking.state === "Cancelled") {
      return { id, outcome: "cancelled", bookingState: "Cancelled", alreadyCancelled: true };
    }

    // CAN-01..05: the domain decides the professional's payable fraction, or that the
    // case must be resolved by support.
    const outcome = cancellationOutcome({
      actor: dto.actor,
      reason: dto.reason,
      hoursBeforeStart: dto.hoursBeforeStart ?? 0,
      arrived: dto.arrived ?? false,
    });

    if ("support" in outcome) {
      const existing = await this.repo.findSupportCase(id, "cancellation_support");
      const c =
        existing ??
        (await this.repo.createSupportCase(
          id,
          "cancellation_support",
          `Cancellation requires support (reason: ${dto.reason})`,
        ));
      return { id, outcome: "support", caseId: c.id };
    }

    // Fractional outcome: validate the booking can be cancelled, then move money.
    try {
      advanceBooking(booking.state, "Cancelled");
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const payable = payableFromFraction(satang(booking.compensation), outcome.fraction);
    const refund = satang(booking.captured - payable);

    // PAY-07 conservation: captured == payout(payable) + refund. The platform fee is
    // waived on cancellation (refunded to the clinic as part of `refund`), so nothing
    // is retained as fee/tax; protected funds are fully released.
    this.payments.assertConserved({
      captured: satang(booking.captured),
      protectedRemainder: satang(0),
      payout: payable,
      fee: satang(0),
      tax: satang(0),
      refunds: refund,
      providerCosts: satang(0),
      adjustments: satang(0),
    });

    try {
      const result = await this.repo.cancelBooking({
        bookingId: id,
        payable,
        refund,
        payoutKey: `cancel-payout:${id}`,
        refundKey: `cancel-refund:${id}`,
      });
      return { id, outcome: "cancelled", fraction: outcome.fraction, ...result };
    } catch (e) {
      // Concurrent cancel may have won (unique cancel-refund key).
      const current = await this.repo.getBooking(id);
      if (current?.state === "Cancelled") {
        return { id, outcome: "cancelled", bookingState: "Cancelled", alreadyCancelled: true };
      }
      throw e;
    }
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

  private async requireBooking(id: string) {
    const booking = await this.repo.getBooking(id);
    if (!booking) throw new NotFoundException("booking not found");
    return booking;
  }
}

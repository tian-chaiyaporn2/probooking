import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  AuthGuard,
  Roles,
  CurrentUser,
  Public,
} from "../../auth/auth.guard.js";
import type { TokenPayload } from "../../auth/token.util.js";
import { maskActor, containsProhibitedPatientData } from "../privacy.util.js";
import { isConflict } from "../errors.util.js";
import {
  advanceOffer,
  advanceBooking,
  advancePayout,
  cancellationOutcome,
  payableFromFraction,
  isUrgentEligible,
  isExpired,
  canLeaveReview,
  can,
  dualControlSatisfied,
  satang,
  completionReviewDueAt,
  type ConfirmationContext,
  type Capability,
  type Role,
  type ShiftUrgency,
  type CancelActor,
  type CancelReason,
} from "@probook/domain";
import { OffersService } from "../../offers/offers.service.js";
import { BookingsService } from "../../bookings/bookings.service.js";
import { PaymentsService } from "../../payments/payments.service.js";
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from "../../payments/payment.provider.js";
import { NotificationsService } from "../notifications.service.js";
import { MarketplaceAccessService } from "../marketplace-access.service.js";
import {
  MARKETPLACE_REPOSITORY,
  type MarketplaceRepository,
  type ShiftFilters,
  type ProfessionalFilters,
  type CallerIdentity,
} from "../marketplace.types.js";
import { normalizePhone } from "@probook/db";
import { HOUR_MS, csvCell, type PostShiftDto } from "./shared.js";

/**
 * Offer lifecycle: accept, decline, and confirm into a booking (OFF-03/04, §6.3).
 *
 * All state transitions run through @probook/domain; persistence is behind the
 * MarketplaceRepository port (Prisma/Postgres or in-memory).
 */
@Controller()
export class OffersController {
  constructor(
    private readonly offers: OffersService,
    private readonly bookings: BookingsService,
    private readonly payments: PaymentsService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    private readonly notifications: NotificationsService,
    private readonly access: MarketplaceAccessService,
    @Inject(MARKETPLACE_REPOSITORY)
    private readonly repo: MarketplaceRepository,
  ) {}

  @UseGuards(AuthGuard)
  @Post("offers/:id/accept")
  async accept(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const offer = await this.access.requireOffer(id);
    // Only the professional the offer was made to may accept it. There was no check at all:
    // any caller could accept on a stranger's behalf and bind them to a shift.
    await this.access.requireProfessional(user, offer.professionalId);
    const now = Date.now();
    // OFF-03: a past-expiresAt offer cannot be accepted into a funding window.
    if (isExpired(now, offer.expiresAt)) {
      throw new BadRequestException("offer has expired (OFF-03)");
    }
    // AVL-03: soft holds and confirmed bookings both block overlapping acceptance.
    const overlap = await this.repo.hasScheduleOverlap(
      offer.professionalId,
      offer.shiftStart,
      offer.shiftStart + 4 * HOUR_MS,
      { excludeOfferId: id },
    );
    if (overlap) {
      throw new BadRequestException("schedule overlap (AVL-03)");
    }
    // OFF-04: acceptance -> AwaitingPayment (soft hold), never straight to a booking.
    let nextState;
    try {
      nextState = advanceOffer(offer.state, "AwaitingPayment");
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const { fundingDueAt } = this.offers.fundingWindow(now, offer.shiftStart);
    // Conditional claim: concurrent expiry/withdrawal must not be overwritten.
    const updated = await this.repo.setOfferState(id, nextState, {
      fundingDueAt,
      from: "PendingResponse",
    });
    if (!updated) {
      throw new ConflictException("offer is no longer pending response");
    }
    // NOT-01: acceptance opens the funding window — tell the clinic payment is required.
    await this.notifications.sms(offer.clinicWorkspaceId, "payment_required", {
      type: "Offer",
      id,
    });
    return {
      id,
      state: nextState,
      fundingDueAt: updated.fundingDueAt ?? fundingDueAt,
    };
  }

  // A professional may decline a pending offer outright (OFF: PendingResponse -> Declined),
  // instead of letting it expire — so the clinic can offer someone else sooner. Only the
  // professional the offer was made to may decline it.
  @UseGuards(AuthGuard)
  @Post("offers/:id/decline")
  async decline(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const offer = await this.access.requireOffer(id);
    await this.access.requireProfessional(user, offer.professionalId);
    let nextState;
    try {
      nextState = advanceOffer(offer.state, "Declined");
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    // Conditional claim: a concurrent accept/expire/withdraw must not be overwritten.
    const updated = await this.repo.setOfferState(id, nextState, {
      from: "PendingResponse",
    });
    if (!updated) {
      throw new ConflictException("offer is no longer pending response");
    }
    await this.notifications.sms(offer.clinicWorkspaceId, "offer_declined", {
      type: "Offer",
      id,
    });
    return { id, state: nextState };
  }

  @UseGuards(AuthGuard)
  @Post("offers/:id/confirm")
  async confirm(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const offer = await this.access.requireOffer(id);
    // Confirming captures the clinic's money (§3 "clinic.pay"), so only an owner/admin of
    // the workspace that made the offer may do it.
    await this.access.requireClinicAuthority(
      user,
      offer.clinicWorkspaceId,
      "clinic.pay",
    );

    // Atomic + idempotent: one shift -> one booking (§6.4). If already booked, return it.
    const existing = await this.repo.getBookingByOffer(id);
    if (existing) {
      return {
        booking: existing,
        checkout: this.payments.checkout(satang(offer.compensation)),
      };
    }

    const checkout = this.payments.checkout(satang(offer.compensation));
    const now = Date.now();

    // §6.3 gates BEFORE capture — collecting funds then failing eligibility left money
    // stranded with no booking and no unwind.
    if (offer.state !== "AwaitingPayment") {
      throw new BadRequestException(
        `offer is ${offer.state}; must be AwaitingPayment to confirm`,
      );
    }
    // OFF-03: after accept, the funding window (not the original response timer) is the clock.
    const fundingDeadline = offer.fundingDueAt ?? offer.expiresAt;
    const offerExpired = isExpired(now, fundingDeadline);

    const eligibility = await this.repo.getOfferEligibility(id);
    const overlap = await this.repo.hasScheduleOverlap(
      offer.professionalId,
      offer.shiftStart,
      offer.shiftStart + 4 * HOUR_MS,
      { excludeOfferId: id },
    );

    const preCaptureCtx: ConfirmationContext = {
      clinicActiveVerified: eligibility?.clinicVerified ?? false,
      professionalActiveVerified: eligibility?.professionalVerified ?? false,
      // VER-04: read licence suspension/expiry at confirm time — a credential the
      // professional held at offer time may have been suspended by Operations since.
      licenceValidThroughShiftEnd:
        eligibility?.licenceValidThroughShiftEnd ?? false,
      specialtyValidThroughShiftEnd:
        eligibility?.specialtyValidThroughShiftEnd ?? true,
      insuranceRequired: eligibility?.insuranceRequired ?? false,
      // Fail closed: unknown insurance facts must not book an insurance-required shift.
      insuranceValidThroughShiftEnd:
        eligibility?.insuranceValidThroughShiftEnd ?? false,
      // No clinic service / shift-category catalog in Phase 0 — stay permissive until modelled.
      clinicServiceSupported: true,
      shiftCategorySupported: true,
      hasSuspension: !(eligibility?.professionalNotSuspended ?? false),
      // VER-06 holds attach to bookings; confirm creates the booking, so none exist yet.
      hasBlockingHold: false,
      hasScheduleOverlap: overlap,
      offerExpired,
      durablePrefundingSucceeded: true, // evaluated after capture
    };

    try {
      this.bookings.assertEligible({
        ...preCaptureCtx,
        durablePrefundingSucceeded: true,
      });
      advanceOffer(offer.state, "Converted"); // throws if the offer was never accepted
    } catch (e) {
      // A concurrent confirm may have already booked this offer — the overlap check
      // then trips on that very booking. Return it idempotently instead of a 400.
      const won = await this.repo.getBookingByOffer(id);
      if (won) return { booking: won, checkout };

      throw new BadRequestException((e as Error).message);
    }

    // BKG-01: capture only after eligibility (except prefunding itself) has passed.
    const capture = await this.paymentProvider.capture({
      orderRef: `collection:${offer.id}`,
      amount: checkout.total,
    });
    if (!capture.succeeded) {
      throw new BadRequestException("NOT_ELIGIBLE: prefunding_failed");
    }

    // PAY-07 conservation at confirmation.
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

    try {
      const { booking, paymentOrderId } = await this.repo.confirmBooking({
        offerId: offer.id,
        shiftId: offer.shiftId,
        clinicWorkspaceId: offer.clinicWorkspaceId,
        professionalId: offer.professionalId,
        allocation: {
          compensation: checkout.compensation,
          serviceFee: checkout.serviceFee,
          tax: checkout.tax,
        },
        captured: checkout.total,
        providerRef: capture.providerRef,
        idempotencyKey: `collection:${offer.id}`,
      });
      await this.access.audit(user, "confirm_booking", "booking", booking.id, {
        offerId: offer.id,
        captured: checkout.total,
        paymentOrderId,
      });
      await this.notifications.email(offer.professionalId, "confirmed", {
        type: "Booking",
        id: booking.id,
      });
      await this.notifications.email(offer.clinicWorkspaceId, "confirmed", {
        type: "Booking",
        id: booking.id,
      });
      await this.notifications.sms(offer.professionalId, "confirmed", {
        type: "Booking",
        id: booking.id,
      });
      return { booking, checkout, paymentOrderId };
    } catch (e) {
      const existingAfter = await this.repo.getBookingByOffer(id);
      if (existingAfter) return { booking: existingAfter, checkout };
      // Capture succeeded but booking did not — unwind so money is not stranded.
      await this.paymentProvider.refund({
        orderRef: `collection:${offer.id}`,
        amount: checkout.total,
      });
      throw e;
    }
  }

  @UseGuards(AuthGuard)
  @Get("offers/:id")
  async getOffer(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const offer = await this.access.requireOffer(id);
    // Offer terms are commercial — the professional, clinic of record, or staff only.

    if (!this.access.isOpsCrossTenant(user)) {
      const me = await this.access.identityOf(user);
      const isPro = me.professionalId === offer.professionalId;
      const isClinic = me.memberships.some(
        (m) => m.workspaceId === offer.clinicWorkspaceId,
      );
      if (!isPro && !isClinic) {
        throw new ForbiddenException("not a party to this offer");
      }
    }
    return { offer, booking: await this.repo.getBookingByOffer(id) };
  }
}

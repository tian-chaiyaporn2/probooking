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
import { validateBody } from "../validate.util.js";
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
 * Party self-service reads and reporting: booking history, receipts, profiles (REP-01..03).
 *
 * All state transitions run through @probook/domain; persistence is behind the
 * MarketplaceRepository port (Prisma/Postgres or in-memory).
 */
@Controller()
export class ReportingController {
  constructor(
    private readonly access: MarketplaceAccessService,
    @Inject(MARKETPLACE_REPOSITORY)
    private readonly repo: MarketplaceRepository,
  ) {}

  // ----- Reporting (REP-01): party booking + financial history and receipts -----
  // Party self-service: a professional sees their OWN bookings, a clinic member their own
  // workspace's, and staff see any. Ownership is derived from the caller's identity, so the
  // enumerable id in the path cannot be used to read another party's money history.
  @UseGuards(AuthGuard)
  @Get("professionals/:id/bookings")
  async professionalBookings(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    // REP-01: internal roles (ops/finance/admin) read for reconciliation; otherwise the
    // caller must BE the professional. Finance is a reader here but not a party actor.
    if (!this.access.isInternalReader(user))
      await this.access.requireProfessional(user, id);
    return { bookings: await this.repo.listPartyBookings("professional", id) };
  }

  @UseGuards(AuthGuard)
  @Get("clinics/:id/bookings")
  async clinicBookings(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    // REP-01: internal roles (ops/finance/admin) read for reconciliation; otherwise the
    // caller must be a member of this clinic. Finance is a reader here but not a party actor.
    if (!this.access.isInternalReader(user))
      await this.access.requireClinicMember(user, id);
    return { bookings: await this.repo.listPartyBookings("clinic", id) };
  }

  // ----- Party self-service reads for the clinic / professional dashboards -----

  /** Who the caller is (ids + names + verification) — the party UIs render from this. */
  @UseGuards(AuthGuard)
  @Get("me")
  async me(@CurrentUser() user?: TokenPayload) {
    if (!user?.sub) throw new UnauthorizedException("authentication required");
    return this.repo.describeMe(user.sub);
  }

  /** A clinic's own posted shifts, with the candidate/offer/booking rollup. */
  @UseGuards(AuthGuard)
  @Get("clinics/:id/shifts")
  async clinicShifts(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    await this.access.requireClinicMember(user, id);
    return { shifts: await this.repo.listClinicShifts(id) };
  }

  /** The offers made to a professional (so they can accept). */
  @UseGuards(AuthGuard)
  @Get("professionals/:id/offers")
  async professionalOffers(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    await this.access.requireProfessional(user, id);
    return { offers: await this.repo.listProfessionalOffers(id) };
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "finance", "administrator")
  @Get("bookings/:id/receipt")
  async receipt(@Param("id") id: string) {
    // REP-01: the booking's checkout breakdown + payout statement. A booking exists
    // only after confirmation, so the captured split is final (BKG-03 snapshots).
    const b = await this.access.requireBooking(id);
    // Use recorded Payout events — after a partial cancel, compensation snapshot is not
    // what was paid (e.g. 50% CAN-02).
    const paidOut = await this.repo.sumPaidOut(id);
    return {
      bookingId: b.id,
      shiftId: b.shiftId,
      state: b.state,
      checkout: {
        compensation: b.compensation,
        serviceFee: b.serviceFee,
        tax: b.tax,
        total: b.compensation + b.serviceFee + b.tax,
      },
      payout: {
        state: b.payoutState,
        amount: b.payoutState === "Paid" ? paidOut : 0,
      },
    };
  }

  @Public()
  @Get("professionals/:id/profile")
  async getProfile(@Param("id") id: string) {
    // VER-03: public marketplace profile split into self-declared vs verified facts.
    // No phone/payout PII is included — those stay behind authenticated contact endpoints.
    const profile = await this.repo.getProfessionalProfile(id);
    if (!profile) throw new NotFoundException("professional not found");
    return profile;
  }
}

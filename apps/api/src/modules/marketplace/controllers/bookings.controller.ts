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
 * Booking lifecycle after confirmation: arrival, completion, inactivity, and cancellation (CMP, CAN).
 *
 * All state transitions run through @probook/domain; persistence is behind the
 * MarketplaceRepository port (Prisma/Postgres or in-memory).
 */
@Controller()
export class BookingsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly access: MarketplaceAccessService,
    @Inject(MARKETPLACE_REPOSITORY)
    private readonly repo: MarketplaceRepository,
  ) {}

  @UseGuards(AuthGuard)
  @Post("bookings/:id/arrive")
  async recordArrival(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    const booking = await this.access.requireBooking(id);
    await this.access.requireProfessional(user, booking.professionalId);
    // CAN-03 evidence: arrival is what separates a 50% cancellation from a 100% one, so it
    // is recorded as its own event on an active booking rather than asserted at cancel time.
    if (booking.state !== "Confirmed" && booking.state !== "InProgress") {
      throw new BadRequestException(
        `booking is ${booking.state}; cannot record arrival`,
      );
    }
    await this.repo.recordArrival(id);
    return { id, arrived: true };
  }

  @UseGuards(AuthGuard)
  @Post("bookings/:id/complete")
  async complete(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const booking = await this.access.requireBooking(id);
    // CMP-01: the professional submits their own completion — it starts the payout clock.
    await this.access.requireProfessional(user, booking.professionalId);
    // Idempotent: completion already submitted (or beyond).
    if (
      booking.state === "AwaitingCompletion" ||
      booking.state === "ServiceCompleted"
    ) {
      return { id, state: booking.state };
    }
    // CMP-01: professional marks completion. Only an active booking (Confirmed or
    // InProgress) can be completed — not a Cancelled/Archived one.
    if (booking.state !== "Confirmed" && booking.state !== "InProgress") {
      throw new BadRequestException(
        `booking is ${booking.state}; cannot mark completion`,
      );
    }
    try {
      const updated = await this.repo.markCompletion(id);
      return { id, state: updated?.state ?? "AwaitingCompletion" };
    } catch (e) {
      // A concurrent complete may have already advanced it (illegal self-transition
      // throws in the domain). Return the current state idempotently, not a 500.
      const current = await this.repo.getBooking(id);
      if (
        current?.state === "AwaitingCompletion" ||
        current?.state === "ServiceCompleted"
      ) {
        return { id, state: current.state };
      }
      throw new BadRequestException((e as Error).message);
    }
  }

  /**
   * CMP-02/03: accept the professional's completion and release the payout.
   *
   * This moves real money, so it is authenticated. Callers: the clinic of record accepting
   * early, Operations resolving a case, or the worker's auto-accept sweep once the 24h
   * deadline passes. It was previously unauthenticated with no deadline check of its own —
   * the 24h window lived only in the worker's WHERE clause, so anyone who knew a booking id
   * could trigger the payout the moment completion was submitted.
   */
  @UseGuards(AuthGuard)
  @Post("bookings/:id/accept-completion")
  async acceptCompletion(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    const booking = await this.access.requireBooking(id);
    // Authority is NOT expressible with @Roles here: an ordinary party's token carries the
    // role "user" — being a clinic owner is a fact about their membership, not their token.
    // So the check is: the worker past the deadline, or staff, or an owner/admin of the
    // clinic on this booking.
    if (user?.role === "worker") {
      // Defence in depth: the worker may only act once the booking's own deadline has
      // passed. Keeping the time policy solely in the sweep's query means a bug — or a
      // replayed call — pays out early with nothing to stop it.
      const dueAt = await this.repo.getAutoAcceptDueAt(id);
      if (dueAt === null || Date.now() < dueAt) {
        throw new BadRequestException(
          "auto-accept deadline has not passed for this booking",
        );
      }
    } else {
      await this.access.requireClinicAuthority(
        user,
        booking.clinicWorkspaceId,
        "clinic.confirm_completion",
      );
    }
    // Idempotent: already completed & paid out.
    if (booking.state === "ServiceCompleted") {
      return {
        id,
        bookingState: booking.state,
        payoutState: booking.payoutState,
        payoutAmount: booking.compensation,
      };
    }
    // VER-06: a held booking cannot be completed/paid out until Operations resolves.
    if (booking.heldAt) {
      throw new BadRequestException(
        "booking is on hold; resolve the hold first (VER-06)",
      );
    }
    // CMP-02/03 + PAY-09: accept completion and initiate payout. Validate lifecycles.
    try {
      advanceBooking(booking.state, "ServiceCompleted"); // requires AwaitingCompletion
      const processing = advancePayout(booking.payoutState, "Processing");
      advancePayout(processing, "Paid");
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    // PAY-08: payout may not exceed remaining headroom after prior refunds/payouts.
    const [paidOut, refunded] = await Promise.all([
      this.repo.sumPaidOut(id),
      this.repo.sumRefunded(id),
    ]);
    const remaining = booking.captured - paidOut - refunded;
    this.payments.assertWithinAllocation(
      satang(booking.compensation),
      satang(remaining),
      "payout",
    );

    // PAY-07 conservation AFTER payout: protected is released to payout, so
    // captured == payout(compensation) + fee + tax + prior refunds.
    this.payments.assertConserved({
      captured: satang(booking.captured),
      protectedRemainder: satang(0),
      payout: satang(booking.compensation),
      fee: satang(booking.serviceFee),
      tax: satang(booking.tax),
      refunds: satang(refunded),
      providerCosts: satang(0),
      adjustments: satang(0),
    });

    try {
      const result = await this.repo.recordPayout({
        bookingId: id,
        payoutAmount: booking.compensation,
        idempotencyKey: `payout:${id}`,
      });
      await this.access.audit(user, "accept_completion_payout", "booking", id, {
        payoutAmount: booking.compensation,
        auto: user?.role === "worker",
      });
      // NOT-01: payout initiated — email the professional.
      await this.notifications.email(booking.professionalId, "payout", {
        type: "Booking",
        id,
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
      // A concurrent cancel won the claim instead: that is a real conflict, not a server
      // fault. Surfacing it as 409 keeps the auto-accept sweep's logs honest about which
      // bookings it actually paid.
      if (isConflict(e)) {
        throw new ConflictException(
          "booking changed concurrently; payout not applied",
        );
      }
      throw e;
    }
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator", "worker")
  @Post("bookings/:id/flag-inactive")
  async flagInactive(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    const booking = await this.access.requireBooking(id);
    // CMP-04 applies only when the professional never submitted completion — i.e. the
    // booking is still Confirmed/InProgress (not AwaitingCompletion/ServiceCompleted).
    if (booking.state !== "Confirmed" && booking.state !== "InProgress") {
      throw new BadRequestException(
        `booking is ${booking.state}; not eligible for inactivity review`,
      );
    }
    // Defence in depth for the worker role: the time policy must not live only in the
    // sweep query — a replayed worker token could otherwise flag any Confirmed booking early.
    if (user?.role === "worker") {
      const dueAt = completionReviewDueAt(booking.shiftEnd);
      if (Date.now() < dueAt) {
        throw new BadRequestException(
          "clinic inactivity review deadline has not passed",
        );
      }
    }
    // Idempotent: one review case per booking.
    const existing = await this.repo.findSupportCase(id, "completion_review");
    if (existing) {
      return { id, caseId: existing.id, state: existing.state, created: false };
    }
    try {
      const created = await this.repo.createSupportCase(
        id,
        "completion_review",
        "Clinic inactivity — completion needs Operations review (CMP-04)",
      );
      await this.access.audit(user, "flag_inactive", "booking", id, {
        caseId: created.id,
      });
      return { id, caseId: created.id, state: created.state, created: true };
    } catch (e) {
      if (isConflict(e)) {
        const raced = await this.repo.findSupportCase(id, "completion_review");
        if (raced)
          return { id, caseId: raced.id, state: raced.state, created: false };
        throw new ConflictException("support case already exists");
      }
      throw e;
    }
  }

  @UseGuards(AuthGuard)
  @Post("bookings/:id/cancel")
  async cancel(
    @Param("id") id: string,
    @Body() raw: { actor?: CancelActor; reason: CancelReason },
    @CurrentUser() user?: TokenPayload,
  ) {
    const dto = validateBody<typeof raw>(raw, {
      // `actor` is accepted only from staff, who cancel on a party's behalf. For the parties
      // themselves it is derived below — it decides who gets paid, so letting the canceller
      // name it allowed a clinic to cancel as "clinic ... after arrival" and pay a
      // professional 100% for a shift nobody worked, or as the professional to pay 0%.
      actor: {
        type: "string",
        enum: ["clinic", "professional"],
        optional: true,
      },
      reason: {
        type: "string",
        enum: [
          "ordinary",
          "clinic_unavailable_after_arrival",
          "force_majeure",
          "safety",
          "credential",
          "platform_or_provider_failure",
          "partial_work",
        ],
      },
    });
    const booking = await this.access.requireBooking(id);
    // Idempotent: a cancelled booking is terminal for this action.
    if (booking.state === "Cancelled") {
      return {
        id,
        outcome: "cancelled",
        bookingState: "Cancelled",
        alreadyCancelled: true,
      };
    }

    const party = await this.access.partyInBooking(user, booking);
    if (party === "clinic") {
      await this.access.requireClinicAuthority(
        user,
        booking.clinicWorkspaceId,
        "clinic.cancel_confirmed",
      );
    }
    const actor: CancelActor =
      party === "staff"
        ? (dto.actor ??
          (() => {
            throw new BadRequestException(
              "staff must state which party is cancelling",
            );
          })())
        : party;

    // CAN-01/02 turn on how long before the shift the cancellation lands, and CAN-03 on
    // whether the professional actually arrived. Both are facts the platform owns: they are
    // read from the scheduled shift and the recorded attendance trail, never from the body.
    // Taking them from the caller let a clinic cancel an hour out claiming 48 (paying 0%
    // instead of 50%), or claim an arrival that never happened (paying 100%).
    const hoursBeforeStart = (booking.shiftStart - Date.now()) / 3_600_000;
    const arrived = await this.repo.hasArrived(id);

    // CAN-01..05: the domain decides the professional's payable fraction, or that the
    // case must be resolved by support.
    const outcome = cancellationOutcome({
      actor,
      reason: dto.reason,
      hoursBeforeStart,
      arrived,
    });

    if ("support" in outcome) {
      const existing = await this.repo.findSupportCase(
        id,
        "cancellation_support",
      );
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

    const payable = payableFromFraction(
      satang(booking.compensation),
      outcome.fraction,
    );
    const refund = satang(booking.captured - payable);

    // PAY-08: neither leg may exceed the captured funds. Both are derived here, so this is
    // a guard against a bad compensation/captured pair reaching the ledger — not a formality.
    this.payments.assertWithinAllocation(
      payable,
      satang(booking.captured),
      "cancellation payout",
    );
    this.payments.assertWithinAllocation(
      refund,
      satang(booking.captured),
      "cancellation refund",
    );

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
      await this.access.audit(user, "cancel_booking", "booking", id, {
        actor,
        reason: dto.reason,
        fraction: outcome.fraction,
        payable,
        refund,
      });
      // NOT-01: cancellation — SMS both parties.
      await this.notifications.sms(booking.professionalId, "cancelled", {
        type: "Booking",
        id,
      });
      await this.notifications.sms(booking.clinicWorkspaceId, "cancelled", {
        type: "Booking",
        id,
      });
      return {
        id,
        outcome: "cancelled",
        fraction: outcome.fraction,
        ...result,
      };
    } catch (e) {
      // Concurrent cancel may have won (unique cancel-refund key).
      const current = await this.repo.getBooking(id);
      if (current?.state === "Cancelled") {
        return {
          id,
          outcome: "cancelled",
          bookingState: "Cancelled",
          alreadyCancelled: true,
        };
      }
      // A concurrent accept-completion paid out first: the booking is no longer cancellable
      // and no refund was written. 409, not 500 — nothing is broken, the race simply resolved
      // the other way.
      if (isConflict(e)) {
        throw new ConflictException(
          "booking changed concurrently; cancellation not applied",
        );
      }
      throw e;
    }
  }
}

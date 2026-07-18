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
import { parseBody } from "../http-validation.js";
import { z } from "zod";
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

const createReviewSchema = z.object({
  by: z.enum(["clinic", "professional"]).optional(),
  score: z.number().int().min(1).max(5),
  text: z.string().max(2000).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

/**
 * Post-completion reviews and professional ratings (REV-01..05).
 *
 * All state transitions run through @probook/domain; persistence is behind the
 * MarketplaceRepository port (Prisma/Postgres or in-memory).
 */
@Controller()
export class ReviewsController {
  constructor(
    private readonly access: MarketplaceAccessService,
    @Inject(MARKETPLACE_REPOSITORY)
    private readonly repo: MarketplaceRepository,
  ) {}

  @UseGuards(AuthGuard)
  @Post("bookings/:id/reviews")
  async createReview(
    @Param("id") id: string,
    @Body()
    rawBody: {
      by?: "clinic" | "professional";
      score: number;
      tags?: string[];
      text?: string;
    },
    @CurrentUser() user?: TokenPayload,
  ) {
    // `by` is derived from the caller below; only staff may state it. It used to be taken
    // at face value, so a third party could post a 1-star review attributed to the clinic —
    // and burn the real party's one review right via the unique constraint.
    const dto = parseBody(createReviewSchema, rawBody);
    const booking = await this.access.requireBooking(id);
    const party = await this.access.partyInBooking(user, booking);
    const by: "clinic" | "professional" =
      party === "staff"
        ? (dto.by ??
          (() => {
            throw new BadRequestException(
              "staff must state which party is reviewing",
            );
          })())
        : party;
    // Clinic reviews are an official reputation act — clinic_staff membership alone is
    // not enough (they cannot bind terms or move money either).
    if (by === "clinic" && party === "clinic") {
      await this.access.requireClinicAuthority(
        user,
        booking.clinicWorkspaceId,
        "clinic.confirm_completion",
      );
    }
    // REV-01/05: only a completed paid booking creates review rights (cancelled or
    // unfinished bookings never reach ServiceCompleted, so they earn no reputation).
    if (!canLeaveReview(booking.state)) {
      throw new BadRequestException(
        `booking is ${booking.state}; reviews require a completed booking`,
      );
    }
    // §7.3: patient data is prohibited in reviews.
    if (dto.text && containsProhibitedPatientData(dto.text)) {
      throw new BadRequestException(
        "review appears to contain patient/personal identifiers; remove them (§7.3)",
      );
    }
    // Author reviews the other party (clinic -> professional, or professional -> clinic).
    const authorId =
      by === "clinic" ? booking.clinicWorkspaceId : booking.professionalId;
    const subjectId =
      by === "clinic" ? booking.professionalId : booking.clinicWorkspaceId;
    try {
      const r = await this.repo.createReview({
        bookingId: id,
        authorId,
        subjectId,
        score: dto.score,
        tags: dto.tags ?? [],
        ...(dto.text !== undefined ? { text: dto.text } : {}),
      });
      return { id: r.id, published: r.published };
    } catch (e) {
      if (isConflict(e))
        throw new ConflictException(
          "this party has already reviewed this booking",
        );
      throw e;
    }
  }

  @Public()
  @Get("professionals/:id/rating")
  async getRating(@Param("id") id: string) {
    const rating = await this.repo.getSubjectRating(id);
    if (!rating) {
      return {
        subjectId: id,
        hasRating: false,
        note: "not enough published reviews (need 3)",
      };
    }
    return { subjectId: id, hasRating: true, ...rating };
  }
}

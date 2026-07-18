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
 * Shift posting, discovery, availability, applications, invitations, and offer creation (APP-01, OFF-01/02, AVL, SRC, URG-01).
 *
 * All state transitions run through @probook/domain; persistence is behind the
 * MarketplaceRepository port (Prisma/Postgres or in-memory).
 */
@Controller()
export class ShiftsController {
  constructor(
    private readonly offers: OffersService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly access: MarketplaceAccessService,
    @Inject(MARKETPLACE_REPOSITORY)
    private readonly repo: MarketplaceRepository,
  ) {}

  @UseGuards(AuthGuard)
  @Post("shifts")
  async postShift(
    @Body() raw: PostShiftDto,
    @CurrentUser() user?: TokenPayload,
  ) {
    const dto = validateBody<PostShiftDto>(raw, {
      clinicWorkspaceId: { type: "string", maxLen: 64 },
      compensation: { type: "number", int: true, positive: true },
      category: { type: "string", optional: true, maxLen: 64 },
      urgency: { type: "string", optional: true, enum: ["standard", "urgent"] },
      insuranceRequired: { type: "boolean", optional: true },
      shiftStartInHours: {
        type: "number",
        optional: true,
        min: 0,
        max: 24 * 365,
      },
    });
    // §3: authority comes from the caller's membership in THIS workspace, not from an
    // `actorRole` field in the body that defaulted to "clinic_owner" when omitted.
    await this.access.requireClinicAuthority(
      user,
      dto.clinicWorkspaceId,
      "clinic.publish_shift",
    );
    // Validate money up front: a non-positive/non-integer compensation would otherwise
    // surface as a 500 from satang() at offer/confirm time (satang is integer-only).
    if (!Number.isInteger(dto.compensation) || dto.compensation <= 0) {
      throw new BadRequestException(
        "compensation must be a positive integer (satang)",
      );
    }
    // AUTH-04: an unverified clinic cannot transact.
    const clinicV = await this.repo.clinicVerification(dto.clinicWorkspaceId);
    if (clinicV === null) throw new NotFoundException("clinic not found");
    if (clinicV !== "Verified") {
      throw new BadRequestException(
        `clinic is ${clinicV}; must be Verified to post a shift`,
      );
    }
    const now = Date.now();
    const shiftStart = now + (dto.shiftStartInHours ?? 48) * HOUR_MS;
    const urgency: ShiftUrgency = dto.urgency ?? "standard";
    if (urgency === "urgent" && !isUrgentEligible(shiftStart, now)) {
      throw new BadRequestException(
        "urgent requires the shift to start within 72h (URG-01)",
      );
    }
    const { shiftId } = await this.repo.postShift({
      clinicWorkspaceId: dto.clinicWorkspaceId,
      category: dto.category ?? "general",
      compensation: dto.compensation,
      urgency,
      shiftStart,
      insuranceRequired: dto.insuranceRequired ?? false,
    });
    return { shiftId, state: "Published", urgent: urgency === "urgent" };
  }

  @Public()
  @Get("shifts")
  async listShifts(
    @Query("category") category?: string,
    @Query("urgency") urgency?: string,
    @Query("minCompensation") minCompensation?: string,
    @Query("maxCompensation") maxCompensation?: string,
  ) {
    // SRC-02/03: filtered, priority-ordered open shifts (urgent first, then soonest).
    const filters: ShiftFilters = {};
    if (category) filters.category = category;
    if (urgency === "urgent" || urgency === "standard")
      filters.urgency = urgency;
    const min = minCompensation !== undefined ? Number(minCompensation) : NaN;
    const max = maxCompensation !== undefined ? Number(maxCompensation) : NaN;
    if (Number.isFinite(min)) filters.minCompensation = min;
    if (Number.isFinite(max)) filters.maxCompensation = max;
    const shifts = await this.repo.listOpenShifts(filters);
    // SRC-04: empty results offer posting / matching assistance.
    return shifts.length === 0
      ? {
          shifts,
          hint: "No open shifts match — post a shift or ask Operations for matching assistance.",
        }
      : { shifts };
  }

  // ----- Availability & professional search (AVL, SRC) -----
  @UseGuards(AuthGuard)
  @Post("professionals/:id/availability")
  async addAvailability(
    @Param("id") professionalId: string,
    @Body()
    raw: {
      startsInHours?: number;
      durationHours?: number;
      openToRequests?: boolean;
    },
    @CurrentUser() user?: TokenPayload,
  ) {
    await this.access.requireProfessional(user, professionalId);
    const dto = validateBody<{
      startsInHours?: number;
      durationHours?: number;
      openToRequests?: boolean;
    }>(raw ?? {}, {
      startsInHours: { type: "number", optional: true, min: 0, max: 24 * 365 },
      durationHours: {
        type: "number",
        optional: true,
        positive: true,
        max: 24 * 14,
      },
      openToRequests: { type: "boolean", optional: true },
    });
    // AVL-01: one-off Available blocks. Kept relative (hours from now) for convenience.
    const now = Date.now();
    const startsAt = now + (dto.startsInHours ?? 24) * HOUR_MS;
    const endsAt = startsAt + (dto.durationHours ?? 8) * HOUR_MS;
    return this.repo.addAvailability(
      professionalId,
      startsAt,
      endsAt,
      dto.openToRequests ?? false,
    );
  }

  @UseGuards(AuthGuard)
  @Get("professionals/:id/availability")
  async listAvailability(@Param("id") professionalId: string) {
    // AVL-02: authenticated browse only — schedule windows are not a public anonymous surface.
    return { availability: await this.repo.listAvailability(professionalId) };
  }

  @Public()
  @Get("professionals")
  async searchProfessionals(
    @Query("profession") profession?: string,
    @Query("specialty") specialty?: string,
  ) {
    // SRC-01: clinics filter professionals (profession/specialty here; rating included).
    const filters: ProfessionalFilters = {};
    if (profession) filters.profession = profession;
    if (specialty) filters.specialty = specialty;
    const professionals = await this.repo.searchProfessionals(filters);
    return { professionals };
  }

  @UseGuards(AuthGuard)
  @Post("shifts/:id/apply")
  async apply(
    @Param("id") shiftId: string,
    @Body() raw: { professionalId: string },
    @CurrentUser() user?: TokenPayload,
  ) {
    const dto = validateBody<typeof raw>(raw, {
      professionalId: { type: "string", maxLen: 64 },
    });
    // A professional applies as themselves. Enrolling someone else as a candidate was the
    // precondition that made the offer -> accept -> confirm chain reachable against a
    // professional who never applied.
    await this.access.requireProfessional(user, dto.professionalId);
    // APP-01: applications are non-binding and reserve neither party.
    await this.access.requireOpenShift(shiftId);
    try {
      const a = await this.repo.applyToShift(shiftId, dto.professionalId);
      return { id: a.id, state: "Submitted" };
    } catch (e) {
      if (isConflict(e))
        throw new ConflictException("already applied to this shift");
      throw e;
    }
  }

  @UseGuards(AuthGuard)
  @Post("shifts/:id/invite")
  async invite(
    @Param("id") shiftId: string,
    @Body() raw: { professionalId: string },
    @CurrentUser() user?: TokenPayload,
  ) {
    const dto = validateBody<typeof raw>(raw, {
      professionalId: { type: "string", maxLen: 64 },
    });
    // A professional can only be invited to a shift that is still open (consistency with apply/offer).
    const shift = await this.access.requireOpenShift(shiftId);
    // Inviting is non-binding (APP-01), so clinic_staff may do it — but only for their own
    // workspace's shift.
    await this.access.requireClinicAuthority(
      user,
      shift.clinicWorkspaceId,
      "clinic.search_invite",
    );
    try {
      const i = await this.repo.inviteToShift(shiftId, dto.professionalId);
      await this.notifications.sms(dto.professionalId, "invited", {
        type: "Shift",
        id: shiftId,
      });
      return { id: i.id, state: "Sent" };
    } catch (e) {
      if (isConflict(e))
        throw new ConflictException("already invited to this shift");
      throw e;
    }
  }

  @UseGuards(AuthGuard)
  @Get("shifts/:id/candidates")
  async candidates(
    @Param("id") shiftId: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    const shift = await this.repo.getShift(shiftId);
    if (!shift) throw new NotFoundException("shift not found");
    // Applicant lists are commercial PII — clinic of record or staff only.

    await this.access.requireClinicAuthority(
      user,
      shift.clinicWorkspaceId,
      "clinic.search_invite",
    );
    return { candidates: await this.repo.listShiftCandidates(shiftId) };
  }

  @UseGuards(AuthGuard)
  @Post("shifts/:id/offer")
  async offerToProfessional(
    @Param("id") shiftId: string,
    @Body() raw: { professionalId: string },
    @CurrentUser() user?: TokenPayload,
  ) {
    const dto = validateBody<{ professionalId: string }>(raw, {
      professionalId: { type: "string", maxLen: 64 },
    });
    const shift = await this.access.requireOpenShift(shiftId);
    // OFF-01: only a clinic owner/admin of THIS workspace may send a binding offer. The
    // role now comes from the caller's membership; it used to be `dto.actorRole` defaulting
    // to "clinic_owner", so the §3 prohibition on clinic_staff binding terms was decorative.
    await this.access.requireClinicAuthority(
      user,
      shift.clinicWorkspaceId,
      "clinic.send_offer",
    );
    // OFF-02: one active offer per shift.
    if (shift.hasActiveOffer) {
      throw new BadRequestException(
        "shift already has an active offer (OFF-02)",
      );
    }
    // The offer goes to a professional who applied or was invited.
    const candidates = await this.repo.listShiftCandidates(shiftId);
    if (!candidates.some((c) => c.professionalId === dto.professionalId)) {
      throw new BadRequestException(
        "professional must apply or be invited first",
      );
    }
    const now = Date.now();
    const expiresAt = this.offers.computeExpiry(
      now,
      shift.startsAt,
      shift.urgency,
    );
    let offer;
    try {
      offer = await this.repo.createOfferForShift({
        shiftId,
        professionalId: dto.professionalId,
        sentAt: now,
        expiresAt,
      });
    } catch (e) {
      if (isConflict(e))
        throw new ConflictException(
          "shift already has an active offer (OFF-02)",
        );
      throw e;
    }
    // NOT-01: notify the professional (SMS covers offers near expiry).
    await this.notifications.sms(dto.professionalId, "offer_sent", {
      type: "Offer",
      id: offer.id,
    });
    if (shift.urgency === "urgent") {
      await this.notifications.sms(dto.professionalId, "urgent_alert", {
        type: "Offer",
        id: offer.id,
      });
    }
    return {
      id: offer.id,
      state: offer.state,
      expiresAt: offer.expiresAt,
      checkout: this.payments.checkout(satang(shift.compensation)),
    };
  }
}

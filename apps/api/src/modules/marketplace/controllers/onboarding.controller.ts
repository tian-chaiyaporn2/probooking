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
 * Onboarding, verification, and credential lifecycle (ORG-01, PRO-01, VER-01..06).
 *
 * All state transitions run through @probook/domain; persistence is behind the
 * MarketplaceRepository port (Prisma/Postgres or in-memory).
 */
@Controller()
export class OnboardingController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly access: MarketplaceAccessService,
    @Inject(MARKETPLACE_REPOSITORY)
    private readonly repo: MarketplaceRepository,
  ) {}

  @Public()
  @Post("clinics")
  async registerClinic(
    @Body()
    raw: {
      branchName: string;
      licenceNo: string;
      address: string;
      ownerPhone: string;
    },
  ) {
    const dto = validateBody<typeof raw>(raw, {
      branchName: { type: "string", minLen: 1, maxLen: 200 },
      licenceNo: { type: "string", minLen: 1, maxLen: 100 },
      address: { type: "string", minLen: 1, maxLen: 500 },
      ownerPhone: { type: "string", minLen: 8, maxLen: 32 },
    });
    try {
      return await this.repo.registerClinic({
        ...dto,
        ownerPhone: normalizePhone(dto.ownerPhone),
      });
    } catch (e) {
      if (isConflict(e))
        throw new ConflictException(
          "a clinic with that owner phone already exists",
        );
      throw e; // real infra failure — surface as 500, don't mask as a business error
    }
  }

  @Public()
  @Post("professionals")
  async registerProfessional(
    @Body()
    raw: {
      displayName: string;
      profession: string;
      phone: string;
      payoutRef: string;
    },
  ) {
    const dto = validateBody<typeof raw>(raw, {
      displayName: { type: "string", minLen: 1, maxLen: 200 },
      profession: { type: "string", enum: ["physician", "dentist"] },
      phone: { type: "string", minLen: 8, maxLen: 32 },
      payoutRef: { type: "string", minLen: 1, maxLen: 100 },
    });
    try {
      return await this.repo.registerProfessional({
        ...dto,
        phone: normalizePhone(dto.phone),
      });
    } catch (e) {
      if (isConflict(e))
        throw new ConflictException(
          "a professional with that phone already exists",
        );
      throw e;
    }
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Post("ops/clinics/:id/verify")
  async verifyClinic(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    const r = await this.repo.verifyClinic(id);
    if (!r) throw new NotFoundException("clinic not found");
    await this.access.audit(user, "verify_clinic", "clinic", id);
    return r;
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Post("ops/professionals/:id/verify")
  async verifyProfessional(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    const r = await this.repo.verifyProfessional(id);
    if (!r) throw new NotFoundException("professional not found");
    await this.access.audit(user, "verify_professional", "professional", id);
    return r;
  }

  @UseGuards(AuthGuard)
  @Post("professionals/:id/insurance")
  async submitInsurance(
    @Param("id") professionalId: string,
    @Body() raw: { validUntilHours?: number },
    @CurrentUser() user?: TokenPayload,
  ) {
    // Only the professional themselves (or staff) may submit their insurance. Unguarded,
    // this let anyone downgrade a rival's Verified insurance to Submitted and block every
    // subsequent confirm on an insurance-required shift — a targeted denial of earnings.
    await this.access.requireProfessional(user, professionalId);
    const dto = validateBody<{ validUntilHours?: number }>(raw ?? {}, {
      validUntilHours: {
        type: "number",
        optional: true,
        positive: true,
        max: 24 * 365 * 10,
      },
    });
    // PRO-01: optional insurance evidence (VER-05). validUntil relative for convenience.
    const validUntil = Date.now() + (dto.validUntilHours ?? 24 * 365) * HOUR_MS;
    return this.repo.submitInsurance(professionalId, validUntil);
  }

  @UseGuards(AuthGuard)
  @Get("professionals/:id/insurance")
  async insuranceStatus(
    @Param("id") professionalId: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    // VER-05 status is party/staff-only — unauthenticated id guessing leaked insurance facts.
    await this.access.requireProfessional(user, professionalId);

    return this.repo.getInsuranceStatus(professionalId);
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Post("ops/professionals/:id/verify-insurance")
  async verifyInsurance(
    @Param("id") professionalId: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    const r = await this.repo.verifyInsurance(professionalId);
    if (!r) throw new NotFoundException("no insurance evidence submitted");
    await this.access.audit(
      user,
      "verify_insurance",
      "professional",
      professionalId,
    );
    return r;
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Post("ops/professionals/:id/suspend-credential")
  async suspendCredential(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    // VER-04: a licence lapses / is suspended by Operations.
    const ok = await this.repo.suspendCredential(id);
    if (!ok)
      throw new NotFoundException(
        "professional or licence credential not found",
      );
    await this.access.audit(user, "suspend_credential", "professional", id);
    return { professionalId: id, credential: "Suspended" };
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Post("bookings/:id/hold-credential")
  async holdCredential(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    const booking = await this.access.requireBooking(id);
    // VER-06 applies after confirmation and before completion is accepted.
    if (
      booking.state !== "Confirmed" &&
      booking.state !== "InProgress" &&
      booking.state !== "AwaitingCompletion"
    ) {
      throw new BadRequestException(
        `booking is ${booking.state}; not eligible for a credential hold`,
      );
    }
    if (booking.heldAt) return { id, held: true, created: false }; // idempotent
    await this.repo.holdBooking(id, "credential_or_insurance_invalid");
    await this.repo.createSupportCase(
      id,
      "credential_hold",
      "Credential/insurance failed after confirmation (VER-06)",
    );
    // NOT-01: a critical hold notifies both parties.
    await this.notifications.sms(booking.professionalId, "critical_hold", {
      type: "Booking",
      id,
    });
    await this.notifications.sms(booking.clinicWorkspaceId, "critical_hold", {
      type: "Booking",
      id,
    });
    await this.access.audit(user, "hold_credential", "booking", id);
    return { id, held: true, created: true };
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Post("bookings/:id/resolve-hold")
  async resolveHold(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    const booking = await this.access.requireBooking(id);
    if (!booking.heldAt) return { id, held: false };
    await this.repo.resolveHold(id);
    // The hold's support case is done once the hold is lifted — close it so it leaves the
    // operations queue rather than lingering Open forever.
    await this.repo.resolveSupportCase(id, "credential_hold");
    await this.access.audit(user, "resolve_hold", "booking", id);
    return { id, held: false };
  }
}

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
 * Booking messages and post-confirmation contact reveal (MSG-01/02).
 *
 * All state transitions run through @probook/domain; persistence is behind the
 * MarketplaceRepository port (Prisma/Postgres or in-memory).
 */
@Controller()
export class MessagingController {
  constructor(
    private readonly access: MarketplaceAccessService,
    @Inject(MARKETPLACE_REPOSITORY)
    private readonly repo: MarketplaceRepository,
  ) {}

  // ----- Booking messages (MSG-01/02) -----
  @UseGuards(AuthGuard)
  @Post("bookings/:id/messages")
  async postMessage(
    @Param("id") id: string,
    @Body() raw: { body: string },
    @CurrentUser() user?: TokenPayload,
  ) {
    const dto = validateBody<typeof raw>(raw, {
      body: { type: "string", maxLen: 2000 },
    });
    const booking = await this.access.requireBooking(id);
    // Only the two parties may post, and the sender is the caller — `senderId` used to come
    // from the body, so anyone could forge a message from either party into any booking.
    const party = await this.access.partyInBooking(user, booking);
    const senderId =
      party === "professional"
        ? booking.professionalId
        : party === "clinic"
          ? booking.clinicWorkspaceId
          : (user?.sub ?? "staff");
    // MSG-01: plain text only, no attachments.
    const body = dto.body.trim();
    if (!body) throw new BadRequestException("message body required");
    if (body.length > 2000) throw new BadRequestException("message too long");
    // §7.3: patient data is prohibited in messages — warn and reject on obvious IDs.
    if (containsProhibitedPatientData(body)) {
      throw new BadRequestException(
        "message appears to contain patient/personal identifiers; remove them (§7.3)",
      );
    }
    return this.repo.postMessage(id, senderId, body);
  }

  @UseGuards(AuthGuard)
  @Get("bookings/:id/messages")
  async listMessages(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    const booking = await this.access.requireBooking(id);
    await this.access.partyInBooking(user, booking); // participants (or staff) only
    return { messages: await this.repo.listMessages(id) };
  }

  @UseGuards(AuthGuard)
  @Get("bookings/:id/contact")
  async bookingContact(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    // MSG-02: contact details appear after confirmation (a booking exists = confirmed) — but
    // only to the two parties. This returned both sides' real phone numbers to anyone holding
    // a booking id, which is a PDPA exposure with no lawful basis.
    const booking = await this.access.requireBooking(id);
    await this.access.partyInBooking(user, booking);
    const contact = await this.repo.getBookingContact(id);
    return contact ?? { clinicPhone: null, professionalPhone: null };
  }
}

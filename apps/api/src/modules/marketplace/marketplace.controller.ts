import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, Roles, CurrentUser } from "../auth/auth.guard.js";
import type { TokenPayload } from "../auth/token.util.js";
import { maskActor, containsProhibitedPatientData } from "./privacy.util.js";
import { validateBody } from "./validate.util.js";
import { isConflict } from "./errors.util.js";
import {
  advanceOffer,
  advanceBooking,
  advancePayout,
  cancellationOutcome,
  payableFromFraction,
  isUrgentEligible,
  canLeaveReview,
  can,
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
import { NotificationsService } from "./notifications.service.js";
import {
  MARKETPLACE_REPOSITORY,
  type MarketplaceRepository,
  type ShiftFilters,
  type ProfessionalFilters,
} from "./marketplace.types.js";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Render a CSV cell: RFC-4180 quoting plus formula-injection defence — a cell that
 * begins with = + - @ (or a control char) is prefixed with a single quote so a
 * spreadsheet treats it as text, not an executable formula.
 */
const csvCell = (v: string | number): string => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

interface PostShiftDto {
  clinicWorkspaceId: string;
  compensation: number; // integer satang
  category?: string;
  urgency?: ShiftUrgency;
  insuranceRequired?: boolean;
  actorRole?: Role;
  shiftStartInHours?: number;
}

/**
 * Onboarding, verification, and the Phase 0 booking flow as controlled API endpoints:
 *   POST /clinics / /professionals        register (ORG-01, PRO-01) -> Submitted
 *   POST /ops/{clinics,professionals}/:id/verify   Operations verifies (VER-01/02)
 *   POST /offers            create a binding offer   (OFF-01, verified clinic only)
 *   POST /offers/:id/accept professional accepts     (soft hold, OFF-04)
 *   POST /offers/:id/confirm confirm the booking      (eligibility §6.3 + atomic)
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
    private readonly notifications: NotificationsService,
    @Inject(MARKETPLACE_REPOSITORY) private readonly repo: MarketplaceRepository,
  ) {}

  @Post("clinics")
  async registerClinic(
    @Body() raw: { branchName: string; licenceNo: string; address: string; ownerPhone: string },
  ) {
    const dto = validateBody<typeof raw>(raw, {
      branchName: { type: "string", maxLen: 200 },
      licenceNo: { type: "string", maxLen: 100 },
      address: { type: "string", maxLen: 500 },
      ownerPhone: { type: "string", maxLen: 32 },
    });
    try {
      return await this.repo.registerClinic(dto);
    } catch (e) {
      if (isConflict(e)) throw new ConflictException("a clinic with that owner phone already exists");
      throw e; // real infra failure — surface as 500, don't mask as a business error
    }
  }

  @Post("professionals")
  async registerProfessional(
    @Body() raw: { displayName: string; profession: string; phone: string; payoutRef: string },
  ) {
    const dto = validateBody<typeof raw>(raw, {
      displayName: { type: "string", maxLen: 200 },
      profession: { type: "string", enum: ["physician", "dentist"] },
      phone: { type: "string", maxLen: 32 },
      payoutRef: { type: "string", maxLen: 100 },
    });
    try {
      return await this.repo.registerProfessional(dto);
    } catch (e) {
      if (isConflict(e)) throw new ConflictException("a professional with that phone already exists");
      throw e;
    }
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Post("ops/clinics/:id/verify")
  async verifyClinic(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const r = await this.repo.verifyClinic(id);
    if (!r) throw new NotFoundException("clinic not found");
    await this.audit(user, "verify_clinic", "clinic", id);
    return r;
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Post("ops/professionals/:id/verify")
  async verifyProfessional(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const r = await this.repo.verifyProfessional(id);
    if (!r) throw new NotFoundException("professional not found");
    await this.audit(user, "verify_professional", "professional", id);
    return r;
  }

  @Post("professionals/:id/insurance")
  async submitInsurance(
    @Param("id") professionalId: string,
    @Body() dto: { validUntilHours?: number },
  ) {
    // PRO-01: optional insurance evidence (VER-05). validUntil relative for convenience.
    const validUntil = Date.now() + (dto.validUntilHours ?? 24 * 365) * HOUR_MS;
    return this.repo.submitInsurance(professionalId, validUntil);
  }

  @Get("professionals/:id/insurance")
  async insuranceStatus(@Param("id") professionalId: string) {
    // VER-05 status: Verified | UnderReview | Expired | Unverified | NotProvided.
    return this.repo.getInsuranceStatus(professionalId);
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Post("ops/professionals/:id/verify-insurance")
  async verifyInsurance(@Param("id") professionalId: string, @CurrentUser() user?: TokenPayload) {
    const r = await this.repo.verifyInsurance(professionalId);
    if (!r) throw new NotFoundException("no insurance evidence submitted");
    await this.audit(user, "verify_insurance", "professional", professionalId);
    return r;
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Post("ops/professionals/:id/suspend-credential")
  async suspendCredential(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    // VER-04: a licence lapses / is suspended by Operations.
    const ok = await this.repo.suspendCredential(id);
    if (!ok) throw new NotFoundException("professional or licence credential not found");
    await this.audit(user, "suspend_credential", "professional", id);
    return { professionalId: id, credential: "Suspended" };
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Post("bookings/:id/hold-credential")
  async holdCredential(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const booking = await this.requireBooking(id);
    // VER-06 applies after confirmation and before completion is accepted.
    if (
      booking.state !== "Confirmed" &&
      booking.state !== "InProgress" &&
      booking.state !== "AwaitingCompletion"
    ) {
      throw new BadRequestException(`booking is ${booking.state}; not eligible for a credential hold`);
    }
    if (booking.heldAt) return { id, held: true, created: false }; // idempotent
    await this.repo.holdBooking(id, "credential_or_insurance_invalid");
    await this.repo.createSupportCase(
      id,
      "credential_hold",
      "Credential/insurance failed after confirmation (VER-06)",
    );
    // NOT-01: a critical hold notifies both parties.
    await this.notifications.sms(booking.professionalId, "critical_hold", { type: "Booking", id });
    await this.notifications.sms(booking.clinicWorkspaceId, "critical_hold", { type: "Booking", id });
    await this.audit(user, "hold_credential", "booking", id);
    return { id, held: true, created: true };
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Post("bookings/:id/resolve-hold")
  async resolveHold(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const booking = await this.requireBooking(id);
    if (!booking.heldAt) return { id, held: false };
    await this.repo.resolveHold(id);
    await this.audit(user, "resolve_hold", "booking", id);
    return { id, held: false };
  }

  // ----- Booking messages (MSG-01/02) -----
  @Post("bookings/:id/messages")
  async postMessage(@Param("id") id: string, @Body() raw: { senderId: string; body: string }) {
    const dto = validateBody<typeof raw>(raw, {
      senderId: { type: "string", maxLen: 64 },
      body: { type: "string", maxLen: 2000 },
    });
    await this.requireBooking(id);
    // MSG-01: plain text only, no attachments.
    const body = dto.body.trim();
    if (!body) throw new BadRequestException("message body required");
    if (body.length > 2000) throw new BadRequestException("message too long");
    // §7.3: patient data is prohibited in messages — warn and reject on obvious IDs.
    if (containsProhibitedPatientData(body)) {
      throw new BadRequestException("message appears to contain patient/personal identifiers; remove them (§7.3)");
    }
    return this.repo.postMessage(id, dto.senderId, body);
  }

  @Get("bookings/:id/messages")
  async listMessages(@Param("id") id: string) {
    await this.requireBooking(id);
    return { messages: await this.repo.listMessages(id) };
  }

  @Get("bookings/:id/contact")
  async bookingContact(@Param("id") id: string) {
    // MSG-02: contact details appear after confirmation (a booking exists = confirmed).
    await this.requireBooking(id);
    const contact = await this.repo.getBookingContact(id);
    return contact ?? { clinicPhone: null, professionalPhone: null };
  }

  @Post("shifts")
  async postShift(@Body() dto: PostShiftDto) {
    const role: Role = dto.actorRole ?? "clinic_owner";
    if (!can(role, "clinic.publish_shift")) {
      throw new BadRequestException("only a clinic owner/admin may publish a shift");
    }
    // Validate money up front: a non-positive/non-integer compensation would otherwise
    // surface as a 500 from satang() at offer/confirm time (satang is integer-only).
    if (!Number.isInteger(dto.compensation) || dto.compensation <= 0) {
      throw new BadRequestException("compensation must be a positive integer (satang)");
    }
    // AUTH-04: an unverified clinic cannot transact.
    const clinicV = await this.repo.clinicVerification(dto.clinicWorkspaceId);
    if (clinicV === null) throw new NotFoundException("clinic not found");
    if (clinicV !== "Verified") {
      throw new BadRequestException(`clinic is ${clinicV}; must be Verified to post a shift`);
    }
    const now = Date.now();
    const shiftStart = now + (dto.shiftStartInHours ?? 48) * HOUR_MS;
    const urgency: ShiftUrgency = dto.urgency ?? "standard";
    if (urgency === "urgent" && !isUrgentEligible(shiftStart, now)) {
      throw new BadRequestException("urgent requires the shift to start within 72h (URG-01)");
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
    if (urgency === "urgent" || urgency === "standard") filters.urgency = urgency;
    if (minCompensation) filters.minCompensation = Number(minCompensation);
    if (maxCompensation) filters.maxCompensation = Number(maxCompensation);
    const shifts = await this.repo.listOpenShifts(filters);
    // SRC-04: empty results offer posting / matching assistance.
    return shifts.length === 0
      ? { shifts, hint: "No open shifts match — post a shift or ask Operations for matching assistance." }
      : { shifts };
  }

  // ----- Availability & professional search (AVL, SRC) -----
  @Post("professionals/:id/availability")
  async addAvailability(
    @Param("id") professionalId: string,
    @Body() dto: { startsInHours?: number; durationHours?: number; openToRequests?: boolean },
  ) {
    // AVL-01: one-off Available blocks. Kept relative (hours from now) for convenience.
    const now = Date.now();
    const startsAt = now + (dto.startsInHours ?? 24) * HOUR_MS;
    const endsAt = startsAt + (dto.durationHours ?? 8) * HOUR_MS;
    return this.repo.addAvailability(professionalId, startsAt, endsAt, dto.openToRequests ?? false);
  }

  @Get("professionals/:id/availability")
  async listAvailability(@Param("id") professionalId: string) {
    // AVL-02: only listed blocks count as available.
    return { availability: await this.repo.listAvailability(professionalId) };
  }

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

  @Post("shifts/:id/apply")
  async apply(@Param("id") shiftId: string, @Body() raw: { professionalId: string }) {
    const dto = validateBody<typeof raw>(raw, { professionalId: { type: "string", maxLen: 64 } });
    // APP-01: applications are non-binding and reserve neither party.
    await this.requireOpenShift(shiftId);
    try {
      const a = await this.repo.applyToShift(shiftId, dto.professionalId);
      return { id: a.id, state: "Submitted" };
    } catch (e) {
      if (isConflict(e)) throw new ConflictException("already applied to this shift");
      throw e;
    }
  }

  @Post("shifts/:id/invite")
  async invite(@Param("id") shiftId: string, @Body() raw: { professionalId: string }) {
    const dto = validateBody<typeof raw>(raw, { professionalId: { type: "string", maxLen: 64 } });
    // A professional can only be invited to a shift that is still open (consistency with apply/offer).
    await this.requireOpenShift(shiftId);
    try {
      const i = await this.repo.inviteToShift(shiftId, dto.professionalId);
      await this.notifications.sms(dto.professionalId, "invited", { type: "Shift", id: shiftId });
      return { id: i.id, state: "Sent" };
    } catch (e) {
      if (isConflict(e)) throw new ConflictException("already invited to this shift");
      throw e;
    }
  }

  @Get("shifts/:id/candidates")
  async candidates(@Param("id") shiftId: string) {
    const shift = await this.repo.getShift(shiftId);
    if (!shift) throw new NotFoundException("shift not found");
    return { candidates: await this.repo.listShiftCandidates(shiftId) };
  }

  @Post("shifts/:id/offer")
  async offerToProfessional(
    @Param("id") shiftId: string,
    @Body() dto: { professionalId: string; actorRole?: Role },
  ) {
    const role: Role = dto.actorRole ?? "clinic_owner";
    // OFF-01: only a clinic owner/admin may send a binding offer.
    try {
      this.offers.assertCanSendOffer(role);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const shift = await this.requireOpenShift(shiftId);
    // OFF-02: one active offer per shift.
    if (shift.hasActiveOffer) {
      throw new BadRequestException("shift already has an active offer (OFF-02)");
    }
    // The offer goes to a professional who applied or was invited.
    const candidates = await this.repo.listShiftCandidates(shiftId);
    if (!candidates.some((c) => c.professionalId === dto.professionalId)) {
      throw new BadRequestException("professional must apply or be invited first");
    }
    const now = Date.now();
    const expiresAt = this.offers.computeExpiry(now, shift.startsAt, shift.urgency);
    let offer;
    try {
      offer = await this.repo.createOfferForShift({
        shiftId,
        professionalId: dto.professionalId,
        sentAt: now,
        expiresAt,
      });
    } catch (e) {
      if (isConflict(e)) throw new ConflictException("shift already has an active offer (OFF-02)");
      throw e;
    }
    // NOT-01: notify the professional (SMS covers offers near expiry).
    await this.notifications.sms(dto.professionalId, "offer_sent", { type: "Offer", id: offer.id });
    if (shift.urgency === "urgent") {
      await this.notifications.sms(dto.professionalId, "urgent_alert", { type: "Offer", id: offer.id });
    }
    return {
      id: offer.id,
      state: offer.state,
      expiresAt: offer.expiresAt,
      checkout: this.payments.checkout(satang(shift.compensation)),
    };
  }

  // ----- Operations dashboard (ADM-01) -----
  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Get("ops/cases")
  async listCases() {
    return { cases: await this.repo.listOpenCases() };
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Get("ops/pending")
  async listPending() {
    return { pending: await this.repo.listPendingVerifications() };
  }

  // REP-03: core marketplace + operations metrics for management (no liquidity dashboard).
  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Get("ops/metrics")
  async metrics() {
    return this.repo.getMetrics();
  }

  // §7.3: immutable audit trail of privileged actions. Actor is masked for display
  // (least privilege). Administrator-only — it exposes who did what.
  @UseGuards(AuthGuard)
  @Roles("administrator")
  @Get("ops/audit")
  async auditTrail() {
    const rows = await this.repo.listAudit();
    return { audit: rows.map((r) => ({ ...r, actor: maskActor(r.actor) })) };
  }

  // ----- Finance (PAY-11 reconciliation) -----
  @UseGuards(AuthGuard)
  @Roles("finance", "administrator")
  @Get("finance/reconciliation")
  async reconciliation() {
    return this.repo.reconcile();
  }

  // REP-02: Finance exports allocations + events + provider references as CSV.
  @UseGuards(AuthGuard)
  @Roles("finance", "administrator")
  @Header("Content-Type", "text/csv")
  @Header("Content-Disposition", "attachment; filename=\"finance-export.csv\"")
  @Get("finance/export")
  async financeExport() {
    const rows = await this.repo.exportFinancials();
    const header = [
      "paymentOrderId",
      "bookingId",
      "orderState",
      "orderProviderRef",
      "captured",
      "compensation",
      "serviceFee",
      "tax",
      "eventType",
      "eventAmount",
      "eventProviderRef",
      "eventAt",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const base = [
        r.paymentOrderId,
        r.bookingId ?? "",
        r.state,
        r.providerRef ?? "",
        r.captured,
        r.compensation ?? "",
        r.serviceFee ?? "",
        r.tax ?? "",
      ];
      if (r.events.length === 0) {
        lines.push([...base, "", "", "", ""].map(csvCell).join(","));
      } else {
        for (const e of r.events) {
          lines.push(
            [...base, e.type, e.amount, e.providerRef ?? "", e.at ? new Date(e.at).toISOString() : ""]
              .map(csvCell)
              .join(","),
          );
        }
      }
    }
    return lines.join("\n") + "\n";
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
    // NOT-01: acceptance opens the funding window — tell the clinic payment is required.
    await this.notifications.sms(offer.clinicWorkspaceId, "payment_required", { type: "Offer", id });
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

    // §6.3: read the real verification facts + schedule overlap for this offer.
    const eligibility = await this.repo.getOfferEligibility(id);
    const overlap = await this.repo.hasScheduleOverlap(
      offer.professionalId,
      offer.shiftStart,
      offer.shiftStart + 4 * HOUR_MS, // shift length (AVL-03)
    );
    const ctx: ConfirmationContext = {
      clinicActiveVerified: eligibility?.clinicVerified ?? false,
      professionalActiveVerified: eligibility?.professionalVerified ?? false,
      // VER-04: read licence suspension/expiry at confirm time — a credential the
      // professional held at offer time may have been suspended by Operations since.
      licenceValidThroughShiftEnd: eligibility?.licenceValidThroughShiftEnd ?? false,
      specialtyValidThroughShiftEnd: true,
      insuranceRequired: eligibility?.insuranceRequired ?? false,
      insuranceValidThroughShiftEnd: eligibility?.insuranceValidThroughShiftEnd ?? true,
      clinicServiceSupported: true,
      shiftCategorySupported: true,
      hasSuspension: !(eligibility?.professionalNotSuspended ?? false),
      hasBlockingHold: false,
      hasScheduleOverlap: overlap,
      offerExpired: Date.now() > offer.expiresAt, // §6.3: late payment after expiry never books
      durablePrefundingSucceeded: body?.prefundingSucceeded ?? true,
    };

    try {
      this.bookings.assertEligible(ctx); // §6.3 gate — throws NOT_ELIGIBLE with reasons
      advanceOffer(offer.state, "Converted"); // throws if the offer was never accepted
    } catch (e) {
      // A concurrent confirm may have already booked this offer — the overlap check
      // then trips on that very booking. Return it idempotently instead of a 400.
      const won = await this.repo.getBookingByOffer(id);
      if (won) return { booking: won, checkout: this.payments.checkout(satang(offer.compensation)) };
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
        clinicWorkspaceId: offer.clinicWorkspaceId,
        professionalId: offer.professionalId,
        allocation: {
          compensation: checkout.compensation,
          serviceFee: checkout.serviceFee,
          tax: checkout.tax,
        },
        captured: checkout.total,
        idempotencyKey: `collection:${offer.id}`,
      });
      // NOT-01: confirmation — email all critical events; SMS the confirmation too.
      await this.notifications.email(offer.professionalId, "confirmed", { type: "Booking", id: booking.id });
      await this.notifications.email(offer.clinicWorkspaceId, "confirmed", { type: "Booking", id: booking.id });
      await this.notifications.sms(offer.professionalId, "confirmed", { type: "Booking", id: booking.id });
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
    // CMP-01: professional marks completion. Only an active booking (Confirmed or
    // InProgress) can be completed — not a Cancelled/Archived one.
    if (booking.state !== "Confirmed" && booking.state !== "InProgress") {
      throw new BadRequestException(`booking is ${booking.state}; cannot mark completion`);
    }
    try {
      const updated = await this.repo.markCompletion(id);
      return { id, state: updated?.state ?? "AwaitingCompletion" };
    } catch (e) {
      // A concurrent complete may have already advanced it (illegal self-transition
      // throws in the domain). Return the current state idempotently, not a 500.
      const current = await this.repo.getBooking(id);
      if (current?.state === "AwaitingCompletion" || current?.state === "ServiceCompleted") {
        return { id, state: current.state };
      }
      throw new BadRequestException((e as Error).message);
    }
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
    // VER-06: a held booking cannot be completed/paid out until Operations resolves.
    if (booking.heldAt) {
      throw new BadRequestException("booking is on hold; resolve the hold first (VER-06)");
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
      // NOT-01: payout initiated — email the professional.
      await this.notifications.email(booking.professionalId, "payout", { type: "Booking", id });
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
    @Body() raw: { actor: CancelActor; reason: CancelReason; hoursBeforeStart?: number; arrived?: boolean },
  ) {
    const dto = validateBody<typeof raw>(raw, {
      actor: { type: "string", enum: ["clinic", "professional"] },
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
      hoursBeforeStart: { type: "number", optional: true, min: 0 },
      arrived: { type: "boolean", optional: true },
    });
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
      // NOT-01: cancellation — SMS both parties.
      await this.notifications.sms(booking.professionalId, "cancelled", { type: "Booking", id });
      await this.notifications.sms(booking.clinicWorkspaceId, "cancelled", { type: "Booking", id });
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

  @Post("bookings/:id/reviews")
  async createReview(
    @Param("id") id: string,
    @Body() rawBody: { by: "clinic" | "professional"; score: number; tags?: string[]; text?: string },
  ) {
    const dto = validateBody<typeof rawBody>(rawBody, {
      by: { type: "string", enum: ["clinic", "professional"] },
      score: { type: "number", int: true, min: 1, max: 5 },
      text: { type: "string", optional: true, maxLen: 2000 },
    });
    const booking = await this.requireBooking(id);
    // REV-01/05: only a completed paid booking creates review rights (cancelled or
    // unfinished bookings never reach ServiceCompleted, so they earn no reputation).
    if (!canLeaveReview(booking.state)) {
      throw new BadRequestException(
        `booking is ${booking.state}; reviews require a completed booking`,
      );
    }
    // §7.3: patient data is prohibited in reviews.
    if (dto.text && containsProhibitedPatientData(dto.text)) {
      throw new BadRequestException("review appears to contain patient/personal identifiers; remove them (§7.3)");
    }
    // Author reviews the other party (clinic -> professional, or professional -> clinic).
    const authorId = dto.by === "clinic" ? booking.clinicWorkspaceId : booking.professionalId;
    const subjectId = dto.by === "clinic" ? booking.professionalId : booking.clinicWorkspaceId;
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
      if (isConflict(e)) throw new ConflictException("this party has already reviewed this booking");
      throw e;
    }
  }

  @Get("professionals/:id/rating")
  async getRating(@Param("id") id: string) {
    const rating = await this.repo.getSubjectRating(id);
    if (!rating) {
      return { subjectId: id, hasRating: false, note: "not enough published reviews (need 3)" };
    }
    return { subjectId: id, hasRating: true, ...rating };
  }

  // ----- Reporting (REP-01): party booking + financial history and receipts -----
  // Guarded behind an internal role: these expose compensation/fee/tax/payout amounts
  // by enumerable id. Party-facing self-service (a clinic seeing only its own history)
  // needs external-user identity and is deferred to Phase 2 — for now it is Ops/Finance.
  @UseGuards(AuthGuard)
  @Roles("operations", "finance", "administrator")
  @Get("professionals/:id/bookings")
  async professionalBookings(@Param("id") id: string) {
    return { bookings: await this.repo.listPartyBookings("professional", id) };
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "finance", "administrator")
  @Get("clinics/:id/bookings")
  async clinicBookings(@Param("id") id: string) {
    return { bookings: await this.repo.listPartyBookings("clinic", id) };
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "finance", "administrator")
  @Get("bookings/:id/receipt")
  async receipt(@Param("id") id: string) {
    // REP-01: the booking's checkout breakdown + payout statement. A booking exists
    // only after confirmation, so the captured split is final (BKG-03 snapshots).
    const b = await this.requireBooking(id);
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
      payout: { state: b.payoutState, amount: b.payoutState === "Paid" ? b.compensation : 0 },
    };
  }

  @Get("professionals/:id/profile")
  async getProfile(@Param("id") id: string) {
    // VER-03: return the profile split into self-declared claims vs verified facts.
    const profile = await this.repo.getProfessionalProfile(id);
    if (!profile) throw new NotFoundException("professional not found");
    return profile;
  }

  @Get("offers/:id")
  async getOffer(@Param("id") id: string) {
    const offer = await this.requireOffer(id);
    return { offer, booking: await this.repo.getBookingByOffer(id) };
  }

  /** §7.3/§6.4: record a privileged action against the immutable audit trail. */
  private async audit(
    user: TokenPayload | undefined,
    action: string,
    targetType: string,
    targetId: string,
    details?: Record<string, unknown>,
  ) {
    await this.repo.recordAudit({
      actor: user?.sub ?? "unknown",
      role: user?.role ?? "unknown",
      action,
      targetType,
      targetId,
      ...(details ? { details } : {}),
    });
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

  private async requireOpenShift(id: string) {
    const shift = await this.repo.getShift(id);
    if (!shift) throw new NotFoundException("shift not found");
    if (shift.state !== "Published" || shift.booked) {
      throw new BadRequestException("shift is not open");
    }
    return shift;
  }
}

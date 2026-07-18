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
import { AuthGuard, Roles, CurrentUser, Public } from "../auth/auth.guard.js";
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
import { OffersService } from "../offers/offers.service.js";
import { BookingsService } from "../bookings/bookings.service.js";
import { PaymentsService } from "../payments/payments.service.js";
import { MockPaymentProvider } from "../payments/payment.provider.js";
import { NotificationsService } from "./notifications.service.js";
import { InMemoryMarketplaceStore } from "./marketplace.memory-store.js";
import { seedDemoFixtures } from "../../fixtures/demo-fixtures.js";
import {
  MARKETPLACE_REPOSITORY,
  type MarketplaceRepository,
  type ShiftFilters,
  type ProfessionalFilters,
  type CallerIdentity,
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
    private readonly paymentProvider: MockPaymentProvider,
    private readonly notifications: NotificationsService,
    @Inject(MARKETPLACE_REPOSITORY) private readonly repo: MarketplaceRepository,
  ) {}

  // Demo only: wipe and re-seed the in-memory store so a tester can start clean. Gated to
  // demo mode (in-memory store + AUTH_DEV_MODE) — never touches a real Postgres deployment.
  @Public()
  @Post("demo/reset")
  async resetDemo() {
    if (process.env.DATABASE_URL || process.env.AUTH_DEV_MODE !== "true") {
      throw new ForbiddenException("demo reset is only available in demo mode");
    }
    if (!(this.repo instanceof InMemoryMarketplaceStore)) {
      throw new ForbiddenException("demo reset requires the in-memory store");
    }
    this.repo.reset();
    await seedDemoFixtures(this.repo);
    this.repo.markSeeded();
    return { ok: true };
  }

  @Public()
  @Post("clinics")
  async registerClinic(
    @Body() raw: { branchName: string; licenceNo: string; address: string; ownerPhone: string },
  ) {
    const dto = validateBody<typeof raw>(raw, {
      branchName: { type: "string", minLen: 1, maxLen: 200 },
      licenceNo: { type: "string", minLen: 1, maxLen: 100 },
      address: { type: "string", minLen: 1, maxLen: 500 },
      ownerPhone: { type: "string", minLen: 8, maxLen: 32 },
    });
    try {
      return await this.repo.registerClinic(dto);
    } catch (e) {
      if (isConflict(e)) throw new ConflictException("a clinic with that owner phone already exists");
      throw e; // real infra failure — surface as 500, don't mask as a business error
    }
  }

  @Public()
  @Post("professionals")
  async registerProfessional(
    @Body() raw: { displayName: string; profession: string; phone: string; payoutRef: string },
  ) {
    const dto = validateBody<typeof raw>(raw, {
      displayName: { type: "string", minLen: 1, maxLen: 200 },
      profession: { type: "string", enum: ["physician", "dentist"] },
      phone: { type: "string", minLen: 8, maxLen: 32 },
      payoutRef: { type: "string", minLen: 1, maxLen: 100 },
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
    await this.requireProfessional(user, professionalId);
    const dto = validateBody<{ validUntilHours?: number }>(raw ?? {}, {
      validUntilHours: { type: "number", optional: true, positive: true, max: 24 * 365 * 10 },
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
    await this.requireProfessional(user, professionalId);

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
    // The hold's support case is done once the hold is lifted — close it so it leaves the
    // operations queue rather than lingering Open forever.
    await this.repo.resolveSupportCase(id, "credential_hold");
    await this.audit(user, "resolve_hold", "booking", id);
    return { id, held: false };
  }

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
    const booking = await this.requireBooking(id);
    // Only the two parties may post, and the sender is the caller — `senderId` used to come
    // from the body, so anyone could forge a message from either party into any booking.
    const party = await this.partyInBooking(user, booking);
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
      throw new BadRequestException("message appears to contain patient/personal identifiers; remove them (§7.3)");
    }
    return this.repo.postMessage(id, senderId, body);
  }

  @UseGuards(AuthGuard)
  @Get("bookings/:id/messages")
  async listMessages(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const booking = await this.requireBooking(id);
    await this.partyInBooking(user, booking); // participants (or staff) only
    return { messages: await this.repo.listMessages(id) };
  }

  @UseGuards(AuthGuard)
  @Get("bookings/:id/contact")
  async bookingContact(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    // MSG-02: contact details appear after confirmation (a booking exists = confirmed) — but
    // only to the two parties. This returned both sides' real phone numbers to anyone holding
    // a booking id, which is a PDPA exposure with no lawful basis.
    const booking = await this.requireBooking(id);
    await this.partyInBooking(user, booking);
    const contact = await this.repo.getBookingContact(id);
    return contact ?? { clinicPhone: null, professionalPhone: null };
  }

  @UseGuards(AuthGuard)
  @Post("shifts")
  async postShift(@Body() raw: PostShiftDto, @CurrentUser() user?: TokenPayload) {
    const dto = validateBody<PostShiftDto>(raw, {
      clinicWorkspaceId: { type: "string", maxLen: 64 },
      compensation: { type: "number", int: true, positive: true },
      category: { type: "string", optional: true, maxLen: 64 },
      urgency: { type: "string", optional: true, enum: ["standard", "urgent"] },
      insuranceRequired: { type: "boolean", optional: true },
      shiftStartInHours: { type: "number", optional: true, min: 0, max: 24 * 365 },
    });
    // §3: authority comes from the caller's membership in THIS workspace, not from an
    // `actorRole` field in the body that defaulted to "clinic_owner" when omitted.
    await this.requireClinicAuthority(user, dto.clinicWorkspaceId, "clinic.publish_shift");
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
    if (urgency === "urgent" || urgency === "standard") filters.urgency = urgency;
    const min = minCompensation !== undefined ? Number(minCompensation) : NaN;
    const max = maxCompensation !== undefined ? Number(maxCompensation) : NaN;
    if (Number.isFinite(min)) filters.minCompensation = min;
    if (Number.isFinite(max)) filters.maxCompensation = max;
    const shifts = await this.repo.listOpenShifts(filters);
    // SRC-04: empty results offer posting / matching assistance.
    return shifts.length === 0
      ? { shifts, hint: "No open shifts match — post a shift or ask Operations for matching assistance." }
      : { shifts };
  }

  // ----- Availability & professional search (AVL, SRC) -----
  @UseGuards(AuthGuard)
  @Post("professionals/:id/availability")
  async addAvailability(
    @Param("id") professionalId: string,
    @Body() raw: { startsInHours?: number; durationHours?: number; openToRequests?: boolean },
    @CurrentUser() user?: TokenPayload,
  ) {
    await this.requireProfessional(user, professionalId);
    const dto = validateBody<{ startsInHours?: number; durationHours?: number; openToRequests?: boolean }>(
      raw ?? {},
      {
        startsInHours: { type: "number", optional: true, min: 0, max: 24 * 365 },
        durationHours: { type: "number", optional: true, positive: true, max: 24 * 14 },
        openToRequests: { type: "boolean", optional: true },
      },
    );
    // AVL-01: one-off Available blocks. Kept relative (hours from now) for convenience.
    const now = Date.now();
    const startsAt = now + (dto.startsInHours ?? 24) * HOUR_MS;
    const endsAt = startsAt + (dto.durationHours ?? 8) * HOUR_MS;
    return this.repo.addAvailability(professionalId, startsAt, endsAt, dto.openToRequests ?? false);
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
    const dto = validateBody<typeof raw>(raw, { professionalId: { type: "string", maxLen: 64 } });
    // A professional applies as themselves. Enrolling someone else as a candidate was the
    // precondition that made the offer -> accept -> confirm chain reachable against a
    // professional who never applied.
    await this.requireProfessional(user, dto.professionalId);
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

  @UseGuards(AuthGuard)
  @Post("shifts/:id/invite")
  async invite(
    @Param("id") shiftId: string,
    @Body() raw: { professionalId: string },
    @CurrentUser() user?: TokenPayload,
  ) {
    const dto = validateBody<typeof raw>(raw, { professionalId: { type: "string", maxLen: 64 } });
    // A professional can only be invited to a shift that is still open (consistency with apply/offer).
    const shift = await this.requireOpenShift(shiftId);
    // Inviting is non-binding (APP-01), so clinic_staff may do it — but only for their own
    // workspace's shift.
    await this.requireClinicAuthority(user, shift.clinicWorkspaceId, "clinic.search_invite");
    try {
      const i = await this.repo.inviteToShift(shiftId, dto.professionalId);
      await this.notifications.sms(dto.professionalId, "invited", { type: "Shift", id: shiftId });
      return { id: i.id, state: "Sent" };
    } catch (e) {
      if (isConflict(e)) throw new ConflictException("already invited to this shift");
      throw e;
    }
  }

  @UseGuards(AuthGuard)
  @Get("shifts/:id/candidates")
  async candidates(@Param("id") shiftId: string, @CurrentUser() user?: TokenPayload) {
    const shift = await this.repo.getShift(shiftId);
    if (!shift) throw new NotFoundException("shift not found");
    // Applicant lists are commercial PII — clinic of record or staff only.

    await this.requireClinicAuthority(user, shift.clinicWorkspaceId, "clinic.search_invite");
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
    const shift = await this.requireOpenShift(shiftId);
    // OFF-01: only a clinic owner/admin of THIS workspace may send a binding offer. The
    // role now comes from the caller's membership; it used to be `dto.actorRole` defaulting
    // to "clinic_owner", so the §3 prohibition on clinic_staff binding terms was decorative.
    await this.requireClinicAuthority(user, shift.clinicWorkspaceId, "clinic.send_offer");
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
  // ----- §6.4 dual control: payment exceptions -------------------------------------
  //
  // An out-of-flow refund is a high-value money action, so it needs two different
  // authorized people (§3, §6.4). `requiresDualControl`/`dualControlSatisfied` existed in
  // the domain with no caller at all — the rule was tested and unenforced. It is now a
  // proposal that one person raises and a different one executes; the DB CHECK
  // `ApprovalRequest_different_person` backs it up so no row can contradict the rule.

  @UseGuards(AuthGuard)
  @Roles("finance")
  @Post("finance/refunds")
  async proposeRefund(
    @Body() raw: { bookingId: string; amount: number; reason: string },
    @CurrentUser() user?: TokenPayload,
  ) {
    const dto = validateBody<typeof raw>(raw, {
      bookingId: { type: "string", maxLen: 64 },
      amount: { type: "number", int: true, positive: true },
      reason: { type: "string", maxLen: 500 },
    });
    await this.requireBooking(dto.bookingId);
    // PAY-08 at proposal time: refuse to record a request that could never be executed.
    // Cap against *remaining* funds (captured − prior refunds − other Pending proposals),
    // not the original capture — otherwise two dual-control refunds of `captured` each
    // over-refund 2× after both execute.
    const available = await this.repo.refundAvailable(dto.bookingId);
    this.payments.assertWithinAllocation(satang(dto.amount), satang(available), "refund");

    const approval = await this.repo.createApproval({
      capability: "finance.execute_refund",
      refType: "Booking",
      refId: dto.bookingId,
      amount: dto.amount,
      reason: dto.reason,
      initiatorId: user?.sub ?? "unknown",
      initiatorRole: user?.role ?? "unknown",
    });
    await this.audit(user, "propose_refund", "booking", dto.bookingId, {
      approvalId: approval.id,
      amount: dto.amount,
    });
    return { id: approval.id, state: approval.state, amount: approval.amount };
  }

  @UseGuards(AuthGuard)
  @Roles("finance", "administrator")
  @Get("finance/refunds")
  async listPendingRefunds() {
    return { pending: await this.repo.listPendingApprovals() };
  }

  // Only `finance` holds finance.execute_refund (§3). An administrator is a *different*
  // person but not an authorized one, so admin is deliberately not an approver here —
  // separation of duties is the point of the rule.
  @UseGuards(AuthGuard)
  @Roles("finance")
  @Post("finance/refunds/:id/approve")
  async approveRefund(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const approval = await this.repo.getApproval(id);
    if (!approval) throw new NotFoundException("approval request not found");
    if (approval.state !== "Pending") {
      throw new ConflictException(`approval is ${approval.state}`);
    }

    // §6.4: the executor must be authorized AND a different person than the initiator. The
    // domain owns both halves — checking only "ids differ" would let any second pair of
    // hands approve a payout.
    const executor = { id: user?.sub ?? "unknown", role: (user?.role ?? "unknown") as Role };
    const initiator = { id: approval.initiatorId, role: approval.initiatorRole as Role };
    if (!dualControlSatisfied(approval.capability as Capability, initiator, executor)) {
      throw new ForbiddenException(
        "§6.4: this action requires approval by a different authorized person",
      );
    }

    await this.requireBooking(approval.refId);
    // Re-check remaining at approve time (other refunds may have landed since proposal).
    // This Pending row is still Pending, so refundAvailable includes its own amount — add
    // it back so the executor can approve the proposal that reserved those funds.
    const availableIncludingThis =
      (await this.repo.refundAvailable(approval.refId)) + approval.amount;
    this.payments.assertWithinAllocation(
      satang(approval.amount),
      satang(availableIncludingThis),

      "refund",
    );

    try {
      const result = await this.repo.executeApproval({
        approvalId: id,
        executorId: executor.id,
        executorRole: executor.role,
        idempotencyKey: `approval-refund:${id}`,
      });
      await this.audit(user, "execute_refund", "booking", approval.refId, {
        approvalId: id,
        amount: approval.amount,
        initiatorId: approval.initiatorId,
      });
      return { id, state: "Executed", ...result };
    } catch (e) {
      if (isConflict(e)) {
        const msg = (e as Error).message;
        if (msg.includes("refundable")) {
          throw new BadRequestException(msg);
        }
        throw new ConflictException("approval was already executed");
      }
      throw e;
    }
  }

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

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Get("ops/bookings")
  async listActiveBookings() {
    return { bookings: await this.repo.listActiveBookings() };
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

  @UseGuards(AuthGuard)
  @Post("offers/:id/accept")
  async accept(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const offer = await this.requireOffer(id);
    // Only the professional the offer was made to may accept it. There was no check at all:
    // any caller could accept on a stranger's behalf and bind them to a shift.
    await this.requireProfessional(user, offer.professionalId);
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
    await this.notifications.sms(offer.clinicWorkspaceId, "payment_required", { type: "Offer", id });
    return { id, state: nextState, fundingDueAt: updated.fundingDueAt ?? fundingDueAt };
  }

  @UseGuards(AuthGuard)
  @Post("offers/:id/confirm")
  async confirm(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const offer = await this.requireOffer(id);
    // Confirming captures the clinic's money (§3 "clinic.pay"), so only an owner/admin of
    // the workspace that made the offer may do it.
    await this.requireClinicAuthority(user, offer.clinicWorkspaceId, "clinic.pay");

    // Atomic + idempotent: one shift -> one booking (§6.4). If already booked, return it.
    const existing = await this.repo.getBookingByOffer(id);
    if (existing) {
      return { booking: existing, checkout: this.payments.checkout(satang(offer.compensation)) };
    }

    const checkout = this.payments.checkout(satang(offer.compensation));
    const now = Date.now();

    // §6.3 gates BEFORE capture — collecting funds then failing eligibility left money
    // stranded with no booking and no unwind.
    if (offer.state !== "AwaitingPayment") {
      throw new BadRequestException(`offer is ${offer.state}; must be AwaitingPayment to confirm`);
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
      licenceValidThroughShiftEnd: eligibility?.licenceValidThroughShiftEnd ?? false,
      specialtyValidThroughShiftEnd: eligibility?.specialtyValidThroughShiftEnd ?? true,
      insuranceRequired: eligibility?.insuranceRequired ?? false,
      // Fail closed: unknown insurance facts must not book an insurance-required shift.
      insuranceValidThroughShiftEnd: eligibility?.insuranceValidThroughShiftEnd ?? false,
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
      this.bookings.assertEligible({ ...preCaptureCtx, durablePrefundingSucceeded: true });
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
        idempotencyKey: `collection:${offer.id}`,
      });
      await this.audit(user, "confirm_booking", "booking", booking.id, {
        offerId: offer.id,
        captured: checkout.total,
        paymentOrderId,
      });
      await this.notifications.email(offer.professionalId, "confirmed", { type: "Booking", id: booking.id });
      await this.notifications.email(offer.clinicWorkspaceId, "confirmed", { type: "Booking", id: booking.id });
      await this.notifications.sms(offer.professionalId, "confirmed", { type: "Booking", id: booking.id });
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
  @Post("bookings/:id/arrive")
  async recordArrival(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const booking = await this.requireBooking(id);
    await this.requireProfessional(user, booking.professionalId);
    // CAN-03 evidence: arrival is what separates a 50% cancellation from a 100% one, so it
    // is recorded as its own event on an active booking rather than asserted at cancel time.
    if (booking.state !== "Confirmed" && booking.state !== "InProgress") {
      throw new BadRequestException(`booking is ${booking.state}; cannot record arrival`);
    }
    await this.repo.recordArrival(id);
    return { id, arrived: true };
  }

  @UseGuards(AuthGuard)
  @Post("bookings/:id/complete")
  async complete(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const booking = await this.requireBooking(id);
    // CMP-01: the professional submits their own completion — it starts the payout clock.
    await this.requireProfessional(user, booking.professionalId);
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
  async acceptCompletion(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const booking = await this.requireBooking(id);
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
        throw new BadRequestException("auto-accept deadline has not passed for this booking");
      }
    } else {
      await this.requireClinicAuthority(user, booking.clinicWorkspaceId, "clinic.confirm_completion");
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

    // PAY-08: the payout may not exceed the funds actually captured for this booking.
    this.payments.assertWithinAllocation(
      satang(booking.compensation),
      satang(booking.captured),
      "payout",
    );

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
      await this.audit(user, "accept_completion_payout", "booking", id, {
        payoutAmount: booking.compensation,
        auto: user?.role === "worker",
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
      // A concurrent cancel won the claim instead: that is a real conflict, not a server
      // fault. Surfacing it as 409 keeps the auto-accept sweep's logs honest about which
      // bookings it actually paid.
      if (isConflict(e)) {
        throw new ConflictException("booking changed concurrently; payout not applied");
      }
      throw e;
    }
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator", "worker")
  @Post("bookings/:id/flag-inactive")
  async flagInactive(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const booking = await this.requireBooking(id);
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
        throw new BadRequestException("clinic inactivity review deadline has not passed");
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
      await this.audit(user, "flag_inactive", "booking", id, { caseId: created.id });
      return { id, caseId: created.id, state: created.state, created: true };
    } catch (e) {
      if (isConflict(e)) {
        const raced = await this.repo.findSupportCase(id, "completion_review");
        if (raced) return { id, caseId: raced.id, state: raced.state, created: false };
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
      actor: { type: "string", enum: ["clinic", "professional"], optional: true },
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
    const booking = await this.requireBooking(id);
    // Idempotent: a cancelled booking is terminal for this action.
    if (booking.state === "Cancelled") {
      return { id, outcome: "cancelled", bookingState: "Cancelled", alreadyCancelled: true };
    }

    const party = await this.partyInBooking(user, booking);
    if (party === "clinic") {
      await this.requireClinicAuthority(user, booking.clinicWorkspaceId, "clinic.cancel_confirmed");
    }
    const actor: CancelActor =
      party === "staff"
        ? dto.actor ?? (() => {
            throw new BadRequestException("staff must state which party is cancelling");
          })()
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

    // PAY-08: neither leg may exceed the captured funds. Both are derived here, so this is
    // a guard against a bad compensation/captured pair reaching the ledger — not a formality.
    this.payments.assertWithinAllocation(payable, satang(booking.captured), "cancellation payout");
    this.payments.assertWithinAllocation(refund, satang(booking.captured), "cancellation refund");

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
      await this.audit(user, "cancel_booking", "booking", id, {
        actor,
        reason: dto.reason,
        fraction: outcome.fraction,
        payable,
        refund,
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
      // A concurrent accept-completion paid out first: the booking is no longer cancellable
      // and no refund was written. 409, not 500 — nothing is broken, the race simply resolved
      // the other way.
      if (isConflict(e)) {
        throw new ConflictException("booking changed concurrently; cancellation not applied");
      }
      throw e;
    }
  }

  @UseGuards(AuthGuard)
  @Post("bookings/:id/reviews")
  async createReview(
    @Param("id") id: string,
    @Body() rawBody: { by?: "clinic" | "professional"; score: number; tags?: string[]; text?: string },
    @CurrentUser() user?: TokenPayload,
  ) {
    const dto = validateBody<typeof rawBody>(rawBody, {
      // Derived from the caller below; only staff may state it. `by` used to be taken at face
      // value, so a third party could post a 1-star review attributed to the clinic — and
      // burn the real party's one review right via the unique constraint.
      by: { type: "string", enum: ["clinic", "professional"], optional: true },
      score: { type: "number", int: true, min: 1, max: 5 },
      text: { type: "string", optional: true, maxLen: 2000 },
      tags: { type: "stringArray", optional: true, maxLen: 10, itemMaxLen: 40 },
    });
    const booking = await this.requireBooking(id);
    const party = await this.partyInBooking(user, booking);
    const by: "clinic" | "professional" =
      party === "staff"
        ? dto.by ?? (() => {
            throw new BadRequestException("staff must state which party is reviewing");
          })()
        : party;
    // Clinic reviews are an official reputation act — clinic_staff membership alone is
    // not enough (they cannot bind terms or move money either).
    if (by === "clinic" && party === "clinic") {
      await this.requireClinicAuthority(user, booking.clinicWorkspaceId, "clinic.confirm_completion");
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
      throw new BadRequestException("review appears to contain patient/personal identifiers; remove them (§7.3)");
    }
    // Author reviews the other party (clinic -> professional, or professional -> clinic).
    const authorId = by === "clinic" ? booking.clinicWorkspaceId : booking.professionalId;
    const subjectId = by === "clinic" ? booking.professionalId : booking.clinicWorkspaceId;
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

  @Public()
  @Get("professionals/:id/rating")
  async getRating(@Param("id") id: string) {
    const rating = await this.repo.getSubjectRating(id);
    if (!rating) {
      return { subjectId: id, hasRating: false, note: "not enough published reviews (need 3)" };
    }
    return { subjectId: id, hasRating: true, ...rating };
  }

  // ----- Reporting (REP-01): party booking + financial history and receipts -----
  // Party self-service: a professional sees their OWN bookings, a clinic member their own
  // workspace's, and staff see any. Ownership is derived from the caller's identity, so the
  // enumerable id in the path cannot be used to read another party's money history.
  @UseGuards(AuthGuard)
  @Get("professionals/:id/bookings")
  async professionalBookings(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    await this.requireProfessional(user, id);
    return { bookings: await this.repo.listPartyBookings("professional", id) };
  }

  @UseGuards(AuthGuard)
  @Get("clinics/:id/bookings")
  async clinicBookings(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    await this.requireClinicMember(user, id);
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
  async clinicShifts(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    await this.requireClinicMember(user, id);
    return { shifts: await this.repo.listClinicShifts(id) };
  }

  /** The offers made to a professional (so they can accept). */
  @UseGuards(AuthGuard)
  @Get("professionals/:id/offers")
  async professionalOffers(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    await this.requireProfessional(user, id);
    return { offers: await this.repo.listProfessionalOffers(id) };
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "finance", "administrator")
  @Get("bookings/:id/receipt")
  async receipt(@Param("id") id: string) {
    // REP-01: the booking's checkout breakdown + payout statement. A booking exists
    // only after confirmation, so the captured split is final (BKG-03 snapshots).
    const b = await this.requireBooking(id);
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

  @UseGuards(AuthGuard)
  @Get("offers/:id")
  async getOffer(@Param("id") id: string, @CurrentUser() user?: TokenPayload) {
    const offer = await this.requireOffer(id);
    // Offer terms are commercial — the professional, clinic of record, or staff only.

    if (!this.isStaff(user)) {
      const me = await this.identityOf(user);
      const isPro = me.professionalId === offer.professionalId;
      const isClinic = me.memberships.some((m) => m.workspaceId === offer.clinicWorkspaceId);
      if (!isPro && !isClinic) {
        throw new ForbiddenException("not a party to this offer");
      }

    }
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

  // ----- Authority (§3) -----------------------------------------------------------
  //
  // A token proves possession of a phone; it does NOT carry what that phone may do. These
  // helpers resolve the caller's real parties from the identity graph and check authority
  // against them. Previously the controller read `actorRole` and party ids straight from the
  // request body, so `can(role, capability)` was asking the attacker to grade their own work.

  /** Internal platform staff act across tenants by design (Ops/Finance/Admin, §3). */
  private isStaff(user?: TokenPayload): boolean {
    return user?.role === "operations" || user?.role === "finance" || user?.role === "administrator";
  }

  private async identityOf(user?: TokenPayload): Promise<CallerIdentity> {
    if (!user?.sub) throw new UnauthorizedException("authentication required");
    return this.repo.resolveIdentity(user.sub);
  }

  /** Read access for a clinic member (any role) or staff — no specific capability needed. */
  private async requireClinicMember(user: TokenPayload | undefined, workspaceId: string) {
    if (this.isStaff(user)) return;
    const me = await this.identityOf(user);
    if (!me.memberships.some((m) => m.workspaceId === workspaceId)) {
      throw new ForbiddenException("not a member of this clinic workspace");
    }
  }

  /**
   * The caller acting as this professional. Staff may act on a professional's behalf
   * (support flows); anyone else must BE them.
   */
  private async requireProfessional(user: TokenPayload | undefined, professionalId: string) {
    if (this.isStaff(user)) return;
    const me = await this.identityOf(user);
    if (me.professionalId !== professionalId) {
      throw new ForbiddenException("not your professional profile");
    }
  }

  /**
   * The caller acting for this clinic workspace, with the authority the action needs.
   * Membership decides the role (§3), so clinic_staff cannot bind terms or move money no
   * matter what the request claims.
   */
  private async requireClinicAuthority(
    user: TokenPayload | undefined,
    workspaceId: string,
    capability: Capability,
  ): Promise<Role> {
    // Cross-tenant staff support (ADM-01) is for operations/administrator only. Finance
    // holds money capabilities of its own and must not inherit clinic.pay / send_offer via
    // the old "any staff" bypass.
    if (user?.role === "operations" || user?.role === "administrator") {
      return "administrator";
    }
    if (user?.role === "finance") {
      throw new ForbiddenException(`role finance cannot ${capability}`);
    }
    const me = await this.identityOf(user);
    const membership = me.memberships.find((m) => m.workspaceId === workspaceId);
    if (!membership) throw new ForbiddenException("not a member of this clinic workspace");
    if (!can(membership.role, capability)) {
      throw new ForbiddenException(`role ${membership.role} cannot ${capability}`);
    }
    return membership.role;
  }

  /**
   * Which side of a booking the caller is on. Returns null for staff, who are neither party
   * but may act on both. Used to derive the cancellation actor and review author rather than
   * letting the caller declare which party they are.
   */
  private async partyInBooking(
    user: TokenPayload | undefined,
    booking: { clinicWorkspaceId: string; professionalId: string },
  ): Promise<"clinic" | "professional" | "staff"> {
    if (this.isStaff(user)) return "staff";
    const me = await this.identityOf(user);
    if (me.professionalId && me.professionalId === booking.professionalId) return "professional";
    if (me.memberships.some((m) => m.workspaceId === booking.clinicWorkspaceId)) return "clinic";
    throw new ForbiddenException("not a party to this booking");
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

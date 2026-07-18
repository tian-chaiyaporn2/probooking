import { prisma } from "@probook/db";
import {
  autoAcceptDueAt,
  advanceBooking,
  advanceVerification,
  aggregateRating,
  ratingFromCounts,
  DEFAULT_SERVICE_FEE_BPS,
} from "@probook/domain";
import { ConflictError, isConflict } from "./errors.util.js";
import { encryptField, decryptField, blindIndex } from "./field-crypto.js";

/** Shape of the fields a terms snapshot freezes. Structural, so both Shift reads fit. */
interface SnapshotableShift {
  id: string;
  category: string;
  scope: string;
  urgency: string;
  compensation: number;
  insuranceRequired: boolean;
  startsAt: Date;
  endsAt: Date;
}

/**
 * OFF-02/BKG-03: freeze what was actually agreed, at the moment it was agreed.
 *
 * The Shift row is mutable and `termsLocked` is only set after the offer is written, so
 * reconstructing terms from the live shift later is not sound — a compensation dispute six
 * months on needs the numbers as they stood. Stored as JSON so adding a term never
 * rewrites history for existing rows.
 */
function buildTermsSnapshot(shift: SnapshotableShift, expiresAt: number) {
  return {
    version: 1,
    shiftId: shift.id,
    category: shift.category,
    scope: shift.scope,
    urgency: shift.urgency,
    compensation: shift.compensation, // integer satang
    insuranceRequired: shift.insuranceRequired,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
    serviceFeeBps: Number(process.env.SERVICE_FEE_BPS ?? DEFAULT_SERVICE_FEE_BPS),
    offerExpiresAt: new Date(expiresAt).toISOString(),
    capturedAt: new Date().toISOString(),
  };
}
import type {
  OfferState,
  BookingState,
  PayoutState,
  CaseState,
  VerificationState,
  ShiftUrgency,
  RatingSummary,
  Role,
} from "@probook/domain";
import type {
  MarketplaceRepository,
  OfferRecord,
  BookingRecord,
  BookingDetail,
  ShiftPostInput,
  ShiftRecord,
  Candidate,
  CreateOfferForShiftInput,
  ConfirmBookingInput,
  ConfirmBookingResult,
  PayoutInput,
  PayoutResult,
  ReviewCase,
  CancelInput,
  CancelResult,
  RegisterClinicInput,
  RegisterProfessionalInput,
  EntityRef,
  OfferEligibility,
  ReviewInput,
  ReviewResult,
  NotificationInput,
  OpenShift,
  CaseSummary,
  PendingVerification,
  ActiveBookingRow,
  AvailabilityBlock,
  ShiftFilters,
  ProfessionalFilters,
  ProfessionalSearchResult,
  MessageRecord,
  BookingContact,
  InsuranceStatus,
  Reconciliation,
  VerifiedProfile,
  BookingHistoryRow,
  FinanceExportRow,
  MarketplaceMetrics,
  AuditEntry,
  AuditRow,
  CallerIdentity,
  MeIdentity,
  ClinicShiftRow,
  ProfessionalOfferRow,
  ApprovalRequestRecord,
  CreateApprovalInput,
  ExecuteApprovalInput,
} from "./marketplace.types.js";

const SHIFT_LENGTH_MS = 4 * 60 * 60 * 1000;

/** Row -> port record. Timestamps are epoch ms UTC across the port (see AuditRow). */
function toApproval(r: {
  id: string;
  capability: string;
  refType: string;
  refId: string;
  amount: number;
  reason: string;
  state: string;
  initiatorId: string;
  initiatorRole: string;
  executorId: string | null;
  executorRole: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}): ApprovalRequestRecord {
  return {
    id: r.id,
    capability: r.capability,
    refType: r.refType,
    refId: r.refId,
    amount: r.amount,
    reason: r.reason,
    state: r.state as ApprovalRequestRecord["state"],
    initiatorId: r.initiatorId,
    initiatorRole: r.initiatorRole,
    executorId: r.executorId,
    executorRole: r.executorRole,
    createdAt: r.createdAt.getTime(),
    decidedAt: r.decidedAt ? r.decidedAt.getTime() : null,
  };
}

type OfferWithShift = {
  id: string;
  professionalId: string;
  state: string;
  sentAt: Date;
  expiresAt: Date;
  fundingDueAt: Date | null;
  termsSnapshot?: unknown;
  shift: { id: string; workspaceId: string; compensation: number; urgency: string; startsAt: Date };
};

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/**
 * Postgres-backed implementation via @probook/db (Prisma). Persists the real graph:
 * registered ClinicWorkspace (+ owner User + Membership) and ProfessionalProfile
 * (+ User, Credential, PayoutAccount) that Operations verifies (VER-01/02), then a
 * Shift, the Offer, and — on confirmation — the Booking plus its Payment Protected
 * money records, all in one transaction (BKG-02). Booking's unique constraints on
 * shiftId/offerId enforce §6.4 at the database level.
 */
export class PrismaMarketplaceStore implements MarketplaceRepository {
  async registerClinic(
    input: RegisterClinicInput,
  ): Promise<EntityRef & { ownerUserId: string }> {
    // One transaction (ORG-01). These were three sequential writes: if the workspace or
    // membership failed after the User committed, an orphan User kept the phone forever —
    // every retry then died on User_phone_key and the API reported "owner phone already
    // registered" for a clinic that does not exist. The user is locked out with no
    // self-service recovery, which is the worst kind of half-registration.
    return prisma.$transaction(async (tx) => {
      const owner = await tx.user.create({
        // Phone encrypted at rest; the blind index carries lookup + uniqueness.
        data: { phone: encryptField(input.ownerPhone), phoneHash: blindIndex(input.ownerPhone) },
      });
      const clinic = await tx.clinicWorkspace.create({
        data: {
          branchName: input.branchName,
          // Encrypted at rest (§7.3): a DB dump yields ciphertext, not a clinic's licence
          // number and street address. Neither is read back in any app flow, so there is no
          // decrypt path to add — only the write is wrapped.
          licenceNo: encryptField(input.licenceNo),
          address: encryptField(input.address),
          verification: "Submitted",
        },
      });
      await tx.membership.create({
        data: { userId: owner.id, workspaceId: clinic.id, role: "clinic_owner" },
      });
      return { id: clinic.id, verification: "Submitted" as const, ownerUserId: owner.id };
    });
  }

  async registerProfessional(input: RegisterProfessionalInput): Promise<EntityRef> {
    // One transaction (PRO-01), same reasoning as registerClinic: a partial registration
    // burns the phone number permanently. A professional with a User but no profile also
    // resolves to an identity with no professionalId, so they could authenticate and then
    // be refused every action they tried.
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { phone: encryptField(input.phone), phoneHash: blindIndex(input.phone) },
      });
      const profile = await tx.professionalProfile.create({
        data: {
          userId: user.id,
          displayName: input.displayName,
          profession: input.profession,
          verification: "Submitted",
        },
      });
      await tx.credential.create({
        data: { professionalId: profile.id, kind: "licence", state: "Submitted" },
      });
      await tx.payoutAccount.create({
        data: { professionalId: profile.id, bankRefMasked: input.payoutRef, verified: false },
      });
      return { id: profile.id, verification: "Submitted" as const };
    });
  }

  async verifyClinic(id: string): Promise<EntityRef | null> {
    return this.setClinicVerification(id, "Verified");
  }

  async verifyProfessional(id: string): Promise<EntityRef | null> {
    return this.setProfessionalVerification(id, "Verified");
  }

  async setClinicVerification(id: string, target: VerificationState): Promise<EntityRef | null> {
    const clinic = await prisma.clinicWorkspace.findUnique({ where: { id } });
    if (!clinic) return null;
    if (clinic.verification === target) return { id, verification: target };
    const next = advanceVerification(clinic.verification as VerificationState, target);
    await prisma.clinicWorkspace.update({ where: { id }, data: { verification: next } });
    return { id, verification: next };
  }

  async setProfessionalVerification(id: string, target: VerificationState): Promise<EntityRef | null> {
    const p = await prisma.professionalProfile.findUnique({ where: { id } });
    if (!p) return null;
    if (p.verification === target) return { id, verification: target };
    const next = advanceVerification(p.verification as VerificationState, target);
    if (target === "Verified") {
      await prisma.$transaction([
        prisma.professionalProfile.update({ where: { id }, data: { verification: next } }),
        prisma.credential.updateMany({
          where: { professionalId: id, kind: "licence" },
          data: { state: "Verified" },
        }),
        prisma.credential.updateMany({
          where: { professionalId: id, kind: "licence", validUntil: null },
          data: { validUntil: new Date(Date.now() + TWO_YEARS_MS) },
        }),
        prisma.payoutAccount.updateMany({ where: { professionalId: id }, data: { verified: true } }),
      ]);
    } else {
      await prisma.professionalProfile.update({ where: { id }, data: { verification: next } });
    }
    return { id, verification: next };
  }

  async clinicVerification(id: string): Promise<VerificationState | null> {
    const c = await prisma.clinicWorkspace.findUnique({
      where: { id },
      select: { verification: true },
    });
    return c ? (c.verification as VerificationState) : null;
  }

  async getOfferEligibility(offerId: string): Promise<OfferEligibility | null> {
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        shift: { include: { workspace: true } },
        professional: { include: { insurance: true, credentials: true } },
      },
    });
    if (!offer) return null;
    const insuranceRequired = offer.shift.insuranceRequired;
    const shiftEnd = offer.shift.endsAt.getTime();
    const insuranceValid =
      !insuranceRequired ||
      offer.professional.insurance.some(
        (i) => i.state === "Verified" && i.validUntil !== null && i.validUntil.getTime() >= shiftEnd,
      );
    // VER-04: the licence credential gates confirmation — a suspended or expired
    // licence must block the booking even after the offer was accepted. Fail closed:
    // missing, unverified, or null-expiry licences are not valid through the shift.
    const licence = offer.professional.credentials.find((c) => c.kind === "licence");
    const professionalNotSuspended = licence?.state !== "Suspended";
    const licenceValidThroughShiftEnd =      licence?.state === "Verified" &&
      licence.validUntil !== null &&
      licence.validUntil.getTime() >= shiftEnd;
    // Specialty evidence is optional: absent → nothing to invalidate; present → must cover
    // the shift end and not be Suspended (same shape as licence).
    const specialty = offer.professional.credentials.find((c) => c.kind === "specialty_evidence");
    const specialtyValidThroughShiftEnd =
      !specialty ||
      (specialty.state !== "Suspended" &&
        (!specialty.validUntil || specialty.validUntil.getTime() >= shiftEnd));    return {
      clinicVerified: offer.shift.workspace.verification === "Verified",
      professionalVerified: offer.professional.verification === "Verified",
      professionalNotSuspended,
      licenceValidThroughShiftEnd,
      specialtyValidThroughShiftEnd,
      insuranceRequired,
      insuranceValidThroughShiftEnd: insuranceValid,
    };
  }

  async submitInsurance(professionalId: string, validUntil: number): Promise<InsuranceStatus> {
    // professionalId is unique, so upsert is deterministic (no findFirst race / dup rows).
    const rec = await prisma.insuranceEvidence.upsert({
      where: { professionalId },
      update: { state: "Submitted", validUntil: new Date(validUntil) },
      create: { professionalId, state: "Submitted", validUntil: new Date(validUntil) },
    });
    return { state: rec.state, validUntil: rec.validUntil ? rec.validUntil.getTime() : null };
  }

  async verifyInsurance(professionalId: string): Promise<InsuranceStatus | null> {
    const ins = await prisma.insuranceEvidence.findUnique({ where: { professionalId } });
    if (!ins) return null;
    if (ins.state !== "Verified") {
      const next = advanceVerification(ins.state as VerificationState, "Verified");
      const updated = await prisma.insuranceEvidence.update({
        where: { professionalId },
        data: { state: next },
      });
      return { state: updated.state, validUntil: updated.validUntil ? updated.validUntil.getTime() : null };
    }
    return { state: ins.state, validUntil: ins.validUntil ? ins.validUntil.getTime() : null };
  }

  async getInsuranceStatus(professionalId: string): Promise<InsuranceStatus> {
    const ins = await prisma.insuranceEvidence.findUnique({ where: { professionalId } });
    if (!ins) return { state: "NotProvided", validUntil: null };
    return { state: ins.state, validUntil: ins.validUntil ? ins.validUntil.getTime() : null };
  }

  async postShift(input: ShiftPostInput): Promise<{ shiftId: string }> {
    const shift = await prisma.shift.create({
      data: {
        workspaceId: input.clinicWorkspaceId,
        state: "Published",
        urgency: input.urgency,
        category: input.category,
        scope: input.category,
        startsAt: new Date(input.shiftStart),
        endsAt: new Date(input.shiftStart + SHIFT_LENGTH_MS),
        compensation: input.compensation,
        insuranceRequired: input.insuranceRequired,
        termsLocked: false,
      },
    });
    return { shiftId: shift.id };
  }

  async getShift(id: string): Promise<ShiftRecord | null> {
    const s = await prisma.shift.findUnique({
      where: { id },
      include: { offers: { select: { state: true } }, booking: { select: { id: true } } },
    });
    if (!s) return null;
    return {
      id: s.id,
      clinicWorkspaceId: s.workspaceId,
      category: s.category,
      compensation: s.compensation,
      urgency: s.urgency as ShiftUrgency,
      startsAt: s.startsAt.getTime(),
      state: s.state,
      hasActiveOffer: s.offers.some((o) => o.state === "PendingResponse" || o.state === "AwaitingPayment"),
      booked: s.booking !== null,
    };
  }

  async applyToShift(shiftId: string, professionalId: string): Promise<{ id: string }> {
    const a = await prisma.application.create({
      data: { shiftId, professionalId, state: "Submitted" },
    });
    return { id: a.id };
  }

  async inviteToShift(shiftId: string, professionalId: string): Promise<{ id: string }> {
    const i = await prisma.invitation.create({
      data: { shiftId, professionalId, state: "Sent" },
    });
    return { id: i.id };
  }

  async listShiftCandidates(shiftId: string): Promise<Candidate[]> {
    const apps = await prisma.application.findMany({
      where: { shiftId },
      include: {
        professional: { select: { id: true, displayName: true, profession: true, verification: true } },
      },
    });
    const invs = await prisma.invitation.findMany({
      where: { shiftId },
      include: {
        professional: { select: { id: true, displayName: true, profession: true, verification: true } },
      },
    });
    return [
      ...apps.map((a) => ({
        professionalId: a.professionalId,
        via: "application" as const,
        state: a.state,
        displayName: a.professional.displayName,
        profession: a.professional.profession,
        verification: a.professional.verification,
      })),
      ...invs.map((i) => ({
        professionalId: i.professionalId,
        via: "invitation" as const,
        state: i.state,
        displayName: i.professional.displayName,
        profession: i.professional.profession,
        verification: i.professional.verification,
      })),
    ];
  }

  async createOfferForShift(input: CreateOfferForShiftInput): Promise<OfferRecord> {
    // Atomic: create the one binding offer, mark the applicant OfferSent, lock terms (SHF-04).
    const offer = await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findUnique({ where: { id: input.shiftId } });
      if (!shift) throw new Error("shift not found");
      const o = await tx.offer.create({
        data: {
          shiftId: input.shiftId,
          professionalId: input.professionalId,
          state: "PendingResponse",
          // OFF-02/BKG-03: an immutable record of exactly what was offered. This was `{}`,
          // so the "immutable snapshot" a compensation dispute would rely on held nothing —
          // and the Shift row it would otherwise be reconstructed from is mutable.
          termsSnapshot: buildTermsSnapshot(shift, input.expiresAt),
          sentAt: new Date(input.sentAt),
          expiresAt: new Date(input.expiresAt),
        },
        include: { shift: true },
      });
      await tx.application.updateMany({
        where: { shiftId: input.shiftId, professionalId: input.professionalId },
        data: { state: "OfferSent" },
      });
      await tx.shift.update({ where: { id: input.shiftId }, data: { termsLocked: true } });
      return o;
    });
    return this.toRecord(offer as OfferWithShift);
  }

  async getOffer(id: string): Promise<OfferRecord | null> {
    const offer = await prisma.offer.findUnique({ where: { id }, include: { shift: true } });
    return offer ? this.toRecord(offer as OfferWithShift) : null;
  }

  async addAvailability(
    professionalId: string,
    startsAt: number,
    endsAt: number,
    openToRequests: boolean,
  ): Promise<AvailabilityBlock> {
    const a = await prisma.availability.create({
      data: { professionalId, startsAt: new Date(startsAt), endsAt: new Date(endsAt), openToRequests },
    });
    return { id: a.id, startsAt: a.startsAt.getTime(), endsAt: a.endsAt.getTime(), openToRequests: a.openToRequests };
  }

  async listAvailability(professionalId: string): Promise<AvailabilityBlock[]> {
    const list = await prisma.availability.findMany({
      where: { professionalId },
      orderBy: { startsAt: "asc" },
    });
    return list.map((a) => ({
      id: a.id,
      startsAt: a.startsAt.getTime(),
      endsAt: a.endsAt.getTime(),
      openToRequests: a.openToRequests,
    }));
  }

  async hasScheduleOverlap(
    professionalId: string,
    startsAt: number,
    endsAt: number,
    opts?: { excludeOfferId?: string },
  ): Promise<boolean> {
    // Overlap when an active booking's shift spans into [startsAt, endsAt).
    const bookingCount = await prisma.booking.count({
      where: {
        professionalId,
        state: { in: ["Confirmed", "InProgress", "AwaitingCompletion"] },
        shift: { startsAt: { lt: new Date(endsAt) }, endsAt: { gt: new Date(startsAt) } },
      },
    });
    if (bookingCount > 0) return true;
    // Soft holds (AwaitingPayment) also block the window — AVL-03 / §6.3.
    const softHoldCount = await prisma.offer.count({
      where: {
        professionalId,
        state: "AwaitingPayment",
        ...(opts?.excludeOfferId ? { id: { not: opts.excludeOfferId } } : {}),
        shift: { startsAt: { lt: new Date(endsAt) }, endsAt: { gt: new Date(startsAt) } },
      },
    });
    return softHoldCount > 0;
  }

  async searchProfessionals(filters: ProfessionalFilters): Promise<ProfessionalSearchResult[]> {
    const pros = await prisma.professionalProfile.findMany({
      where: {
        verification: "Verified",
        ...(filters.profession ? { profession: filters.profession } : {}),
        ...(filters.specialty ? { specialty: filters.specialty } : {}),
      },
      select: { id: true, displayName: true, profession: true, specialty: true },
      take: 50,
    });
    if (pros.length === 0) return [];

    // One grouped query for every result's rating, not one query per result. This was a
    // 51-round-trip N+1 on a search endpoint, and each of those trips scanned Review
    // unindexed — so search cost grew with the whole review table, per result.
    const grouped = await prisma.review.groupBy({
      by: ["subjectId"],
      where: { subjectId: { in: pros.map((p) => p.id) }, publishedAt: { not: null } },
      _count: { score: true },
      _avg: { score: true },
    });
    const ratings = new Map(grouped.map((g) => [g.subjectId, g]));

    return pros.map((p) => {
      const g = ratings.get(p.id);
      // REV-04's cold-start floor (>= 3 published reviews) stays a domain decision.
      const summary = g ? ratingFromCounts(g._count.score, g._avg.score ?? 0) : null;
      return {
        id: p.id,
        displayName: p.displayName,
        profession: p.profession,
        specialty: p.specialty,
        rating: summary ? summary.average : null,
      };
    });
  }

  async listOpenShifts(filters?: ShiftFilters): Promise<OpenShift[]> {
    // Open = Published, unbooked, and with no active offer yet — priority-ordered:
    // urgent first (enum sorts "urgent" > "standard"), then soonest (SRC-03 deterministic).
    const shifts = await prisma.shift.findMany({
      where: {
        state: "Published",
        booking: null,
        offers: { none: { state: { in: ["PendingResponse", "AwaitingPayment"] } } },
        ...(filters?.urgency ? { urgency: filters.urgency } : {}),
        ...(filters?.category ? { category: { contains: filters.category, mode: "insensitive" as const } } : {}),
        ...(filters?.minCompensation !== undefined || filters?.maxCompensation !== undefined
          ? {
              compensation: {
                ...(filters?.minCompensation !== undefined ? { gte: filters.minCompensation } : {}),
                ...(filters?.maxCompensation !== undefined ? { lte: filters.maxCompensation } : {}),
              },
            }
          : {}),
      },
      select: { id: true, category: true, compensation: true, urgency: true, startsAt: true, endsAt: true, workspace: { select: { branchName: true, verification: true } } },
      orderBy: [{ urgency: "desc" }, { startsAt: "asc" }],
    });
    return shifts.map((s) => ({
      shiftId: s.id,
      category: s.category,
      compensation: s.compensation,
      startsAt: s.startsAt.getTime(),
      endsAt: s.endsAt.getTime(),
      urgency: s.urgency as ShiftUrgency,
      urgent: s.urgency === "urgent",
      clinicName: s.workspace.branchName,
      clinicVerified: s.workspace.verification === "Verified",
    }));
  }

  async setOfferState(
    id: string,
    state: OfferState,
    opts?: { fundingDueAt?: number; from?: OfferState },
  ): Promise<OfferRecord | null> {
    const data = {
      state,
      ...(opts?.fundingDueAt !== undefined ? { fundingDueAt: new Date(opts.fundingDueAt) } : {}),
    };
    if (opts?.from !== undefined) {
      const claimed = await prisma.offer.updateMany({
        where: { id, state: opts.from },
        data,
      });
      if (claimed.count !== 1) return null;
      const offer = await prisma.offer.findUnique({ where: { id }, include: { shift: true } });
      return offer ? this.toRecord(offer as OfferWithShift) : null;
    }
    const offer = await prisma.offer.update({
      where: { id },
      data,
      include: { shift: true },
    });
    return this.toRecord(offer as OfferWithShift);
  }

  async expireStaleOffers(now: number): Promise<number> {
    // Prefer not treating fundingDueAt: null as already due — that would expire
    // AwaitingPayment offers that have not yet stamped a funding window.
    const nowDate = new Date(now);
    const [pending, awaiting] = await Promise.all([
      prisma.offer.updateMany({
        where: { state: "PendingResponse", expiresAt: { lte: nowDate } },
        data: { state: "Expired" },
      }),
      prisma.offer.updateMany({
        where: {
          state: "AwaitingPayment",
          fundingDueAt: { not: null, lte: nowDate },
        },
        data: { state: "Expired" },
      }),
    ]);
    return pending.count + awaiting.count;
  }

  async confirmBooking(input: ConfirmBookingInput): Promise<ConfirmBookingResult> {
    // Atomic (BKG-02): offer -> Converted + booking + Payment Protected money records
    // all commit together, or none do.
    return prisma.$transaction(async (tx) => {
      // OFF-03/§6.3: only an offer still awaiting payment converts. The caller checked this
      // on a snapshot read taken before the eligibility round-trip; a withdrawal or expiry
      // committing in between would otherwise be converted into a live booking anyway.
      const converted = await tx.offer.updateMany({
        where: { id: input.offerId, state: "AwaitingPayment" },
        data: { state: "Converted" },
      });
      if (converted.count !== 1) {
        throw new ConflictError("offer is no longer awaiting payment (concurrent update)");
      }
      const offer = await tx.offer.findUniqueOrThrow({ where: { id: input.offerId } });
      const booking = await tx.booking.create({
        data: {
          offerId: input.offerId,
          shiftId: input.shiftId,
          professionalId: input.professionalId,
          state: "Confirmed",
          // BKG-03: carry the offer's frozen terms forward verbatim. Re-deriving them from
          // the shift here would silently record post-offer edits as what was agreed.
          termsSnapshot: offer.termsSnapshot ?? {},
          feeSnapshot: input.allocation.serviceFee,
          taxSnapshot: input.allocation.tax,
        },
      });
      const paymentOrder = await tx.paymentOrder.create({
        data: {
          bookingId: booking.id,
          state: "PaymentProtected", // funds captured/guaranteed (PAY-01, BKG-01)
          captured: input.captured,
        },
      });
      await tx.financialAllocation.create({
        data: {
          paymentOrderId: paymentOrder.id,
          compensation: input.allocation.compensation,
          serviceFee: input.allocation.serviceFee,
          tax: input.allocation.tax,
        },
      });
      // Immutable collection event, idempotent by key (PAY-04/05).
      await tx.financialEvent.create({
        data: {
          paymentOrderId: paymentOrder.id,
          type: "Collection",
          amount: input.captured,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return {
        booking: {
          id: booking.id,
          offerId: booking.offerId,
          shiftId: booking.shiftId,
          professionalId: booking.professionalId,
          state: "Confirmed" as const,
        },
        paymentOrderId: paymentOrder.id,
      };
    });
  }

  async getBookingByOffer(offerId: string): Promise<BookingRecord | null> {
    const booking = await prisma.booking.findUnique({ where: { offerId } });
    return booking
      ? {
          id: booking.id,
          offerId: booking.offerId,
          shiftId: booking.shiftId,
          professionalId: booking.professionalId,
          state: booking.state as BookingRecord["state"],
        }
      : null;
  }

  async resolveIdentity(phone: string): Promise<CallerIdentity> {
    const user = await prisma.user.findUnique({
      where: { phoneHash: blindIndex(phone) },
      include: { professional: { select: { id: true } }, memberships: true },
    });
    if (!user) return { userId: null, professionalId: null, memberships: [] };
    return {
      userId: user.id,
      professionalId: user.professional?.id ?? null,
      memberships: user.memberships.map((m) => ({
        workspaceId: m.workspaceId,
        role: m.role as Role,
      })),
    };
  }

  async describeMe(phone: string): Promise<MeIdentity> {
    const user = await prisma.user.findUnique({
      where: { phoneHash: blindIndex(phone) },
      include: {
        professional: { select: { id: true, displayName: true, verification: true } },
        memberships: { include: { workspace: { select: { branchName: true, verification: true } } } },
      },
    });
    if (!user) {
      return { professionalId: null, professionalName: null, professionalVerification: null, clinics: [] };
    }
    return {
      professionalId: user.professional?.id ?? null,
      professionalName: user.professional?.displayName ?? null,
      professionalVerification: user.professional?.verification ?? null,
      clinics: user.memberships.map((m) => ({
        workspaceId: m.workspaceId,
        name: m.workspace.branchName,
        role: m.role as Role,
        verification: m.workspace.verification,
      })),
    };
  }

  async listClinicShifts(workspaceId: string): Promise<ClinicShiftRow[]> {
    const shifts = await prisma.shift.findMany({
      where: { workspaceId },
      orderBy: { startsAt: "asc" },
      take: 100,
      include: {
        _count: { select: { applications: true, invitations: true } },
        offers: {
          select: {
            id: true,
            state: true,
            professionalId: true,
            professional: { select: { displayName: true } },
          },
          orderBy: { sentAt: "desc" },
        },
        booking: { select: { id: true } },
      },
    });
    return shifts.map((s) => {
      const active = s.offers.find((o) => o.state === "PendingResponse" || o.state === "AwaitingPayment");
      return {
        shiftId: s.id,
        category: s.category,
        compensation: s.compensation,
        urgency: s.urgency,
        startsAt: s.startsAt.getTime(),
        state: s.state,
        hasActiveOffer: active !== undefined,
        booked: s.booking !== null,
        candidateCount: s._count.applications + s._count.invitations,
        offer: active
          ? {
              id: active.id,
              state: active.state,
              professionalId: active.professionalId,
              professionalName: active.professional.displayName,
            }
          : null,
      };
    });
  }

  async listProfessionalOffers(professionalId: string): Promise<ProfessionalOfferRow[]> {
    const offers = await prisma.offer.findMany({
      where: { professionalId },
      orderBy: { sentAt: "desc" },
      take: 100,
      include: {
        shift: {
          select: {
            id: true,
            category: true,
            compensation: true,
            urgency: true,
            startsAt: true,
            endsAt: true,
            workspace: { select: { branchName: true, verification: true } },
          },
        },
      },
    });
    return offers.map((o) => ({
      offerId: o.id,
      shiftId: o.shift.id,
      category: o.shift.category,
      compensation: o.shift.compensation,
      urgency: o.shift.urgency,
      shiftStart: o.shift.startsAt.getTime(),
      shiftEnd: o.shift.endsAt.getTime(),
      state: o.state,
      expiresAt: o.expiresAt.getTime(),
      clinicName: o.shift.workspace.branchName,
      clinicVerified: o.shift.workspace.verification === "Verified",
    }));
  }

  // ----- §6.4 dual control -----

  async createApproval(input: CreateApprovalInput): Promise<ApprovalRequestRecord> {
    const r = await prisma.approvalRequest.create({ data: { ...input, state: "Pending" } });
    return toApproval(r);
  }

  async getApproval(id: string): Promise<ApprovalRequestRecord | null> {
    const r = await prisma.approvalRequest.findUnique({ where: { id } });
    return r ? toApproval(r) : null;
  }

  async listPendingApprovals(): Promise<ApprovalRequestRecord[]> {
    const rows = await prisma.approvalRequest.findMany({
      where: { state: "Pending" },
      // Newest first: a fresh proposal awaiting a second approver must surface, not be hidden
      // behind 100 stale ones once the cap is reached.
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map(toApproval);
  }

  async executeApproval(input: ExecuteApprovalInput): Promise<{ refund: number; bookingId: string }> {
    return prisma.$transaction(async (tx) => {
      const req = await tx.approvalRequest.findUnique({ where: { id: input.approvalId } });
      if (!req) throw new Error("approval request not found");

      // Claim the request as part of the write. Two approvers clicking at once would
      // otherwise both read Pending and both write a refund event against one captured sum.
      const claimed = await tx.approvalRequest.updateMany({
        where: { id: input.approvalId, state: "Pending" },
        data: {
          state: "Executed",
          executorId: input.executorId,
          executorRole: input.executorRole,
          decidedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictError("approval request is no longer pending (concurrent update)");
      }

      const po = await tx.paymentOrder.findUnique({
        where: { bookingId: req.refId },
        include: { allocation: true, events: true },
      });
      if (!po?.allocation) throw new Error("no payment allocation for booking");
      // PAY-08 inside the transaction: prior refunds must not exceed captured.
      const alreadyRefunded = po.events
        .filter((e) => e.type === "Refund")
        .reduce((s, e) => s + e.amount, 0);
      if (alreadyRefunded + req.amount > po.captured) {
        throw new ConflictError(
          `ALLOCATION_EXCEEDED: refund of ${req.amount} exceeds remaining ${po.captured - alreadyRefunded}`,
        );
      }

      // PAY-05/06: the money moves as an immutable event, exactly like every other path —
      // staff never edit a balance. PAY-04 idempotency is the unique key.
      await tx.financialEvent.create({
        data: {
          paymentOrderId: po.id,
          type: "Refund",
          amount: req.amount,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await tx.financialAllocation.update({
        where: { paymentOrderId: po.id },
        data: { refundState: "PartiallyRefunded" },
      });
      return { refund: req.amount, bookingId: req.refId };
    });
  }
  async refundAvailable(bookingId: string): Promise<number> {
    const po = await prisma.paymentOrder.findUnique({
      where: { bookingId },
      include: { events: { where: { type: "Refund" }, select: { amount: true } } },
    });
    if (!po) return 0;
    const refunded = po.events.reduce((s, e) => s + e.amount, 0);
    const pending = await prisma.approvalRequest.aggregate({
      where: { refType: "Booking", refId: bookingId, state: "Pending", capability: "finance.execute_refund" },
      _sum: { amount: true },
    });
    return Math.max(0, po.captured - refunded - (pending._sum.amount ?? 0));
  }

  async sumRefunded(bookingId: string): Promise<number> {
    const po = await prisma.paymentOrder.findUnique({
      where: { bookingId },
      select: { id: true },
    });
    if (!po) return 0;
    const agg = await prisma.financialEvent.aggregate({
      where: { paymentOrderId: po.id, type: "Refund" },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }

  async sumPaidOut(bookingId: string): Promise<number> {
    const po = await prisma.paymentOrder.findUnique({
      where: { bookingId },
      select: { id: true },
    });
    if (!po) return 0;
    const agg = await prisma.financialEvent.aggregate({
      where: { paymentOrderId: po.id, type: "Payout" },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }

  async getBooking(id: string): Promise<BookingDetail | null> {
    const b = await prisma.booking.findUnique({
      where: { id },
      include: { paymentOrder: { include: { allocation: true } }, shift: true },
    });
    if (!b) return null;
    const alloc = b.paymentOrder?.allocation ?? null;
    return {
      id: b.id,
      offerId: b.offerId,
      shiftId: b.shiftId,
      clinicWorkspaceId: b.shift.workspaceId,
      professionalId: b.professionalId,
      state: b.state as BookingState,
      compensation: alloc?.compensation ?? 0,
      serviceFee: alloc?.serviceFee ?? b.feeSnapshot,
      tax: alloc?.tax ?? b.taxSnapshot,
      captured: b.paymentOrder?.captured ?? 0,
      payoutState: (alloc?.payoutState ?? "NotEligible") as PayoutState,
      paymentOrderId: b.paymentOrder?.id ?? null,
      heldAt: b.heldAt ? b.heldAt.getTime() : null,
      shiftStart: b.shift.startsAt.getTime(),
      shiftEnd: b.shift.endsAt.getTime(),
    };
  }

  async hasArrived(bookingId: string): Promise<boolean> {
    // CAN-03 evidence: an Arrived (or Completed, which implies arrival) attendance event.
    const count = await prisma.attendanceEvent.count({
      where: { bookingId, kind: { in: ["Arrived", "Completed"] } },
    });
    return count > 0;
  }

  async recordArrival(bookingId: string): Promise<boolean> {
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b) return false;
    const existing = await prisma.attendanceEvent.count({ where: { bookingId, kind: "Arrived" } });
    if (existing > 0) return true; // idempotent: arriving twice is one arrival
    await prisma.attendanceEvent.create({
      data: { bookingId, kind: "Arrived", actorId: b.professionalId },
    });
    return true;
  }

  async getAutoAcceptDueAt(bookingId: string): Promise<number | null> {
    const b = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { autoAcceptAt: true },
    });
    return b?.autoAcceptAt ? b.autoAcceptAt.getTime() : null;
  }

  async suspendCredential(professionalId: string): Promise<boolean> {
    const cred = await prisma.credential.findFirst({
      where: { professionalId, kind: "licence" },
    });
    if (!cred) return false;
    if (cred.state === "Suspended") return true; // idempotent
    const next = advanceVerification(cred.state as VerificationState, "Suspended");
    await prisma.credential.update({ where: { id: cred.id }, data: { state: next } });
    return true;
  }

  async holdBooking(bookingId: string, reason: string): Promise<BookingDetail | null> {
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b) return null;
    if (!b.heldAt) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { heldAt: new Date(), heldReason: reason },
      });
    }
    return this.getBooking(bookingId);
  }

  async resolveHold(bookingId: string): Promise<BookingDetail | null> {
    const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { shift: true } });
    if (!b) return null;
    // CMP-03: restart the 24h auto-accept clock from the resolution, not from the original
    // completion. A booking held for five days would otherwise have a deadline five days in
    // the past, so the very next sweep (within 60s) would auto-accept and pay out — giving
    // the clinic no window to contest a completion that was under investigation the whole time.
    const autoAcceptAt =
      b.autoAcceptAt !== null
        ? new Date(autoAcceptDueAt(b.shift.endsAt.getTime(), Date.now()))
        : null;
    await prisma.booking.update({
      where: { id: bookingId },
      data: { heldAt: null, heldReason: null, autoAcceptAt },
    });
    return this.getBooking(bookingId);
  }

  async markCompletion(id: string): Promise<BookingDetail | null> {
    const existing = await prisma.booking.findUnique({ where: { id }, include: { shift: true } });
    if (!existing) return null;
    // CMP-01: professional marks completion; booking -> AwaitingCompletion. Stamp the
    // auto-accept deadline (CMP-03): 24h after the later of shift end and submission.
    // CMP-01 is idempotent: a resubmitted completion is one completion, and must not
    // re-stamp the auto-accept deadline (that would let a professional push the clinic's
    // review window out indefinitely by resubmitting).
    if (existing.state === "AwaitingCompletion") return this.getBooking(id);
    const autoAcceptAt = new Date(autoAcceptDueAt(existing.shift.endsAt.getTime(), Date.now()));
    // Through the machine (§6.2), not around it — and as a conditional update, so the
    // precondition holds against a concurrent cancel rather than being a stale read.
    const next = advanceBooking(existing.state as BookingState, "AwaitingCompletion");
    const claimed = await prisma.booking.updateMany({
      where: { id, state: existing.state },
      data: { state: next, autoAcceptAt },
    });
    if (claimed.count !== 1) {
      throw new ConflictError("booking changed concurrently; completion not recorded");
    }
    await prisma.attendanceEvent.create({
      data: { bookingId: id, kind: "Completed", actorId: existing.professionalId },
    });
    return this.getBooking(id);
  }

  async recordPayout(input: PayoutInput): Promise<PayoutResult> {
    // Atomic: booking -> ServiceCompleted, allocation payout -> Paid, Payout event.
    return prisma.$transaction(async (tx) => {
      const po = await tx.paymentOrder.findUnique({
        where: { bookingId: input.bookingId },
        include: { allocation: true },
      });
      if (!po?.allocation) {
        throw new Error("no payment allocation for booking");
      }
      // The caller checked `state === AwaitingCompletion` on a snapshot read outside this
      // transaction. Under READ COMMITTED that check is stale by the time we write: a cancel
      // committing in between would be silently overwritten here, and its refund plus this
      // payout would both stand against one captured amount (PAY-08). Make the precondition
      // part of the write, so exactly one of the two racers commits.
      const claimed = await tx.booking.updateMany({
        where: { id: input.bookingId, state: "AwaitingCompletion", heldAt: null },
        data: { state: "ServiceCompleted" },
      });
      if (claimed.count !== 1) {
        throw new ConflictError("booking is no longer awaiting completion (concurrent update)");
      }
      await tx.financialAllocation.update({
        where: { paymentOrderId: po.id },
        data: { payoutState: "Paid" },
      });
      // Immutable payout event, idempotent by key (PAY-04/05, PAY-09).
      await tx.financialEvent.create({
        data: {
          paymentOrderId: po.id,
          type: "Payout",
          amount: input.payoutAmount,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return {
        bookingState: "ServiceCompleted" as const,
        payoutState: "Paid" as const,
        payoutAmount: input.payoutAmount,
      };
    });
  }

  async findSupportCase(bookingId: string, kind: string): Promise<ReviewCase | null> {
    const c = await prisma.supportCase.findFirst({
      where: { refType: "Booking", refId: bookingId, kind },
    });
    return c ? { id: c.id, state: c.state as CaseState, bookingId } : null;
  }

  async createSupportCase(bookingId: string, kind: string, subject: string): Promise<ReviewCase> {
    try {
      const c = await prisma.supportCase.create({
        data: { subject, kind, state: "Open", refType: "Booking", refId: bookingId },
      });
      return { id: c.id, state: "Open", bookingId };
    } catch (e) {
      if (isConflict(e)) throw new ConflictError("support case already exists");
      throw e;
    }
  }

  async resolveSupportCase(bookingId: string, kind: string): Promise<void> {
    await prisma.supportCase.updateMany({
      where: { refId: bookingId, kind, state: { not: "Resolved" } },
      data: { state: "Resolved" },
    });
  }

  async cancelBooking(input: CancelInput): Promise<CancelResult> {
    // Atomic: booking -> Cancelled, professional payout (if any), clinic refund, and
    // the payment-order/allocation states, all commit together.
    return prisma.$transaction(async (tx) => {
      const po = await tx.paymentOrder.findUnique({
        where: { bookingId: input.bookingId },
        include: { allocation: true },
      });
      if (!po?.allocation) throw new Error("no payment allocation for booking");

      // Same reasoning as recordPayout: the cancellable-state check happened outside this
      // transaction, so re-assert it as part of the write. Without this, a cancel racing an
      // accept-completion overwrites the payout's terminal state and both ledgers commit.
      const claimed = await tx.booking.updateMany({
        where: { id: input.bookingId, state: { in: ["Confirmed", "InProgress", "AwaitingCompletion"] } },
        data: { state: "Cancelled" },
      });
      if (claimed.count !== 1) {
        throw new ConflictError("booking is no longer cancellable (concurrent update)");
      }

      if (input.payable > 0) {
        await tx.financialEvent.create({
          data: {
            paymentOrderId: po.id,
            type: "Payout",
            amount: input.payable,
            idempotencyKey: input.payoutKey,
          },
        });
      }
      await tx.financialEvent.create({
        data: {
          paymentOrderId: po.id,
          type: "Refund",
          amount: input.refund,
          idempotencyKey: input.refundKey,
        },
      });

      const payoutState = input.payable > 0 ? "Paid" : "NotEligible";
      const refundState = input.payable > 0 ? "PartiallyRefunded" : "Refunded";
      await tx.financialAllocation.update({
        where: { paymentOrderId: po.id },
        data: { payoutState, refundState },
      });
      await tx.paymentOrder.update({ where: { id: po.id }, data: { state: "Refunded" } });

      return {
        bookingState: "Cancelled" as const,
        payoutState,
        refundState,
        payable: input.payable,
        refund: input.refund,
      };
    });
  }

  async createReview(input: ReviewInput): Promise<ReviewResult> {
    return prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          bookingId: input.bookingId,
          authorId: input.authorId,
          subjectId: input.subjectId,
          score: input.score,
          tags: input.tags,
          text: input.text ?? null,
        },
      });
      // REV-03: if the other party already reviewed this booking, publish both now.
      const counterpart = await tx.review.findFirst({
        where: { bookingId: input.bookingId, authorId: { not: input.authorId } },
      });
      if (counterpart) {
        await tx.review.updateMany({
          where: { bookingId: input.bookingId, publishedAt: null },
          data: { publishedAt: new Date() },
        });
        return { id: review.id, published: true };
      }
      return { id: review.id, published: false };
    });
  }

  async getSubjectRating(subjectId: string): Promise<RatingSummary | null> {
    // REV-04: only PUBLISHED reviews count; REV-05: cancelled bookings never produced
    // a review (the API gates creation on ServiceCompleted), so none appear here.
    const reviews = await prisma.review.findMany({
      where: { subjectId, publishedAt: { not: null } },
      select: { score: true },
    });
    return aggregateRating(reviews.map((r) => r.score));
  }

  async listPartyBookings(party: "clinic" | "professional", id: string): Promise<BookingHistoryRow[]> {
    // REP-01: a party's booking + financial history. A clinic owns bookings via its
    // shifts' workspace; a professional owns them directly.
    const bookings = await prisma.booking.findMany({
      where:
        party === "professional"
          ? { professionalId: id }
          : { shift: { workspaceId: id } },
      include: {
        shift: { include: { workspace: { select: { branchName: true } } } },
        professional: { select: { displayName: true } },
        paymentOrder: { include: { allocation: true } },
        attendance: { where: { kind: "Arrived" }, take: 1 },
      },
      orderBy: { confirmedAt: "desc" },
    });
    return bookings.map((b) => {
      const alloc = b.paymentOrder?.allocation;
      const compensation = alloc?.compensation ?? 0;
      const serviceFee = alloc?.serviceFee ?? b.feeSnapshot;
      const tax = alloc?.tax ?? b.taxSnapshot;
      return {
        bookingId: b.id,
        shiftId: b.shiftId,
        counterpartyId: party === "professional" ? b.shift.workspaceId : b.professionalId,
        counterpartyName:
          party === "professional" ? b.shift.workspace.branchName : b.professional.displayName,
        state: b.state,
        compensation,
        serviceFee,
        tax,
        total: compensation + serviceFee + tax,
        payoutState: alloc?.payoutState ?? "NotEligible",
        shiftStart: b.shift.startsAt.getTime(),
        shiftEnd: b.shift.endsAt.getTime(),
        category: b.shift.category,
        arrived: b.attendance.length > 0,
        held: b.heldAt !== null,
      };
    });
  }

  async exportFinancials(): Promise<FinanceExportRow[]> {
    // REP-02: every payment order with its allocation and event ledger.
    const orders = await prisma.paymentOrder.findMany({
      include: { allocation: true, events: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    return orders.map((o) => ({
      paymentOrderId: o.id,
      bookingId: o.bookingId,
      state: o.state,
      providerRef: o.providerRef,
      captured: o.captured,
      compensation: o.allocation?.compensation ?? null,
      serviceFee: o.allocation?.serviceFee ?? null,
      tax: o.allocation?.tax ?? null,
      events: o.events.map((e) => ({
        type: e.type,
        amount: e.amount,
        providerRef: e.providerRef,
        at: e.createdAt.getTime(),
      })),
    }));
  }

  /**
   * REP-03 money totals via SQL aggregates.
   *
   * getMetrics used to call `reconcile()`, which loads every payment order and every
   * financial event ever written into memory — on each dashboard hit. The dashboard needs
   * four numbers, not the rows: at 500k orders that was hundreds of MB per request, and it
   * would take booking confirmation down with it. Exception semantics are kept identical to
   * `reconcile` (an order leaks when payouts + refunds exceed captured, PAY-08).
   */
  private async moneyTotals(): Promise<{
    captured: number;
    payouts: number;
    refunds: number;
    exceptions: number;
  }> {
    const [captured, byType, leaks] = await Promise.all([
      prisma.paymentOrder.aggregate({ _sum: { captured: true } }),
      prisma.financialEvent.groupBy({ by: ["type"], _sum: { amount: true } }),
      // Per-order aggregate: only rows where funds out exceed captured are returned, so the
      // result set is the exceptions themselves — normally empty — not the whole ledger.
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM (
          SELECT po."id"
          FROM "PaymentOrder" po
          LEFT JOIN "FinancialEvent" fe ON fe."paymentOrderId" = po."id"
          GROUP BY po."id", po."captured"
          HAVING COALESCE(SUM(CASE WHEN fe."type" IN ('Payout','Refund') THEN fe."amount" ELSE 0 END), 0) > po."captured"
        ) leaking
      `,
    ]);
    const sumOf = (t: string) => byType.find((r) => r.type === t)?._sum.amount ?? 0;
    return {
      captured: captured._sum.captured ?? 0,
      payouts: sumOf("Payout"),
      refunds: sumOf("Refund"),
      exceptions: Number(leaks[0]?.count ?? 0),
    };
  }

  async getMetrics(): Promise<MarketplaceMetrics> {
    // REP-03: core counts + money totals (aggregated in SQL, not by loading the ledger).
    const [
      shiftsTotal,
      shiftsOpen,
      offersTotal,
      bookingsTotal,
      confirmed,
      awaitingCompletion,
      completed,
      cancelled,
      held,
      casesOpen,
      money,
    ] = await Promise.all([
      prisma.shift.count(),
      prisma.shift.count({ where: { state: "Published" } }),
      prisma.offer.count(),
      prisma.booking.count(),
      prisma.booking.count({ where: { state: "Confirmed" } }),
      prisma.booking.count({ where: { state: "AwaitingCompletion" } }),
      prisma.booking.count({ where: { state: "ServiceCompleted" } }),
      prisma.booking.count({ where: { state: "Cancelled" } }),
      prisma.booking.count({ where: { heldAt: { not: null } } }),
      prisma.supportCase.count({ where: { state: { not: "Resolved" } } }),
      this.moneyTotals(),
    ]);
    return {
      shifts: { total: shiftsTotal, open: shiftsOpen },
      offers: { total: offersTotal },
      bookings: { total: bookingsTotal, confirmed, awaitingCompletion, completed, cancelled, held },
      cases: { open: casesOpen },
      money: {
        captured: money.captured,
        paidOut: money.payouts,
        refunded: money.refunds,
        reconciliationExceptions: money.exceptions,
      },
    };
  }

  async recordAudit(entry: AuditEntry): Promise<void> {
    // Immutable append (§6.4). The actor is internal staff not modelled as a User
    // row, so actorId stays null and the actor/role/details live in `after`.
    await prisma.auditRecord.create({
      data: {
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        after: { actor: entry.actor, role: entry.role, ...(entry.details ?? {}) },
      },
    });
  }

  async listAudit(limit = 100): Promise<AuditRow[]> {
    const records = await prisma.auditRecord.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return records.map((r) => {
      const after = (r.after ?? {}) as Record<string, unknown>;
      const { actor, role, ...details } = after;
      return {
        id: r.id,
        actor: typeof actor === "string" ? actor : "",
        role: typeof role === "string" ? role : "",
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        details,
        at: r.createdAt.getTime(),
      };
    });
  }

  async getProfessionalProfile(id: string): Promise<VerifiedProfile | null> {
    const p = await prisma.professionalProfile.findUnique({
      where: { id },
      include: { credentials: true, insurance: true },
    });
    if (!p) return null;
    const licence = p.credentials.find((c) => c.kind === "licence");
    // Latest insurance evidence by validity (VER-05).
    const insurance = [...p.insurance].sort(
      (a, b) => (b.validUntil?.getTime() ?? 0) - (a.validUntil?.getTime() ?? 0),
    )[0];
    const rating = await this.getSubjectRating(id);
    return {
      id: p.id,
      selfDeclared: { displayName: p.displayName, profession: p.profession, specialty: p.specialty },
      verified: {
        identityVerified: p.verification === "Verified",
        licence: licence
          ? { state: licence.state, validUntil: licence.validUntil?.getTime() ?? null }
          : null,
        insurance: insurance
          ? { state: insurance.state, validUntil: insurance.validUntil?.getTime() ?? null }
          : null,
        rating: rating ? { count: rating.count, average: rating.average } : null,
      },
    };
  }

  async listOpenCases(): Promise<CaseSummary[]> {
    const cases = await prisma.supportCase.findMany({
      where: { state: { not: "Resolved" } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return cases.map((c) => ({
      id: c.id,
      kind: c.kind,
      state: c.state as CaseSummary["state"],
      refId: c.refId,
      subject: c.subject,
    }));
  }

  async reconcile(): Promise<Reconciliation> {
    // PAY-11: reconcile each payment order's events against captured funds. Conserved
    // when funds out (payouts + refunds) do not exceed captured (PAY-08).
    // No `take`: a conservation audit (PAY-11) must inspect every order — capping to
    // the newest N would hide a leak in an older order from Finance.
    const orders = await prisma.paymentOrder.findMany({
      include: { events: { select: { type: true, amount: true } } },
      orderBy: { createdAt: "desc" },
    });
    const rows = orders.map((o) => {
      const payouts = o.events.filter((e) => e.type === "Payout").reduce((s, e) => s + e.amount, 0);
      const refunds = o.events.filter((e) => e.type === "Refund").reduce((s, e) => s + e.amount, 0);
      return {
        paymentOrderId: o.id,
        bookingId: o.bookingId,
        captured: o.captured,
        payouts,
        refunds,
        undistributed: o.captured - payouts - refunds,
        conserved: payouts + refunds <= o.captured,
      };
    });
    return {
      rows,
      summary: {
        count: rows.length,
        captured: rows.reduce((s, r) => s + r.captured, 0),
        payouts: rows.reduce((s, r) => s + r.payouts, 0),
        refunds: rows.reduce((s, r) => s + r.refunds, 0),
        exceptions: rows.filter((r) => !r.conserved).length,
      },
    };
  }

  async listPendingVerifications(): Promise<PendingVerification[]> {
    const clinics = await prisma.clinicWorkspace.findMany({
      where: { verification: "Submitted" },
      select: { id: true, branchName: true },
      orderBy: { createdAt: "desc" }, // newest submissions first (and keeps the cap deterministic)
      take: 50,
    });
    const pros = await prisma.professionalProfile.findMany({
      where: { verification: "Submitted" },
      select: { id: true, displayName: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    // VER-05: submitted insurance evidence awaiting an operator's review.
    const insurance = await prisma.insuranceEvidence.findMany({
      where: { state: "Submitted" },
      select: { professionalId: true, professional: { select: { displayName: true } } },
      // No createdAt on this model; cuid ids sort ~chronologically, so id desc ≈ newest first
      // and keeps the take cap deterministic.
      orderBy: { id: "desc" },
      take: 50,
    });
    return [
      ...clinics.map((c) => ({ kind: "clinic" as const, id: c.id, name: c.branchName })),
      ...pros.map((p) => ({ kind: "professional" as const, id: p.id, name: p.displayName })),
      ...insurance.map((i) => ({ kind: "insurance" as const, id: i.professionalId, name: i.professional.displayName })),
    ];
  }

  async listActiveBookings(): Promise<ActiveBookingRow[]> {
    const bookings = await prisma.booking.findMany({
      where: { state: { in: ["Confirmed", "InProgress", "AwaitingCompletion"] } },
      include: {
        professional: {
          select: { displayName: true, credentials: { where: { kind: "licence" }, select: { state: true } } },
        },
        shift: { include: { workspace: { select: { branchName: true } } } },
      },
      orderBy: { confirmedAt: "desc" },
      take: 50,
    });
    return bookings.map((b) => ({
      bookingId: b.id,
      professionalId: b.professionalId,
      professionalName: b.professional.displayName,
      clinicName: b.shift.workspace.branchName,
      state: b.state,
      held: b.heldAt !== null,
      credential: b.professional.credentials[0]?.state ?? "Submitted",
    }));
  }

  async postMessage(bookingId: string, senderId: string, body: string): Promise<MessageRecord> {
    // Encrypted at rest: clinic<->professional threads may carry sensitive context. The
    // patient-data filter already ran on the plaintext at the controller, before this.
    const m = await prisma.message.create({ data: { bookingId, senderId, body: encryptField(body) } });
    return { id: m.id, senderId: m.senderId, body, createdAt: m.createdAt.getTime() };
  }

  async listMessages(bookingId: string): Promise<MessageRecord[]> {
    const list = await prisma.message.findMany({
      where: { bookingId },
      orderBy: { createdAt: "asc" },
    });
    return list.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: decryptField(m.body),
      createdAt: m.createdAt.getTime(),
    }));
  }

  async getBookingContact(bookingId: string): Promise<BookingContact | null> {
    const b = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        professional: { include: { user: true } },
        shift: {
          include: {
            workspace: {
              include: { memberships: { where: { role: "clinic_owner" }, include: { user: true }, take: 1 } },
            },
          },
        },
      },
    });
    if (!b) return null;
    return {
      clinicPhone: b.shift.workspace.memberships[0]?.user.phone
        ? decryptField(b.shift.workspace.memberships[0].user.phone)
        : null,
      professionalPhone: decryptField(b.professional.user.phone),
    };
  }

  async recordNotification(input: NotificationInput): Promise<void> {
    await prisma.notification.create({
      data: {
        channel: input.channel,
        to: input.to,
        event: input.event,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
      },
    });
  }

  private toRecord(o: OfferWithShift): OfferRecord {
    const snap =
      o.termsSnapshot && typeof o.termsSnapshot === "object"
        ? (o.termsSnapshot as Record<string, unknown>)
        : null;
    const compensation =
      snap && typeof snap.compensation === "number" ? snap.compensation : o.shift.compensation;
    const urgency =
      snap && typeof snap.urgency === "string"
        ? (snap.urgency as ShiftUrgency)
        : (o.shift.urgency as ShiftUrgency);
    return {
      id: o.id,
      shiftId: o.shift.id,
      clinicWorkspaceId: o.shift.workspaceId,
      professionalId: o.professionalId,
      compensation,
      urgency,
      state: o.state as OfferState,
      sentAt: o.sentAt.getTime(),
      shiftStart: o.shift.startsAt.getTime(),
      expiresAt: o.expiresAt.getTime(),
      fundingDueAt: o.fundingDueAt ? o.fundingDueAt.getTime() : null,
    };
  }
}

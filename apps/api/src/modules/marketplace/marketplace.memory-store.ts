import { randomUUID } from "node:crypto";
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
  ApprovalRequestRecord,
  CreateApprovalInput,
  ExecuteApprovalInput,
} from "./marketplace.types.js";
import { advanceBooking, advanceVerification, aggregateRating, autoAcceptDueAt } from "@probook/domain";
import { ConflictError } from "./errors.util.js";
import type { OfferState, VerificationState, RatingSummary, Role } from "@probook/domain";

interface MemReview {
  id: string;
  bookingId: string;
  authorId: string;
  subjectId: string;
  score: number;
  published: boolean;
}

interface MemShift {
  id: string;
  clinicWorkspaceId: string;
  category: string;
  compensation: number;
  urgency: OfferRecord["urgency"];
  startsAt: number;
  state: string;
  insuranceRequired: boolean;
}

const SHIFT_LEN_MS = 4 * 60 * 60 * 1000;

interface MemCandidate {
  shiftId: string;
  professionalId: string;
  via: "application" | "invitation";
  state: string;
}

/**
 * Zero-dependency in-memory implementation. Used when DATABASE_URL is unset so the
 * flow (and the e2e) run without Postgres. State is lost on restart — dev only.
 */
export class InMemoryMarketplaceStore implements MarketplaceRepository {
  private readonly offers = new Map<string, OfferRecord>();
  private readonly bookings = new Map<string, BookingDetail>();
  private readonly bookingByOffer = new Map<string, string>();
  private readonly supportCases = new Map<string, ReviewCase>(); // keyed by `${bookingId}:${kind}`
  private readonly clinics = new Map<string, VerificationState>();
  private readonly professionals = new Map<string, VerificationState>();
  private readonly professionalProfiles = new Map<string, { displayName: string; profession: string }>();
  private readonly usedPhones = new Set<string>(); // mirrors the Prisma User.phone unique constraint
  // Identity graph, mirroring Prisma's User -> ProfessionalProfile / Membership relations.
  private readonly users = new Map<string, string>(); // phone -> userId
  private readonly professionalByPhone = new Map<string, string>(); // phone -> professionalId
  private readonly membershipsByPhone = new Map<string, { workspaceId: string; role: Role }[]>();
  private readonly suspendedCredentials = new Set<string>();
  // professionalId -> licence expiry (epoch ms), mirroring Prisma's Credential.validUntil.
  // Absent = no expiry recorded, which Prisma treats as valid (`!licence?.validUntil`).
  private readonly licenceValidUntil = new Map<string, number>();
  private readonly arrivals = new Set<string>(); // bookingIds with a recorded arrival (CAN-03)
  private readonly autoAcceptAt = new Map<string, number>(); // bookingId -> CMP-03 deadline
  private readonly approvals = new Map<string, ApprovalRequestRecord>(); // §6.4 dual control
  // Money ledger, mirroring Prisma's FinancialEvent rows. Without it `reconcile` returned
  // hardcoded zeros, so "0 reconciliation exceptions" (PAY-11) was unconditionally true in
  // every test run — it could not fail no matter what the money paths did.
  private readonly events: { bookingId: string; type: "Collection" | "Payout" | "Refund"; amount: number; key: string }[] = [];
  // phone directory, mirroring Prisma's User.phone -> party resolution (MSG-02).
  private readonly clinicOwnerPhone = new Map<string, string>(); // workspaceId -> phone
  private readonly professionalPhone = new Map<string, string>(); // professionalId -> phone
  private readonly reviews: MemReview[] = [];
  private readonly shifts = new Map<string, MemShift>();
  private readonly candidates: MemCandidate[] = [];
  private readonly availabilityBlocks: (AvailabilityBlock & { professionalId: string })[] = [];

  async registerClinic(input: RegisterClinicInput): Promise<EntityRef & { ownerUserId: string }> {
    if (this.usedPhones.has(input.ownerPhone)) throw new ConflictError("owner phone already registered");
    this.usedPhones.add(input.ownerPhone);
    const id = randomUUID();
    const ownerUserId = randomUUID();
    this.clinics.set(id, "Submitted");
    // Parity with Prisma's User + Membership graph: the owner's phone is how the caller is
    // later recognised as this workspace's owner. Previously the phone was only added to a
    // uniqueness Set and discarded, so identity could not be resolved in this store at all.
    this.users.set(input.ownerPhone, ownerUserId);
    this.membershipsByPhone.set(input.ownerPhone, [
      ...(this.membershipsByPhone.get(input.ownerPhone) ?? []),
      { workspaceId: id, role: "clinic_owner" },
    ]);
    this.clinicOwnerPhone.set(id, input.ownerPhone);
    return { id, verification: "Submitted", ownerUserId };
  }

  async registerProfessional(input: RegisterProfessionalInput): Promise<EntityRef> {
    if (this.usedPhones.has(input.phone)) throw new ConflictError("phone already registered");
    this.usedPhones.add(input.phone);
    const id = randomUUID();
    this.professionals.set(id, "Submitted");
    this.professionalProfiles.set(id, { displayName: input.displayName, profession: input.profession });
    this.users.set(input.phone, randomUUID());
    this.professionalByPhone.set(input.phone, id);
    this.professionalPhone.set(id, input.phone);
    return { id, verification: "Submitted" };
  }

  async resolveIdentity(phone: string): Promise<CallerIdentity> {
    return {
      userId: this.users.get(phone) ?? null,
      professionalId: this.professionalByPhone.get(phone) ?? null,
      memberships: this.membershipsByPhone.get(phone) ?? [],
    };
  }

  async verifyClinic(id: string): Promise<EntityRef | null> {
    const current = this.clinics.get(id);
    if (current === undefined) return null;
    if (current === "Verified") return { id, verification: "Verified" }; // idempotent
    const next = advanceVerification(current, "Verified");
    this.clinics.set(id, next);
    return { id, verification: next };
  }

  async verifyProfessional(id: string): Promise<EntityRef | null> {
    const current = this.professionals.get(id);
    if (current === undefined) return null;
    if (current === "Verified") return { id, verification: "Verified" }; // idempotent
    const next = advanceVerification(current, "Verified");
    this.professionals.set(id, next);
    return { id, verification: next };
  }

  async clinicVerification(id: string): Promise<VerificationState | null> {
    return this.clinics.get(id) ?? null;
  }

  async getOfferEligibility(offerId: string): Promise<OfferEligibility | null> {
    const o = this.offers.get(offerId);
    if (!o) return null;
    const shift = this.shifts.get(o.shiftId);
    const insuranceRequired = shift?.insuranceRequired ?? false;
    const ins = this.insurance.get(o.professionalId);
    const shiftEnd = o.shiftStart + SHIFT_LEN_MS;
    const insuranceValid =
      !insuranceRequired ||
      (ins?.state === "Verified" && ins.validUntil !== null && ins.validUntil >= shiftEnd);
    return {
      clinicVerified: this.clinics.get(o.clinicWorkspaceId) === "Verified",
      professionalVerified: this.professionals.get(o.professionalId) === "Verified",
      // VER-04: block a suspended OR expired licence at confirm. `licenceValid...` was
      // hardcoded true here, so the expiry half of VER-04 was structurally untestable in
      // this store — a bug letting an expired-licence professional book would pass every
      // suite that runs against it.
      professionalNotSuspended: !this.suspendedCredentials.has(o.professionalId),
      licenceValidThroughShiftEnd: this.licenceValidThrough(o.professionalId, shiftEnd),
      insuranceRequired,
      insuranceValidThroughShiftEnd: insuranceValid,
    };
  }

  private readonly insurance = new Map<string, InsuranceStatus>();

  async postShift(input: ShiftPostInput): Promise<{ shiftId: string }> {
    const id = randomUUID();
    this.shifts.set(id, {
      id,
      clinicWorkspaceId: input.clinicWorkspaceId,
      category: input.category,
      compensation: input.compensation,
      urgency: input.urgency,
      startsAt: input.shiftStart,
      state: "Published",
      insuranceRequired: input.insuranceRequired,
    });
    return { shiftId: id };
  }

  async submitInsurance(professionalId: string, validUntil: number): Promise<InsuranceStatus> {
    const status: InsuranceStatus = { state: "Submitted", validUntil };
    this.insurance.set(professionalId, status);
    return status;
  }

  async verifyInsurance(professionalId: string): Promise<InsuranceStatus | null> {
    const ins = this.insurance.get(professionalId);
    if (!ins) return null;
    ins.state = "Verified";
    return ins;
  }

  async getInsuranceStatus(professionalId: string): Promise<InsuranceStatus> {
    return this.insurance.get(professionalId) ?? { state: "NotProvided", validUntil: null };
  }

  async getShift(id: string): Promise<ShiftRecord | null> {
    const s = this.shifts.get(id);
    if (!s) return null;
    const hasActiveOffer = [...this.offers.values()].some(
      (o) => o.shiftId === id && (o.state === "PendingResponse" || o.state === "AwaitingPayment"),
    );
    const booked = [...this.bookings.values()].some((b) => b.shiftId === id);
    return {
      id: s.id,
      clinicWorkspaceId: s.clinicWorkspaceId,
      category: s.category,
      compensation: s.compensation,
      urgency: s.urgency,
      startsAt: s.startsAt,
      state: s.state,
      hasActiveOffer,
      booked,
    };
  }

  async applyToShift(shiftId: string, professionalId: string): Promise<{ id: string }> {
    if (this.candidates.some((c) => c.shiftId === shiftId && c.professionalId === professionalId && c.via === "application")) {
      throw new ConflictError("already applied");
    }
    const id = randomUUID();
    this.candidates.push({ shiftId, professionalId, via: "application", state: "Submitted" });
    return { id };
  }

  async inviteToShift(shiftId: string, professionalId: string): Promise<{ id: string }> {
    if (this.candidates.some((c) => c.shiftId === shiftId && c.professionalId === professionalId && c.via === "invitation")) {
      throw new ConflictError("already invited");
    }
    const id = randomUUID();
    this.candidates.push({ shiftId, professionalId, via: "invitation", state: "Sent" });
    return { id };
  }

  async listShiftCandidates(shiftId: string): Promise<Candidate[]> {
    return this.candidates
      .filter((c) => c.shiftId === shiftId)
      .map((c) => ({ professionalId: c.professionalId, via: c.via, state: c.state }));
  }

  async createOfferForShift(input: CreateOfferForShiftInput): Promise<OfferRecord> {
    const shift = this.shifts.get(input.shiftId);
    if (!shift) throw new Error("shift not found");
    // OFF-02: at most one active offer per shift (mirrors the Prisma partial-unique guard).
    const active = [...this.offers.values()].some(
      (o) => o.shiftId === input.shiftId && (o.state === "PendingResponse" || o.state === "AwaitingPayment"),
    );
    if (active) throw new ConflictError("shift already has an active offer");
    const record: OfferRecord = {
      id: randomUUID(),
      shiftId: input.shiftId,
      clinicWorkspaceId: shift.clinicWorkspaceId,
      professionalId: input.professionalId,
      compensation: shift.compensation,
      urgency: shift.urgency,
      state: "PendingResponse",
      sentAt: input.sentAt,
      shiftStart: shift.startsAt,
      expiresAt: input.expiresAt,
      fundingDueAt: null,
    };
    this.offers.set(record.id, record);
    for (const c of this.candidates) {
      if (c.shiftId === input.shiftId && c.professionalId === input.professionalId && c.via === "application") {
        c.state = "OfferSent";
      }
    }
    return record;
  }

  async getOffer(id: string): Promise<OfferRecord | null> {
    return this.offers.get(id) ?? null;
  }

  async addAvailability(
    professionalId: string,
    startsAt: number,
    endsAt: number,
    openToRequests: boolean,
  ): Promise<AvailabilityBlock> {
    const block = { id: randomUUID(), professionalId, startsAt, endsAt, openToRequests };
    this.availabilityBlocks.push(block);
    return { id: block.id, startsAt, endsAt, openToRequests };
  }

  async listAvailability(professionalId: string): Promise<AvailabilityBlock[]> {
    return this.availabilityBlocks
      .filter((b) => b.professionalId === professionalId)
      .sort((a, b) => a.startsAt - b.startsAt)
      .map((b) => ({ id: b.id, startsAt: b.startsAt, endsAt: b.endsAt, openToRequests: b.openToRequests }));
  }

  async hasScheduleOverlap(professionalId: string, startsAt: number, endsAt: number): Promise<boolean> {
    for (const b of this.bookings.values()) {
      if (b.professionalId !== professionalId) continue;
      if (b.state !== "Confirmed" && b.state !== "InProgress" && b.state !== "AwaitingCompletion") continue;
      const shift = this.shifts.get(b.shiftId);
      if (!shift) continue;
      if (shift.startsAt < endsAt && shift.startsAt + SHIFT_LEN_MS > startsAt) return true;
    }
    return false;
  }

  async searchProfessionals(filters: ProfessionalFilters): Promise<ProfessionalSearchResult[]> {
    // SRC-01: filter Verified professionals by profession (case-insensitive). The
    // in-memory store keeps no specialty, so a specialty filter matches nothing.
    const wantProfession = filters.profession?.toLowerCase();
    const out: ProfessionalSearchResult[] = [];
    for (const [id, v] of this.professionals) {
      if (v !== "Verified") continue;
      const profile = this.professionalProfiles.get(id);
      if (wantProfession && profile?.profession.toLowerCase() !== wantProfession) continue;
      if (filters.specialty) continue; // no specialty data in-memory
      // Include the real aggregate rating (REV-04) — the store has the review data.
      const rating = await this.getSubjectRating(id);
      out.push({
        id,
        displayName: profile?.displayName ?? "",
        profession: profile?.profession ?? "",
        specialty: null,
        rating: rating ? rating.average : null,
      });
    }
    return out;
  }

  async listOpenShifts(filters?: ShiftFilters): Promise<OpenShift[]> {
    const isOpen = (s: MemShift) => {
      if (s.state !== "Published") return false;
      const hasActive = [...this.offers.values()].some(
        (o) => o.shiftId === s.id && (o.state === "PendingResponse" || o.state === "AwaitingPayment"),
      );
      const booked = [...this.bookings.values()].some((b) => b.shiftId === s.id);
      if (hasActive || booked) return false;
      if (filters?.urgency && s.urgency !== filters.urgency) return false;
      if (filters?.category && !s.category.toLowerCase().includes(filters.category.toLowerCase())) return false;
      if (filters?.minCompensation !== undefined && s.compensation < filters.minCompensation) return false;
      if (filters?.maxCompensation !== undefined && s.compensation > filters.maxCompensation) return false;
      return true;
    };
    return [...this.shifts.values()]
      .filter(isOpen)
      .sort((a, b) =>
        a.urgency === b.urgency ? a.startsAt - b.startsAt : a.urgency === "urgent" ? -1 : 1,
      )
      .map((s) => ({
        shiftId: s.id,
        category: s.category,
        compensation: s.compensation,
        startsAt: s.startsAt,
        urgency: s.urgency,
        urgent: s.urgency === "urgent",
      }));
  }

  async setOfferState(id: string, state: OfferState, fundingDueAt?: number): Promise<OfferRecord | null> {
    const offer = this.offers.get(id);
    if (!offer) return null;
    offer.state = state;
    if (fundingDueAt !== undefined) offer.fundingDueAt = fundingDueAt;
    return offer;
  }

  async confirmBooking(input: ConfirmBookingInput): Promise<ConfirmBookingResult> {
    // Idempotency parity with the Prisma Booking.offerId unique constraint: a second
    // confirm for the same offer must conflict, not fabricate a second booking.
    if (this.bookingByOffer.has(input.offerId)) throw new ConflictError("booking already exists for this offer");
    const offer = this.offers.get(input.offerId);
    if (offer) offer.state = "Converted"; // atomic with the booking here by construction
    const shift = this.shifts.get(input.shiftId);
    const shiftStart = shift?.startsAt ?? offer?.shiftStart ?? 0;
    const detail: BookingDetail = {
      id: randomUUID(),
      offerId: input.offerId,
      shiftId: input.shiftId,
      clinicWorkspaceId: input.clinicWorkspaceId,
      professionalId: input.professionalId,
      state: "Confirmed",
      compensation: input.allocation.compensation,
      serviceFee: input.allocation.serviceFee,
      tax: input.allocation.tax,
      captured: input.captured,
      payoutState: "NotEligible",
      paymentOrderId: randomUUID(),
      heldAt: null,
      shiftStart,
      shiftEnd: shiftStart + SHIFT_LEN_MS,
    };
    this.bookings.set(detail.id, detail);
    this.bookingByOffer.set(input.offerId, detail.id);
    this.appendEvent(detail.id, "Collection", input.captured, input.idempotencyKey);
    return { booking: this.toRecord(detail), paymentOrderId: detail.paymentOrderId ?? randomUUID() };
  }

  async getBookingByOffer(offerId: string): Promise<BookingRecord | null> {
    const id = this.bookingByOffer.get(offerId);
    const detail = id ? this.bookings.get(id) : undefined;
    return detail ? this.toRecord(detail) : null;
  }

  // ----- §6.4 dual control -----

  async createApproval(input: CreateApprovalInput): Promise<ApprovalRequestRecord> {
    const record: ApprovalRequestRecord = {
      id: randomUUID(),
      ...input,
      state: "Pending",
      executorId: null,
      executorRole: null,
      createdAt: Date.now(),
      decidedAt: null,
    };
    this.approvals.set(record.id, record);
    return { ...record };
  }

  async getApproval(id: string): Promise<ApprovalRequestRecord | null> {
    const r = this.approvals.get(id);
    return r ? { ...r } : null;
  }

  async listPendingApprovals(): Promise<ApprovalRequestRecord[]> {
    return [...this.approvals.values()]
      .filter((r) => r.state === "Pending")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({ ...r }));
  }

  async executeApproval(input: ExecuteApprovalInput): Promise<{ refund: number; bookingId: string }> {
    const req = this.approvals.get(input.approvalId);
    if (!req) throw new Error("approval request not found");
    // Parity with the Prisma conditional update: only a Pending request executes.
    if (req.state !== "Pending") {
      throw new ConflictError("approval request is no longer pending");
    }
    // Parity with the DB CHECK "ApprovalRequest_different_person" (§6.4).
    if (req.initiatorId === input.executorId) {
      throw new ConflictError("an approval cannot be executed by its initiator");
    }
    const booking = this.bookings.get(req.refId);
    if (!booking) throw new Error("no payment allocation for booking");
    req.state = "Executed";
    req.executorId = input.executorId;
    req.executorRole = input.executorRole;
    req.decidedAt = Date.now();
    this.appendEvent(req.refId, "Refund", req.amount, input.idempotencyKey);
    return { refund: req.amount, bookingId: req.refId };
  }

  async getBooking(id: string): Promise<BookingDetail | null> {
    const detail = this.bookings.get(id);
    return detail ? { ...detail } : null; // copy: callers must not mutate store state
  }

  async hasArrived(bookingId: string): Promise<boolean> {
    // Parity with Prisma: a Completed booking implies arrival (CAN-03).
    if (this.arrivals.has(bookingId)) return true;
    const detail = this.bookings.get(bookingId);
    return detail?.state === "AwaitingCompletion" || detail?.state === "ServiceCompleted";
  }

  async recordArrival(bookingId: string): Promise<boolean> {
    if (!this.bookings.has(bookingId)) return false;
    this.arrivals.add(bookingId); // idempotent: a Set, like the Prisma dedupe
    return true;
  }

  async markCompletion(id: string): Promise<BookingDetail | null> {
    const detail = this.bookings.get(id);
    if (!detail) return null;
    // CMP-01 is idempotent: submitting completion twice is one completion, not an error.
    // This used to be implicit — the store wrote the state directly, so a repeat was a
    // harmless no-op. Routing through the machine made the second call illegal, which is
    // the machine being right and the idempotency being unstated. State it.
    if (detail.state === "AwaitingCompletion") return { ...detail };
    // Through the machine, not around it: writing the state directly is what let the
    // completion path drift out of §6.2's control entirely.
    detail.state = advanceBooking(detail.state, "AwaitingCompletion");
    // Parity with the Prisma store: stamp the CMP-03 auto-accept deadline and record the
    // completion as attendance. Without the deadline, the auto-accept sweep had nothing to
    // select on in this store, so CMP-03 could not be exercised by the suites at all.
    this.autoAcceptAt.set(id, autoAcceptDueAt(detail.shiftEnd, Date.now()));
    this.arrivals.add(id);
    return { ...detail };
  }

  async getAutoAcceptDueAt(bookingId: string): Promise<number | null> {
    return this.autoAcceptAt.get(bookingId) ?? null;
  }

  async recordPayout(input: PayoutInput): Promise<PayoutResult> {
    const detail = this.bookings.get(input.bookingId);
    if (!detail) throw new Error("booking not found");
    // Idempotency parity with the Prisma Payout idempotencyKey unique constraint.
    if (detail.payoutState === "Paid") throw new ConflictError("payout already recorded");
    detail.state = "ServiceCompleted";
    detail.payoutState = "Paid";
    this.appendEvent(input.bookingId, "Payout", input.payoutAmount, input.idempotencyKey);
    return {
      bookingState: "ServiceCompleted",
      payoutState: "Paid",
      payoutAmount: input.payoutAmount,
    };
  }

  async findSupportCase(bookingId: string, kind: string): Promise<ReviewCase | null> {
    return this.supportCases.get(`${bookingId}:${kind}`) ?? null;
  }

  async createSupportCase(bookingId: string, kind: string, _subject: string): Promise<ReviewCase> {
    const c: ReviewCase = { id: randomUUID(), state: "Open", bookingId };
    this.supportCases.set(`${bookingId}:${kind}`, c);
    return c;
  }

  async createReview(input: ReviewInput): Promise<ReviewResult> {
    // REV-02: one review per party per booking (Prisma enforces this via a unique index).
    if (
      this.reviews.some(
        (r) => r.bookingId === input.bookingId && r.authorId === input.authorId,
      )
    ) {
      throw new ConflictError("duplicate review");
    }
    const review: MemReview = {
      id: randomUUID(),
      bookingId: input.bookingId,
      authorId: input.authorId,
      subjectId: input.subjectId,
      score: input.score,
      published: false,
    };
    this.reviews.push(review);
    // REV-03: if the other party already reviewed, publish both.
    const counterpart = this.reviews.find(
      (r) => r.bookingId === input.bookingId && r.authorId !== input.authorId,
    );
    if (counterpart) {
      for (const r of this.reviews) {
        if (r.bookingId === input.bookingId) r.published = true;
      }
      return { id: review.id, published: true };
    }
    return { id: review.id, published: false };
  }

  async getSubjectRating(subjectId: string): Promise<RatingSummary | null> {
    const scores = this.reviews
      .filter((r) => r.subjectId === subjectId && r.published)
      .map((r) => r.score);
    return aggregateRating(scores);
  }

  async getProfessionalProfile(id: string): Promise<VerifiedProfile | null> {
    const verification = this.professionals.get(id);
    if (verification === undefined) return null;
    const profile = this.professionalProfiles.get(id);
    const suspended = this.suspendedCredentials.has(id);
    const rating = await this.getSubjectRating(id);
    const ins = this.insurance.get(id);
    // The in-memory store keeps no explicit licence row: derive its state from
    // verification + suspension (no expiry is tracked, so validUntil is null).
    const licenceState = suspended ? "Suspended" : verification === "Verified" ? "Verified" : "Submitted";
    return {
      id,
      selfDeclared: {
        displayName: profile?.displayName ?? "",
        profession: profile?.profession ?? "",
        specialty: null,
      },
      verified: {
        identityVerified: verification === "Verified",
        licence: { state: licenceState, validUntil: null },
        insurance: ins ? { state: ins.state, validUntil: ins.validUntil } : null,
        rating: rating ? { count: rating.count, average: rating.average } : null,
      },
    };
  }

  private readonly messages: (MessageRecord & { bookingId: string })[] = [];

  async postMessage(bookingId: string, senderId: string, body: string): Promise<MessageRecord> {
    const m = { id: randomUUID(), bookingId, senderId, body, createdAt: Date.now() };
    this.messages.push(m);
    return { id: m.id, senderId, body, createdAt: m.createdAt };
  }

  async listMessages(bookingId: string): Promise<MessageRecord[]> {
    return this.messages
      .filter((m) => m.bookingId === bookingId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => ({ id: m.id, senderId: m.senderId, body: m.body, createdAt: m.createdAt }));
  }

  /** VER-04 parity with Prisma: no recorded expiry means valid; otherwise it must cover the shift. */
  private licenceValidThrough(professionalId: string, shiftEnd: number): boolean {
    const until = this.licenceValidUntil.get(professionalId);
    return until === undefined || until >= shiftEnd;
  }

  /** Test/ops seam mirroring Prisma's Credential.validUntil, so VER-04 expiry is reachable. */
  async setLicenceValidUntil(professionalId: string, validUntil: number | null): Promise<void> {
    if (validUntil === null) this.licenceValidUntil.delete(professionalId);
    else this.licenceValidUntil.set(professionalId, validUntil);
  }

  async getBookingContact(bookingId: string): Promise<BookingContact | null> {
    // Parity with Prisma: resolve the two parties' real phones. This used to return nulls,
    // so MSG-02 (and any regression that leaked or dropped a phone) was never exercised.
    const b = this.bookings.get(bookingId);
    if (!b) return null;
    return {
      clinicPhone: this.clinicOwnerPhone.get(b.clinicWorkspaceId) ?? null,
      professionalPhone: this.professionalPhone.get(b.professionalId) ?? null,
    };
  }

  async recordNotification(input: NotificationInput): Promise<void> {
    // In-memory: notifications aren't persisted for inspection; the mock port logs them.
    void input;
  }

  async listOpenCases(): Promise<CaseSummary[]> {
    const out: CaseSummary[] = [];
    for (const [key, c] of this.supportCases) {
      if (c.state === "Resolved") continue;
      out.push({
        id: c.id,
        kind: key.slice(c.bookingId.length + 1), // key is `${bookingId}:${kind}`
        state: c.state,
        refId: c.bookingId,
        subject: "",
      });
    }
    return out;
  }

  async reconcile(): Promise<Reconciliation> {
    // PAY-11, computed from the recorded events — same shape as the Prisma store. Returning
    // zeros here meant the finance dashboard and the e2e "zero exceptions" assertion were
    // true by construction and could not detect a real imbalance.
    const rows = [...this.bookings.values()].map((b) => {
      const mine = this.events.filter((e) => e.bookingId === b.id);
      const captured = mine.filter((e) => e.type === "Collection").reduce((t, e) => t + e.amount, 0);
      const payouts = mine.filter((e) => e.type === "Payout").reduce((t, e) => t + e.amount, 0);
      const refunds = mine.filter((e) => e.type === "Refund").reduce((t, e) => t + e.amount, 0);
      // Undistributed = what the platform still holds: the fee/tax it keeps, plus anything
      // not yet released. An order conserves when nothing has leaked out of it.
      const undistributed = captured - payouts - refunds;
      return {
        paymentOrderId: b.paymentOrderId ?? b.id,
        bookingId: b.id,
        captured,
        payouts,
        refunds,
        undistributed,
        conserved: undistributed >= 0,
      };
    });
    return {
      rows,
      summary: {
        count: rows.length,
        captured: rows.reduce((t, r) => t + r.captured, 0),
        payouts: rows.reduce((t, r) => t + r.payouts, 0),
        refunds: rows.reduce((t, r) => t + r.refunds, 0),
        exceptions: rows.filter((r) => !r.conserved).length,
      },
    };
  }

  async listPartyBookings(party: "clinic" | "professional", id: string): Promise<BookingHistoryRow[]> {
    const rows: BookingHistoryRow[] = [];
    for (const b of this.bookings.values()) {
      const mine = party === "professional" ? b.professionalId === id : b.clinicWorkspaceId === id;
      if (!mine) continue;
      rows.push({
        bookingId: b.id,
        shiftId: b.shiftId,
        counterpartyId: party === "professional" ? b.clinicWorkspaceId : b.professionalId,
        state: b.state,
        compensation: b.compensation,
        serviceFee: b.serviceFee,
        tax: b.tax,
        total: b.compensation + b.serviceFee + b.tax,
        payoutState: b.payoutState,
      });
    }
    // Most-recent first, matching the Prisma store's `orderBy: confirmedAt desc`.
    return rows.reverse();
  }

  async exportFinancials(): Promise<FinanceExportRow[]> {
    // Degraded: the in-memory store keeps allocation columns but no timestamped event
    // ledger, so events are synthesised from the booking's known financial state.
    const rows: FinanceExportRow[] = [];
    for (const b of this.bookings.values()) {
      if (!b.paymentOrderId) continue;
      const events: FinanceExportRow["events"] = [{ type: "Collection", amount: b.captured, providerRef: null, at: 0 }];
      if (b.payoutState === "Paid") events.push({ type: "Payout", amount: b.compensation, providerRef: null, at: 0 });
      rows.push({
        paymentOrderId: b.paymentOrderId,
        bookingId: b.id,
        state: b.state === "Cancelled" ? "Refunded" : "Captured",
        providerRef: null,
        captured: b.captured,
        compensation: b.compensation,
        serviceFee: b.serviceFee,
        tax: b.tax,
        events,
      });
    }
    return rows;
  }

  private readonly audit: AuditRow[] = [];
  private auditSeq = 0;

  async recordAudit(entry: AuditEntry): Promise<void> {
    // Append-only in memory (index preserves order without a wall clock).
    this.audit.push({ id: `audit-${++this.auditSeq}`, at: this.auditSeq, ...entry });
  }

  async listAudit(limit = 100): Promise<AuditRow[]> {
    return this.audit.slice(-limit).reverse();
  }

  async getMetrics(): Promise<MarketplaceMetrics> {
    const byState = (s: string) => [...this.bookings.values()].filter((b) => b.state === s).length;
    let captured = 0;
    let paidOut = 0;
    for (const b of this.bookings.values()) {
      captured += b.captured;
      if (b.payoutState === "Paid") paidOut += b.compensation;
    }
    const openCases = [...this.supportCases.values()].filter((c) => c.state !== "Resolved").length;
    return {
      shifts: {
        total: this.shifts.size,
        open: [...this.shifts.values()].filter((s) => s.state === "Published").length,
      },
      offers: { total: this.offers.size },
      bookings: {
        total: this.bookings.size,
        confirmed: byState("Confirmed"),
        awaitingCompletion: byState("AwaitingCompletion"),
        completed: byState("ServiceCompleted"),
        cancelled: byState("Cancelled"),
        held: [...this.bookings.values()].filter((b) => b.heldAt !== null).length,
      },
      cases: { open: openCases },
      money: { captured, paidOut, refunded: 0, reconciliationExceptions: 0 },
    };
  }

  async listPendingVerifications(): Promise<PendingVerification[]> {
    const out: PendingVerification[] = [];
    for (const [id, v] of this.clinics) if (v === "Submitted") out.push({ kind: "clinic", id, name: "" });
    for (const [id, v] of this.professionals) {
      if (v === "Submitted") out.push({ kind: "professional", id, name: "" });
    }
    return out;
  }

  async suspendCredential(professionalId: string): Promise<boolean> {
    if (!this.professionals.has(professionalId)) return false;
    this.suspendedCredentials.add(professionalId);
    return true;
  }

  async holdBooking(bookingId: string, reason: string): Promise<BookingDetail | null> {
    void reason; // reason is persisted in the DB store; BookingDetail exposes only heldAt
    const detail = this.bookings.get(bookingId);
    if (!detail) return null;
    if (detail.heldAt === null) detail.heldAt = Date.now();
    return { ...detail };
  }

  async resolveHold(bookingId: string): Promise<BookingDetail | null> {
    const detail = this.bookings.get(bookingId);
    if (!detail) return null;
    detail.heldAt = null;
    // Parity with Prisma: restart the CMP-03 clock from the resolution, so a long-held
    // booking doesn't auto-accept on the next sweep with no clinic review window.
    if (this.autoAcceptAt.has(bookingId)) {
      this.autoAcceptAt.set(bookingId, autoAcceptDueAt(detail.shiftEnd, Date.now()));
    }
    return { ...detail };
  }

  async cancelBooking(input: CancelInput): Promise<CancelResult> {
    const detail = this.bookings.get(input.bookingId);
    if (!detail) throw new Error("booking not found");
    // Idempotency parity with the Prisma cancel-refund idempotencyKey unique constraint.
    if (detail.state === "Cancelled") throw new ConflictError("booking already cancelled");
    detail.state = "Cancelled";
    detail.payoutState = input.payable > 0 ? "Paid" : "NotEligible";
    if (input.payable > 0) this.appendEvent(input.bookingId, "Payout", input.payable, input.payoutKey);
    this.appendEvent(input.bookingId, "Refund", input.refund, input.refundKey);
    return {
      bookingState: "Cancelled",
      payoutState: detail.payoutState,
      refundState: input.payable > 0 ? "PartiallyRefunded" : "Refunded",
      payable: input.payable,
      refund: input.refund,
    };
  }

  /**
   * Append an immutable money event. Mirrors Prisma's FinancialEvent, including the
   * `idempotencyKey` unique constraint (PAY-04) — a duplicate key must conflict here too,
   * or the in-memory store would silently accept a double-spend the real one rejects.
   */
  private appendEvent(
    bookingId: string,
    type: "Collection" | "Payout" | "Refund",
    amount: number,
    key: string,
  ): void {
    if (this.events.some((e) => e.key === key)) {
      throw new ConflictError(`financial event already recorded for key ${key}`);
    }
    this.events.push({ bookingId, type, amount, key });
  }

  private toRecord(d: BookingDetail): BookingRecord {
    return {
      id: d.id,
      offerId: d.offerId,
      shiftId: d.shiftId,
      professionalId: d.professionalId,
      state: d.state,
    };
  }
}

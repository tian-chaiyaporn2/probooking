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
} from "./marketplace.types.js";
import { advanceVerification, aggregateRating } from "@probook/domain";
import type { OfferState, VerificationState, RatingSummary } from "@probook/domain";

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
  private readonly suspendedCredentials = new Set<string>();
  private readonly reviews: MemReview[] = [];
  private readonly shifts = new Map<string, MemShift>();
  private readonly candidates: MemCandidate[] = [];
  private readonly availabilityBlocks: (AvailabilityBlock & { professionalId: string })[] = [];

  async registerClinic(input: RegisterClinicInput): Promise<EntityRef & { ownerUserId: string }> {
    void input;
    const id = randomUUID();
    this.clinics.set(id, "Submitted");
    return { id, verification: "Submitted", ownerUserId: randomUUID() };
  }

  async registerProfessional(input: RegisterProfessionalInput): Promise<EntityRef> {
    void input;
    const id = randomUUID();
    this.professionals.set(id, "Submitted");
    return { id, verification: "Submitted" };
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
      throw new Error("already applied");
    }
    const id = randomUUID();
    this.candidates.push({ shiftId, professionalId, via: "application", state: "Submitted" });
    return { id };
  }

  async inviteToShift(shiftId: string, professionalId: string): Promise<{ id: string }> {
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
    const SHIFT_LEN = 4 * 60 * 60 * 1000;
    for (const b of this.bookings.values()) {
      if (b.professionalId !== professionalId) continue;
      if (b.state !== "Confirmed" && b.state !== "InProgress" && b.state !== "AwaitingCompletion") continue;
      const shift = this.shifts.get(b.shiftId);
      if (!shift) continue;
      if (shift.startsAt < endsAt && shift.startsAt + SHIFT_LEN > startsAt) return true;
    }
    return false;
  }

  async searchProfessionals(filters: ProfessionalFilters): Promise<ProfessionalSearchResult[]> {
    // In-memory keeps only verification state per professional; details are minimal.
    void filters;
    const out: ProfessionalSearchResult[] = [];
    for (const [id, v] of this.professionals) {
      if (v === "Verified") {
        out.push({ id, displayName: "", profession: filters.profession ?? "", specialty: null, rating: null });
      }
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
    const offer = this.offers.get(input.offerId);
    if (offer) offer.state = "Converted"; // atomic with the booking here by construction
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
    };
    this.bookings.set(detail.id, detail);
    this.bookingByOffer.set(input.offerId, detail.id);
    return { booking: this.toRecord(detail), paymentOrderId: detail.paymentOrderId ?? randomUUID() };
  }

  async getBookingByOffer(offerId: string): Promise<BookingRecord | null> {
    const id = this.bookingByOffer.get(offerId);
    const detail = id ? this.bookings.get(id) : undefined;
    return detail ? this.toRecord(detail) : null;
  }

  async getBooking(id: string): Promise<BookingDetail | null> {
    return this.bookings.get(id) ?? null;
  }

  async markCompletion(id: string): Promise<BookingDetail | null> {
    const detail = this.bookings.get(id);
    if (!detail) return null;
    detail.state = "AwaitingCompletion";
    return detail;
  }

  async recordPayout(input: PayoutInput): Promise<PayoutResult> {
    const detail = this.bookings.get(input.bookingId);
    if (!detail) throw new Error("booking not found");
    detail.state = "ServiceCompleted";
    detail.payoutState = "Paid";
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
      throw new Error("duplicate review");
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

  async getBookingContact(bookingId: string): Promise<BookingContact | null> {
    // In-memory keeps no phone directory; contact resolution is a DB-store concern.
    if (!this.bookings.has(bookingId)) return null;
    return { clinicPhone: null, professionalPhone: null };
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
    return detail;
  }

  async resolveHold(bookingId: string): Promise<BookingDetail | null> {
    const detail = this.bookings.get(bookingId);
    if (!detail) return null;
    detail.heldAt = null;
    return detail;
  }

  async cancelBooking(input: CancelInput): Promise<CancelResult> {
    const detail = this.bookings.get(input.bookingId);
    if (!detail) throw new Error("booking not found");
    detail.state = "Cancelled";
    detail.payoutState = input.payable > 0 ? "Paid" : "NotEligible";
    return {
      bookingState: "Cancelled",
      payoutState: detail.payoutState,
      refundState: input.payable > 0 ? "PartiallyRefunded" : "Refunded",
      payable: input.payable,
      refund: input.refund,
    };
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

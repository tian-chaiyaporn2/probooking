import { randomUUID } from "node:crypto";
import type {
  MarketplaceRepository,
  OfferRecord,
  BookingRecord,
  BookingDetail,
  CreateOfferInput,
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
    return {
      clinicVerified: this.clinics.get(o.clinicWorkspaceId) === "Verified",
      professionalVerified: this.professionals.get(o.professionalId) === "Verified",
    };
  }

  async createOffer(input: CreateOfferInput): Promise<OfferRecord> {
    const record: OfferRecord = {
      id: randomUUID(),
      shiftId: randomUUID(),
      clinicWorkspaceId: input.clinicWorkspaceId,
      professionalId: input.professionalId,
      compensation: input.compensation,
      urgency: input.urgency,
      state: "PendingResponse",
      sentAt: input.sentAt,
      shiftStart: input.shiftStart,
      expiresAt: input.expiresAt,
      fundingDueAt: null,
    };
    this.offers.set(record.id, record);
    return record;
  }

  async getOffer(id: string): Promise<OfferRecord | null> {
    return this.offers.get(id) ?? null;
  }

  async listOpenShifts(): Promise<OpenShift[]> {
    return [...this.offers.values()]
      .filter((o) => o.state === "PendingResponse")
      .sort((a, b) =>
        a.urgency === b.urgency ? a.shiftStart - b.shiftStart : a.urgency === "urgent" ? -1 : 1,
      )
      .map((o) => ({
        shiftId: o.shiftId,
        category: "general",
        compensation: o.compensation,
        startsAt: o.shiftStart,
        urgency: o.urgency,
        urgent: o.urgency === "urgent",
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

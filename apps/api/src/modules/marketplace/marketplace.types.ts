import type {
  OfferState,
  BookingState,
  PayoutState,
  RefundState,
  CaseState,
  VerificationState,
  ShiftUrgency,
  RatingSummary,
} from "@probook/domain";

/** The offer view the flow works with (joins Shift fields for compensation/urgency/start). */
export interface OfferRecord {
  id: string;
  shiftId: string;
  clinicWorkspaceId: string;
  professionalId: string;
  compensation: number; // integer satang
  urgency: ShiftUrgency;
  state: OfferState;
  sentAt: number; // epoch ms UTC
  shiftStart: number; // epoch ms UTC
  expiresAt: number; // epoch ms UTC
  fundingDueAt: number | null;
}

// ----- Onboarding & verification (ORG-01, PRO-01, VER-01..02) -----
export interface RegisterClinicInput {
  branchName: string;
  licenceNo: string;
  address: string;
  ownerPhone: string;
}

export interface RegisterProfessionalInput {
  displayName: string;
  profession: string; // physician | dentist (Phase 1)
  phone: string;
  payoutRef: string; // masked payout account reference (VER-07)
}

/** A verifiable entity (clinic or professional). */
export interface EntityRef {
  id: string;
  verification: VerificationState;
}

/** Verification facts read at confirmation (§6.3). */
export interface OfferEligibility {
  clinicVerified: boolean;
  professionalVerified: boolean;
}

// ----- Reviews (REV-01..05) -----
export interface ReviewInput {
  bookingId: string;
  authorId: string;
  subjectId: string;
  score: number; // 1..5
  tags: string[];
  text?: string;
}

export interface ReviewResult {
  id: string;
  /** True once both parties have submitted and the pair was published (REV-03). */
  published: boolean;
}

// ----- Notifications (NOT-01) -----
export type NotificationChannel = "email" | "sms";

export interface NotificationInput {
  channel: NotificationChannel;
  to: string;
  event: string;
  refType?: string;
  refId?: string;
}

export interface BookingRecord {
  id: string;
  offerId: string;
  shiftId: string;
  professionalId: string;
  state: BookingState;
}

export interface CreateOfferInput {
  clinicWorkspaceId: string; // the verified clinic branch posting the shift
  professionalId: string; // the professional the binding offer is sent to
  category: string; // shift category / scope label
  compensation: number; // integer satang
  urgency: ShiftUrgency;
  sentAt: number;
  shiftStart: number;
  expiresAt: number;
}

export interface ConfirmBookingInput {
  offerId: string;
  shiftId: string;
  clinicWorkspaceId: string;
  professionalId: string;
  allocation: {
    compensation: number; // integer satang
    serviceFee: number;
    tax: number;
  };
  captured: number; // integer satang (total collected)
  idempotencyKey: string; // dedupes the collection event (PAY-04)
}

export interface ConfirmBookingResult {
  booking: BookingRecord;
  paymentOrderId: string;
}

/** Full booking view including money state, for the completion/payout phase. */
export interface BookingDetail {
  id: string;
  offerId: string;
  shiftId: string;
  clinicWorkspaceId: string;
  professionalId: string;
  state: BookingState;
  compensation: number; // integer satang
  serviceFee: number;
  tax: number;
  captured: number;
  payoutState: PayoutState;
  paymentOrderId: string | null;
}

export interface PayoutInput {
  bookingId: string;
  payoutAmount: number; // integer satang (the professional's compensation)
  idempotencyKey: string; // dedupes the payout event (PAY-04)
}

export interface PayoutResult {
  bookingState: BookingState;
  payoutState: PayoutState;
  payoutAmount: number;
}

/** An Operations case raised for a booking (SUP-01). */
export interface ReviewCase {
  id: string;
  state: CaseState;
  bookingId: string;
}

export interface CancelInput {
  bookingId: string;
  payable: number; // to the professional (satang)
  refund: number; // to the clinic (satang)
  payoutKey: string; // idempotency key for the payout event (PAY-04)
  refundKey: string; // idempotency key for the refund event (PAY-04)
}

export interface CancelResult {
  bookingState: BookingState;
  payoutState: PayoutState;
  refundState: RefundState;
  payable: number;
  refund: number;
}

/**
 * Persistence port for the booking flow. Two implementations exist:
 *  - InMemoryMarketplaceStore  (no DATABASE_URL — zero-service dev/e2e)
 *  - PrismaMarketplaceStore    (DATABASE_URL set — real Postgres via @probook/db)
 * The controller depends only on this interface.
 */
export interface MarketplaceRepository {
  // --- Onboarding & verification ---
  registerClinic(input: RegisterClinicInput): Promise<EntityRef & { ownerUserId: string }>;
  registerProfessional(input: RegisterProfessionalInput): Promise<EntityRef>;
  /** Operations moves an entity to Verified via the domain machine (VER-01). */
  verifyClinic(id: string): Promise<EntityRef | null>;
  verifyProfessional(id: string): Promise<EntityRef | null>;
  clinicVerification(id: string): Promise<VerificationState | null>;
  /** Verification facts for an offer's clinic and professional (§6.3). */
  getOfferEligibility(offerId: string): Promise<OfferEligibility | null>;

  createOffer(input: CreateOfferInput): Promise<OfferRecord>;
  getOffer(id: string): Promise<OfferRecord | null>;
  /** Transition an offer's state (and optionally set fundingDueAt). Returns the updated record. */
  setOfferState(id: string, state: OfferState, fundingDueAt?: number): Promise<OfferRecord | null>;
  /**
   * Atomically (BKG-02) transition the offer to Converted AND create the Booking and
   * its Payment Protected money records (PaymentOrder + FinancialAllocation + a
   * Collection FinancialEvent) in one transaction. Returns booking + payment order id.
   */
  confirmBooking(input: ConfirmBookingInput): Promise<ConfirmBookingResult>;
  getBookingByOffer(offerId: string): Promise<BookingRecord | null>;

  // --- Completion & payout ---
  getBooking(id: string): Promise<BookingDetail | null>;
  /** Professional submits completion (CMP-01): advances the booking to AwaitingCompletion. */
  markCompletion(id: string): Promise<BookingDetail | null>;
  /**
   * Accept completion and initiate payout (CMP-02/03, PAY-09), atomically: booking ->
   * ServiceCompleted, allocation payout state -> Paid, and an immutable Payout event.
   */
  recordPayout(input: PayoutInput): Promise<PayoutResult>;

  // --- Operations cases (SUP-01) — one per (booking, kind) ---
  findSupportCase(bookingId: string, kind: string): Promise<ReviewCase | null>;
  createSupportCase(bookingId: string, kind: string, subject: string): Promise<ReviewCase>;

  // --- Cancellation & refund (CAN-01..05) ---
  /**
   * Atomically cancel a booking and move money: pay the professional `payable`
   * (if > 0) and refund the clinic `refund`, writing immutable Payout/Refund events
   * and updating the allocation/payment-order states. Idempotent by the event keys.
   */
  cancelBooking(input: CancelInput): Promise<CancelResult>;

  // --- Reviews (REV-01..05) ---
  /**
   * Create a review (one per party per booking, REV-02). If the counterpart party has
   * already reviewed, both are published now (REV-03). Throws on a duplicate by the
   * same author.
   */
  createReview(input: ReviewInput): Promise<ReviewResult>;
  /** Aggregate rating from a subject's PUBLISHED reviews, or null below 3 (REV-04). */
  getSubjectRating(subjectId: string): Promise<RatingSummary | null>;

  // --- Notifications (NOT-01) ---
  recordNotification(input: NotificationInput): Promise<void>;
}

/** DI token for the repository. */
export const MARKETPLACE_REPOSITORY = Symbol("MARKETPLACE_REPOSITORY");

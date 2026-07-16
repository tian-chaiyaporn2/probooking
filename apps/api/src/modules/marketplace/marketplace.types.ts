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

// ----- Availability & search (AVL-01..03, SRC-01..04) -----
export interface AvailabilityBlock {
  id: string;
  startsAt: number; // epoch ms UTC
  endsAt: number;
  openToRequests: boolean;
}

export interface ShiftFilters {
  category?: string; // case-insensitive contains
  urgency?: ShiftUrgency;
  minCompensation?: number; // satang
  maxCompensation?: number;
}

export interface ProfessionalFilters {
  profession?: string;
  specialty?: string;
}

export interface ProfessionalSearchResult {
  id: string;
  displayName: string;
  profession: string;
  specialty: string | null;
  rating: number | null; // aggregate, or null below the cold-start threshold (REV-04)
}

/**
 * VER-03: a professional's public profile, split into what the professional
 * self-declares (unverified claims) versus what the platform has verified. A
 * viewer must be able to tell the two apart — a self-declared specialty is not
 * an endorsement.
 */
export interface VerifiedProfile {
  id: string;
  selfDeclared: {
    displayName: string;
    profession: string;
    specialty: string | null;
  };
  verified: {
    identityVerified: boolean; // profile reached Verified (VER-02)
    licence: { state: string; validUntil: number | null } | null; // VER-04 credential
    insurance: { state: string; validUntil: number | null } | null; // VER-05 evidence
    rating: { count: number; average: number } | null; // null below cold-start (REV-04)
  };
}

/** An open (biddable) shift for the priority-ordered listing (URG-01, SRC-03). */
export interface OpenShift {
  shiftId: string;
  category: string;
  compensation: number; // integer satang
  startsAt: number; // epoch ms UTC
  urgency: ShiftUrgency;
  urgent: boolean;
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
  professionalNotSuspended: boolean; // VER-04: licence credential not suspended by Ops
  licenceValidThroughShiftEnd: boolean; // VER-04: licence not expired before shift ends
  insuranceRequired: boolean; // VER-05: does the shift require insurance?
  insuranceValidThroughShiftEnd: boolean;
}

export interface InsuranceStatus {
  state: string; // VER-05: Verified | UnderReview | Expired | Unverified | NotProvided
  validUntil: number | null; // epoch ms UTC
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

// ----- Booking messages (MSG-01/02) -----
export interface MessageRecord {
  id: string;
  senderId: string;
  body: string;
  createdAt: number; // epoch ms UTC
}

export interface BookingContact {
  clinicPhone: string | null;
  professionalPhone: string | null;
}

// ----- Operations dashboard (ADM-01) -----
export interface CaseSummary {
  id: string;
  kind: string;
  state: CaseState;
  refId: string | null;
  subject: string;
}

export interface PendingVerification {
  kind: "clinic" | "professional";
  id: string;
  name: string;
}

// ----- Finance (PAY-11 reconciliation view) -----
export interface ReconciliationRow {
  paymentOrderId: string;
  bookingId: string | null;
  captured: number; // satang
  payouts: number;
  refunds: number;
  undistributed: number; // captured - payouts - refunds (fee retained + still-protected)
  conserved: boolean; // PAY-08: payouts + refunds <= captured
}

export interface Reconciliation {
  rows: ReconciliationRow[];
  summary: {
    count: number;
    captured: number;
    payouts: number;
    refunds: number;
    exceptions: number; // rows that fail conservation
  };
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

// ----- Shift posting, applications, invitations (APP-01, OFF-01/02) -----
export interface ShiftPostInput {
  clinicWorkspaceId: string;
  category: string;
  compensation: number; // integer satang
  urgency: ShiftUrgency;
  shiftStart: number; // epoch ms UTC
  insuranceRequired: boolean; // VER-05
}

export interface ShiftRecord {
  id: string;
  clinicWorkspaceId: string;
  category: string;
  compensation: number;
  urgency: ShiftUrgency;
  startsAt: number; // epoch ms UTC
  state: string; // ShiftState
  hasActiveOffer: boolean; // OFF-02: one active offer per shift
  booked: boolean;
}

/** A professional who applied to or was invited to a shift. */
export interface Candidate {
  professionalId: string;
  via: "application" | "invitation";
  state: string;
}

export interface CreateOfferForShiftInput {
  shiftId: string;
  professionalId: string;
  sentAt: number;
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
  heldAt: number | null; // VER-06 hold overlay (epoch ms UTC), or null
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

  // --- Insurance evidence (VER-05) ---
  submitInsurance(professionalId: string, validUntil: number): Promise<InsuranceStatus>;
  verifyInsurance(professionalId: string): Promise<InsuranceStatus | null>;
  getInsuranceStatus(professionalId: string): Promise<InsuranceStatus>;

  // --- Shift posting & discovery (APP-01, OFF-01/02) ---
  postShift(input: ShiftPostInput): Promise<{ shiftId: string }>;
  getShift(id: string): Promise<ShiftRecord | null>;
  applyToShift(shiftId: string, professionalId: string): Promise<{ id: string }>;
  inviteToShift(shiftId: string, professionalId: string): Promise<{ id: string }>;
  listShiftCandidates(shiftId: string): Promise<Candidate[]>;
  /** Create the one binding offer for a shift (OFF-02); marks the applicant OfferSent. */
  createOfferForShift(input: CreateOfferForShiftInput): Promise<OfferRecord>;
  getOffer(id: string): Promise<OfferRecord | null>;
  /** Open shifts (Published, no active offer, unbooked), urgent first then soonest (URG-01/SRC-03). */
  listOpenShifts(filters?: ShiftFilters): Promise<OpenShift[]>;

  // --- Availability & professional search (AVL, SRC) ---
  addAvailability(professionalId: string, startsAt: number, endsAt: number, openToRequests: boolean): Promise<AvailabilityBlock>;
  listAvailability(professionalId: string): Promise<AvailabilityBlock[]>;
  /** AVL-03/§6.3: does the professional have a confirmed booking overlapping [startsAt, endsAt]? */
  hasScheduleOverlap(professionalId: string, startsAt: number, endsAt: number): Promise<boolean>;
  searchProfessionals(filters: ProfessionalFilters): Promise<ProfessionalSearchResult[]>;
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

  /** VER-03: self-declared vs platform-verified profile facts. */
  getProfessionalProfile(id: string): Promise<VerifiedProfile | null>;

  // --- Booking messages (MSG-01/02) ---
  postMessage(bookingId: string, senderId: string, body: string): Promise<MessageRecord>;
  listMessages(bookingId: string): Promise<MessageRecord[]>;
  /** Party contact details — revealed after confirmation (MSG-02). */
  getBookingContact(bookingId: string): Promise<BookingContact | null>;

  // --- Notifications (NOT-01) ---
  recordNotification(input: NotificationInput): Promise<void>;

  // --- Credential hold (VER-04/06) ---
  /** Operations suspends a professional's licence credential (idempotent). Returns false if none. */
  suspendCredential(professionalId: string): Promise<boolean>;
  /** Place a booking on Hold (overlay), idempotent. Returns the updated booking. */
  holdBooking(bookingId: string, reason: string): Promise<BookingDetail | null>;
  /** Clear a booking's Hold after Operations review. */
  resolveHold(bookingId: string): Promise<BookingDetail | null>;

  // --- Operations dashboard (ADM-01) ---
  listOpenCases(): Promise<CaseSummary[]>;
  listPendingVerifications(): Promise<PendingVerification[]>;

  // --- Finance (PAY-11) ---
  reconcile(): Promise<Reconciliation>;
}

/** DI token for the repository. */
export const MARKETPLACE_REPOSITORY = Symbol("MARKETPLACE_REPOSITORY");

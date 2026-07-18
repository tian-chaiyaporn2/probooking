import type {
  OfferState,
  BookingState,
  PayoutState,
  RefundState,
  CaseState,
  VerificationState,
  ShiftUrgency,
  RatingSummary,
  Role,
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
  specialtyValidThroughShiftEnd: boolean; // specialty_evidence credential, if any
  insuranceRequired: boolean; // VER-05: does the shift require insurance?
  insuranceValidThroughShiftEnd: boolean;
}

export interface InsuranceStatus {
  state: string; // VER-05: Verified | UnderReview | Expired | Unverified | NotProvided
  validUntil: number | null; // epoch ms UTC
}

// ----- Audit trail (§6.4, §7.3, ADM-01) -----
export interface AuditEntry {
  actor: string; // token subject (staff phone / dev role) — masked for display
  role: string;
  action: string; // e.g. "verify_professional", "suspend_credential"
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}

export interface AuditRow extends AuditEntry {
  id: string;
  at: number; // epoch ms UTC
}

// ----- Reporting & exports (REP-01..03) -----
/** REP-01: one row of a party's booking + financial history. */
export interface BookingHistoryRow {
  bookingId: string;
  shiftId: string;
  counterpartyId: string; // the other party on the booking
  state: string;
  compensation: number; // satang
  serviceFee: number;
  tax: number;
  total: number;
  payoutState: string;
}

/** REP-02: a payment order's allocation + events for the Finance export. */
export interface FinanceExportRow {
  paymentOrderId: string;
  bookingId: string | null;
  state: string;
  providerRef: string | null;
  captured: number; // satang
  compensation: number | null;
  serviceFee: number | null;
  tax: number | null;
  events: { type: string; amount: number; providerRef: string | null; at: number }[];
}

/** REP-03: core marketplace + operations metrics for management. */
export interface MarketplaceMetrics {
  shifts: { total: number; open: number };
  offers: { total: number };
  bookings: {
    total: number;
    confirmed: number;
    awaitingCompletion: number;
    completed: number;
    cancelled: number;
    held: number;
  };
  cases: { open: number };
  money: { captured: number; paidOut: number; refunded: number; reconciliationExceptions: number };
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
/**
 * The parties an authenticated caller acts as. A phone can be a professional, a member of
 * one or more clinic workspaces, or both — so this is a set of hats, not a single role.
 */
export interface CallerIdentity {
  userId: string | null;
  /** The caller's own professional profile, if they registered as one. */
  professionalId: string | null;
  /** Clinic workspaces the caller belongs to, with the role they hold in each (§3). */
  memberships: { workspaceId: string; role: Role }[];
}

/** Enriched "who am I" for the party UIs — ids plus the human names they render. */
export interface MeIdentity {
  professionalId: string | null;
  professionalName: string | null;
  professionalVerification: string | null;
  clinics: { workspaceId: string; name: string; role: Role; verification: string }[];
}

/** A shift a clinic posted, with the rollup its dashboard needs to drive the flow. */
export interface ClinicShiftRow {
  shiftId: string;
  category: string;
  compensation: number; // satang
  urgency: ShiftUrgency;
  startsAt: number; // epoch ms UTC
  state: string;
  hasActiveOffer: boolean;
  booked: boolean;
  candidateCount: number;
  /** The current non-terminal offer (so the clinic can confirm once the pro accepts). */
  offer: { id: string; state: string; professionalId: string } | null;
}

/** An offer made to a professional, with the shift summary their dashboard shows. */
export interface ProfessionalOfferRow {
  offerId: string;
  shiftId: string;
  category: string;
  compensation: number; // satang
  urgency: ShiftUrgency;
  shiftStart: number; // epoch ms UTC
  state: string;
  expiresAt: number; // epoch ms UTC
}

/** §6.4: a money action proposed by one authorized person, executed by a different one. */
export interface ApprovalRequestRecord {
  id: string;
  capability: string;
  refType: string;
  refId: string;
  amount: number; // integer satang
  reason: string;
  state: "Pending" | "Executed" | "Rejected";
  initiatorId: string;
  initiatorRole: string;
  executorId: string | null;
  executorRole: string | null;
  createdAt: number; // epoch ms UTC
  decidedAt: number | null;
}

export interface CreateApprovalInput {
  capability: string;
  refType: string;
  refId: string;
  amount: number;
  reason: string;
  initiatorId: string;
  initiatorRole: string;
}

export interface ExecuteApprovalInput {
  approvalId: string;
  executorId: string;
  executorRole: string;
  /** Dedupes the money event this approval writes (PAY-04). */
  idempotencyKey: string;
}

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
  /**
   * Scheduled shift window (epoch ms UTC). Carried on the booking so money decisions that
   * depend on timing — the CAN-01/02 24h boundary above all — are computed from the
   * scheduled shift rather than from a value the cancelling party supplies.
   */
  shiftStart: number;
  shiftEnd: number;
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
  /** AVL-03/§6.3: does the professional have a conflicting booking or soft hold overlapping [startsAt, endsAt)? */
  hasScheduleOverlap(
    professionalId: string,
    startsAt: number,
    endsAt: number,
    opts?: { excludeOfferId?: string },
  ): Promise<boolean>;
  searchProfessionals(filters: ProfessionalFilters): Promise<ProfessionalSearchResult[]>;
  /**
   * Transition an offer's state (and optionally set fundingDueAt).
   * When `from` is set, the write is conditional on the current state (accept TOCTOU).
   * Returns null if the offer is missing or the conditional claim fails.
   */
  setOfferState(
    id: string,
    state: OfferState,
    opts?: { fundingDueAt?: number; from?: OfferState },
  ): Promise<OfferRecord | null>;
  /**
   * OFF-03: move past-deadline PendingResponse / AwaitingPayment offers to Expired.
   * Returns how many offers were expired this pass.
   */
  expireStaleOffers(now: number): Promise<number>;
  /**
   * Atomically (BKG-02) transition the offer to Converted AND create the Booking and
   * its Payment Protected money records (PaymentOrder + FinancialAllocation + a
   * Collection FinancialEvent) in one transaction. Returns booking + payment order id.
   */
  confirmBooking(input: ConfirmBookingInput): Promise<ConfirmBookingResult>;
  getBookingByOffer(offerId: string): Promise<BookingRecord | null>;

  // --- Completion & payout ---
  /**
   * Resolve who the authenticated caller is, from the phone their token carries (§3).
   *
   * Authority is derived here, not read from the request: a token proves possession of a
   * phone, and the platform decides what that phone may do. Endpoints previously took
   * `actorRole` and party ids from the body, which made every authority check a
   * self-certification.
   */
  resolveIdentity(phone: string): Promise<CallerIdentity>;
  /** Enriched identity (names + verification) for the caller's own dashboards. */
  describeMe(phone: string): Promise<MeIdentity>;
  /** Shifts a clinic workspace posted, with candidate/offer/booking rollup. */
  listClinicShifts(workspaceId: string): Promise<ClinicShiftRow[]>;
  /** Offers currently made to a professional. */
  listProfessionalOffers(professionalId: string): Promise<ProfessionalOfferRow[]>;

  // ----- §6.4 dual control -----
  /** Propose a money action. Writes no money — it only records the request. */
  createApproval(input: CreateApprovalInput): Promise<ApprovalRequestRecord>;
  getApproval(id: string): Promise<ApprovalRequestRecord | null>;
  listPendingApprovals(): Promise<ApprovalRequestRecord[]>;
  /**
   * Execute a pending approval: mark it Executed and write its immutable Refund event, in
   * one transaction. The Pending precondition is asserted as part of the write, so two
   * approvers racing produce one execution rather than two refunds.
   * Also enforces remaining refundable headroom (PAY-08) against prior Refund events.
   */
  executeApproval(input: ExecuteApprovalInput): Promise<{ refund: number; bookingId: string }>;

  /**
   * PAY-08: satang still available to refund on this booking — captured minus executed
   * Refund events minus Pending dual-control proposals. Returns 0 when there is no
   * payment order yet.
   */
  refundAvailable(bookingId: string): Promise<number>;

  getBooking(id: string): Promise<BookingDetail | null>;
  /** Sum of Refund financial events for a booking (PAY-08 remaining headroom). */
  sumRefunded(bookingId: string): Promise<number>;
  /** Sum of Payout financial events for a booking (receipt / partial cancel). */
  sumPaidOut(bookingId: string): Promise<number>;
  /**
   * CAN-03: did the professional actually arrive for this booking? Answered from the
   * recorded attendance trail — arrival decides a 100% payout, so it must be an observed
   * event, not a flag the cancelling party asserts.
   */
  hasArrived(bookingId: string): Promise<boolean>;
  /** CAN-03: record the professional's arrival for a booking (idempotent). */
  recordArrival(bookingId: string): Promise<boolean>;
  /**
   * CMP-03: the booking's auto-accept deadline (epoch ms UTC), or null if completion was
   * never submitted. Lets the API enforce the deadline itself rather than trusting that the
   * only caller is a correctly-filtered worker sweep.
   */
  getAutoAcceptDueAt(bookingId: string): Promise<number | null>;
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

  /** REP-01: a party's booking + financial history (most recent first). */
  listPartyBookings(party: "clinic" | "professional", id: string): Promise<BookingHistoryRow[]>;

  /** REP-02: allocations + events + provider refs for the Finance export. */
  exportFinancials(): Promise<FinanceExportRow[]>;

  /** REP-03: core marketplace + operations metrics. */
  getMetrics(): Promise<MarketplaceMetrics>;

  /** §7.3/§6.4: append an immutable audit record for a privileged action. */
  recordAudit(entry: AuditEntry): Promise<void>;

  /** §7.3: recent audit records, most recent first (actor masked by the caller). */
  listAudit(limit?: number): Promise<AuditRow[]>;

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

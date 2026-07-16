/**
 * Record states (PRD §6.2 "State ownership").
 *
 * Holds and support cases are OVERLAYS — they do not overwrite history (§6.2).
 * Customer-facing labels (e.g. "Awaiting Payment", "Filled") are DERIVED from the
 * owning records, never stored as the source of truth (§6.2, BDD area 14).
 */

export const ShiftState = [
  "Draft",
  "Published",
  "Paused",
  "Closed",
  "Cancelled",
  "Archived",
] as const;
export type ShiftState = (typeof ShiftState)[number];

export const ApplicationState = [
  "Submitted",
  "Shortlisted",
  "OfferSent",
  "Booked",
  "Withdrawn",
  "Declined",
  "NotSelected",
  "Expired",
] as const;
export type ApplicationState = (typeof ApplicationState)[number];

export const InvitationState = [
  "Sent",
  "Viewed",
  "Interested",
  "Declined",
  "Withdrawn",
  "Expired",
] as const;
export type InvitationState = (typeof InvitationState)[number];

export const OfferState = [
  "PendingResponse",
  "AwaitingPayment",
  "Converted",
  "Declined",
  "Withdrawn",
  "Expired",
  "PaymentFailed",
] as const;
export type OfferState = (typeof OfferState)[number];

export const BookingState = [
  "Confirmed",
  "InProgress",
  "AwaitingCompletion",
  "ServiceCompleted",
  "Cancelled",
  "Archived",
] as const;
export type BookingState = (typeof BookingState)[number];

export const PaymentOrderState = [
  "Created",
  "Pending",
  "PaymentProtected",
  "Failed",
  "Expired",
  "Refunding",
  "Refunded",
  "Exception",
] as const;
export type PaymentOrderState = (typeof PaymentOrderState)[number];

export const PayoutState = [
  "NotEligible",
  "Processing",
  "Paid",
  "Failed",
  "Held",
  "Reversed",
] as const;
export type PayoutState = (typeof PayoutState)[number];

export const RefundState = [
  "None",
  "Pending",
  "PartiallyRefunded",
  "Refunded",
  "Failed",
  "Exception",
] as const;
export type RefundState = (typeof RefundState)[number];

/** Verification states (VER-02). Applies to clinics, professionals, credentials, insurance. */
export const VerificationState = [
  "Draft",
  "Submitted",
  "UnderReview",
  "NeedsInformation",
  "Verified",
  "Rejected",
  "Suspended",
  "Expired",
  "Closed",
] as const;
export type VerificationState = (typeof VerificationState)[number];

/** Support case states (SUP-02). */
export const CaseState = ["Open", "AwaitingUser", "UnderReview", "Resolved", "Reopened"] as const;
export type CaseState = (typeof CaseState)[number];

/**
 * Time-based and money policies (PRD §5.4 offers, §5.7 completion/cancellation).
 * All durations in milliseconds. Times are UTC (LOC-02); "before shift start" is
 * evaluated against the shift's scheduled start in UTC.
 */

import { assertNonNegative, satang, type Satang } from "./money.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Offer & funding timers (OFF-03). All expire by shift start regardless. */
export const OFFER_TIMERS = {
  standardExpiry: 12 * HOUR,
  urgentExpiry: 2 * HOUR,
  fundingWindow: 30 * MINUTE, // after acceptance (OFF-03)
} as const;

/** A shift within this window of start may receive the Urgent badge (URG-01). */
export const URGENT_WINDOW = 72 * HOUR;

/** URG-01: a shift may be marked Urgent only if it starts within the 72h window. */
export function isUrgentEligible(shiftStart: number, now: number): boolean {
  const delta = shiftStart - now;
  return delta > 0 && delta <= URGENT_WINDOW;
}

/** NOT-01 booking reminders: sent 24h and 3h before the shift start. */
export const REMINDER_24H_BEFORE = 24 * HOUR;
export const REMINDER_3H_BEFORE = 3 * HOUR;

/** Auto-accept of professional-submitted completion (CMP-03): once, after 24h. */
export const AUTO_ACCEPT_AFTER = 24 * HOUR;

/** Clinic inactivity after which Operations reviews completion (CMP-04). */
export const CLINIC_COMPLETION_REVIEW_AFTER = 48 * HOUR;

/**
 * CMP-03: when a professional submits completion, auto-accept fires once after 24h,
 * measured from the LATER of scheduled shift end and the submission time. Returns the
 * epoch-ms instant at which auto-accept becomes due.
 */
export function autoAcceptDueAt(scheduledEnd: number, submittedAt: number): number {
  return Math.max(scheduledEnd, submittedAt) + AUTO_ACCEPT_AFTER;
}

/**
 * CMP-04: if the professional never submits completion, the booking is routed to
 * Operations 48h after the scheduled shift end. Returns that epoch-ms instant.
 */
export function completionReviewDueAt(scheduledEnd: number): number {
  return scheduledEnd + CLINIC_COMPLETION_REVIEW_AFTER;
}

export type ShiftUrgency = "standard" | "urgent";

export function offerExpiryFor(urgency: ShiftUrgency): number {
  return urgency === "urgent" ? OFFER_TIMERS.urgentExpiry : OFFER_TIMERS.standardExpiry;
}

/**
 * Effective offer expiry: the earlier of the timer-based expiry and shift start
 * (OFF-03 "All expire by shift start"). Timestamps are epoch ms (UTC).
 */
export function effectiveOfferExpiry(
  sentAt: number,
  shiftStart: number,
  urgency: ShiftUrgency,
): number {
  return Math.min(sentAt + offerExpiryFor(urgency), shiftStart);
}

/**
 * OFF-03 funding deadline after acceptance: earlier of acceptedAt + 30m and shift start.
 * Mirrors `effectiveOfferExpiry` — funding must not outlive the shift.
 */
export function effectiveFundingExpiry(acceptedAt: number, shiftStart: number): number {
  return Math.min(acceptedAt + OFFER_TIMERS.fundingWindow, shiftStart);
}

/** Inclusive expiry: the deadline instant itself is already expired (OFF-03). */
export function isExpired(now: number, expiresAt: number): boolean {
  return now >= expiresAt;
}

/**
 * Cancellation compensation policy (CAN-01..CAN-05).
 * Returns the professional's payable fraction (0..1) of scheduled compensation,
 * or the sentinel "support" when the outcome requires a support case.
 */
export type CancelActor = "clinic" | "professional";
export type CancelReason =
  | "ordinary"
  | "clinic_unavailable_after_arrival" // CAN-03
  | "force_majeure" // CAN-05
  | "safety" // CAN-05
  | "credential" // CAN-05
  | "platform_or_provider_failure" // CAN-05
  | "partial_work"; // CAN-05

export type CancelOutcome = { fraction: number } | { support: true };

export function cancellationOutcome(input: {
  actor: CancelActor;
  reason: CancelReason;
  hoursBeforeStart: number; // hours between cancellation and scheduled start
  arrived: boolean;
}): CancelOutcome {
  const { actor, reason, hoursBeforeStart, arrived } = input;

  // NaN/Infinity fall through comparisons unpredictably (e.g. NaN >= 24 is false → 50%).
  if (!Number.isFinite(hoursBeforeStart)) {
    throw new RangeError(`hoursBeforeStart must be finite, got ${hoursBeforeStart}`);
  }

  // CAN-05: these always route to support regardless of actor/timing.
  if (
    reason === "force_majeure" ||
    reason === "safety" ||
    reason === "credential" ||
    reason === "platform_or_provider_failure" ||
    reason === "partial_work"
  ) {
    return { support: true };
  }

  if (actor === "professional") {
    // CAN-04: professional cancellation / no-show before work -> 0%.
    return { fraction: 0 };
  }

  // actor === "clinic"
  // CAN-03: substantiated clinic unavailability after arrival -> default 100%.
  // Arrival is an EVENT, not a point on the clock: a professional who arrives early and is
  // turned away has still travelled and lost the slot. Gating this on `hoursBeforeStart <= 0`
  // silently paid them 50% for any arrival before the scheduled start. Conversely the
  // reason alone is not enough — "after arrival" requires an arrival to have happened, or a
  // clinic could claim 100% for a shift nobody turned up to.
  if (arrived) {
    return { fraction: 1 };
  }
  if (reason === "clinic_unavailable_after_arrival") {
    // Reason asserts an arrival the attendance trail does not support: fall through to the
    // ordinary timing rules rather than paying out on an unsubstantiated claim.
    return hoursBeforeStart >= 24 ? { fraction: 0 } : { fraction: 0.5 };
  }
  if (hoursBeforeStart >= 24) {
    return { fraction: 0 }; // CAN-01: at least 24h before start -> 0%
  }
  return { fraction: 0.5 }; // CAN-02: under 24h -> 50%
}

/** Payable amount given scheduled compensation and a numeric fraction (0..1). */
export function payableFromFraction(compensation: Satang, fraction: number): Satang {
  // Both guards are cheap and this is the rounding step for every cancellation payout: a
  // negative compensation or an out-of-range fraction here pays the wrong party.
  assertNonNegative(compensation, "compensation");
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new RangeError(`Payable fraction must be between 0 and 1, got ${fraction}`);
  }
  return satang(Math.round(compensation * fraction));
}

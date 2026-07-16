/**
 * Eligibility at confirmation (PRD §6.3) and non-negotiable integrity rules (§6.4).
 *
 * BKG-01: Confirmation requires accepted terms, current eligibility, no conflict,
 * no blocking hold, and durable successful prefunding.
 * BKG-02: Confirmation is atomic; one shift cannot produce two bookings.
 */

export interface ConfirmationContext {
  clinicActiveVerified: boolean;
  professionalActiveVerified: boolean;
  licenceValidThroughShiftEnd: boolean;
  specialtyValidThroughShiftEnd: boolean;
  insuranceRequired: boolean;
  insuranceValidThroughShiftEnd: boolean;
  clinicServiceSupported: boolean; // supported clinic service & shift category
  shiftCategorySupported: boolean;
  hasSuspension: boolean;
  hasBlockingHold: boolean;
  hasScheduleOverlap: boolean;
  offerExpired: boolean;
  durablePrefundingSucceeded: boolean;
}

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; failures: string[] };

/** Returns every failed check so callers can surface precise reasons (not just a boolean). */
export function checkConfirmationEligibility(ctx: ConfirmationContext): EligibilityResult {
  const failures: string[] = [];

  if (!ctx.clinicActiveVerified) failures.push("clinic_not_active_verified");
  if (!ctx.professionalActiveVerified) failures.push("professional_not_active_verified");
  if (!ctx.licenceValidThroughShiftEnd) failures.push("licence_invalid_through_shift_end");
  if (!ctx.specialtyValidThroughShiftEnd) failures.push("specialty_invalid_through_shift_end");
  if (ctx.insuranceRequired && !ctx.insuranceValidThroughShiftEnd) {
    failures.push("insurance_invalid_through_shift_end");
  }
  if (!ctx.clinicServiceSupported) failures.push("clinic_service_unsupported");
  if (!ctx.shiftCategorySupported) failures.push("shift_category_unsupported");
  if (ctx.hasSuspension) failures.push("suspended");
  if (ctx.hasBlockingHold) failures.push("blocking_hold");
  if (ctx.hasScheduleOverlap) failures.push("schedule_overlap");
  if (ctx.offerExpired) failures.push("offer_expired"); // §6.3: late payment after expiry never books
  if (!ctx.durablePrefundingSucceeded) failures.push("prefunding_failed");

  return failures.length === 0 ? { eligible: true } : { eligible: false, failures };
}

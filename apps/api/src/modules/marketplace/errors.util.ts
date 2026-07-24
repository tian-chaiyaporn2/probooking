/**
 * Distinguishes an expected business conflict (unique-constraint / duplicate) from an
 * unexpected infrastructure failure, so controllers map the former to 409/400 and let
 * the latter surface as 500 instead of masking incidents behind a business message.
 */

/** Thrown by the in-memory store for known conflicts (mirrors Prisma's P2002). */
export class ConflictError extends Error {}

/** §6.3 confirmation gate failed (may be raised inside confirmBooking after capture). */
export class EligibilityError extends Error {
  constructor(failures: string[]) {
    super(`NOT_ELIGIBLE: ${failures.join(", ")}`);
    this.name = "EligibilityError";
  }
}

export function isConflict(e: unknown): boolean {
  if (e instanceof ConflictError) return true;
  // Prisma unique-constraint violation.
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export function isEligibilityError(e: unknown): boolean {
  return e instanceof EligibilityError || (e instanceof Error && e.message.startsWith("NOT_ELIGIBLE:"));
}

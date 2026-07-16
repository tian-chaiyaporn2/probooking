/**
 * Distinguishes an expected business conflict (unique-constraint / duplicate) from an
 * unexpected infrastructure failure, so controllers map the former to 409/400 and let
 * the latter surface as 500 instead of masking incidents behind a business message.
 */

/** Thrown by the in-memory store for known conflicts (mirrors Prisma's P2002). */
export class ConflictError extends Error {}

export function isConflict(e: unknown): boolean {
  if (e instanceof ConflictError) return true;
  // Prisma unique-constraint violation.
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

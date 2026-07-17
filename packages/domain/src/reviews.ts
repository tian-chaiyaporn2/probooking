/**
 * Review rules (REV-01..05). Pure helpers; the API/store enforce the gates
 * (only completed paid bookings create review rights, one per party, etc.).
 */

const DAY = 24 * 60 * 60 * 1000;

/** REV-03: an unpublished review auto-publishes 7 days after creation. */
export const REVIEW_PUBLISH_AFTER = 7 * DAY;

/** REV-04: aggregate rating and rating-based sorting begin after three published reviews. */
export const MIN_PUBLISHED_REVIEWS_FOR_RATING = 3;

export interface RatingSummary {
  count: number;
  average: number;
}

/**
 * REV-04: aggregate rating for a subject from its PUBLISHED review scores. Returns
 * null until the cold-start threshold (3) is reached — no rating is shown before then.
 */
export function aggregateRating(publishedScores: readonly number[]): RatingSummary | null {
  if (publishedScores.length < MIN_PUBLISHED_REVIEWS_FOR_RATING) return null;
  const sum = publishedScores.reduce((a, b) => a + b, 0);
  return { count: publishedScores.length, average: sum / publishedScores.length };
}

/**
 * REV-04 for a subject whose reviews the caller has already counted and averaged — e.g. a
 * store that aggregated in SQL rather than fetching every score.
 *
 * The cold-start threshold is the rule, so it stays here: a caller that has a count and an
 * average should not have to reconstruct a fake score array to ask the domain, nor
 * re-express `>= 3` as a HAVING clause the next reader must reconcile with this file.
 */
export function ratingFromCounts(count: number, average: number): RatingSummary | null {
  if (count < MIN_PUBLISHED_REVIEWS_FOR_RATING) return null;
  return { count, average };
}

/** REV-03: the instant an unpublished review created at `createdAt` auto-publishes. */
export function reviewPublishDueAt(createdAt: number): number {
  return createdAt + REVIEW_PUBLISH_AFTER;
}

/**
 * REV-01/05: only a completed, paid production booking confers review rights. A
 * cancelled or unfinished booking never reaches ServiceCompleted, so it earns none.
 */
export function canLeaveReview(bookingState: string): boolean {
  return bookingState === "ServiceCompleted";
}

/**
 * REV-05: a related-party booking creates no public reputation (it would let a party
 * inflate its own rating). Returns whether a review should count toward the public rating.
 */
export function countsTowardPublicReputation(isRelatedParty: boolean): boolean {
  return !isRelatedParty;
}

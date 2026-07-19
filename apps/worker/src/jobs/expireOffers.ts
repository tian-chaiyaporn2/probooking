import { prisma } from "@probook/db";
import { advanceOffer, type OfferState } from "@probook/domain";

/** Bound each pass; a backlog drains across passes rather than in one unbounded query. */
const BATCH = 500;

export interface ExpireOffersResult {
  due: number;
  expired: number;
  failed: number;
}

/**
 * OFF-03 offer-expiry sweep. PendingResponse offers expire at their response deadline.
 * Once the professional has accepted, AwaitingPayment / PaymentFailed offers expire only
 * when their funding window (`fundingDueAt`) has elapsed. `expiresAt` passing must not
 * withdraw an accepted offer while payment is still within its funding window.
 *
 * Stale active offers still count for the partial unique index and open-shift listing —
 * blocking a new offer (OFF-02) forever — so this job transitions rows only after the
 * correct deadline for their current state has elapsed.
 *
 * Pure state (no money) → write Prisma directly, same shape as reviewPublish. Domain
 * `advanceOffer` validates the transition; races that already left the active set are skipped.
 *
 * Prefer per-row updates over a bulk `updateMany` that treats `fundingDueAt: null` or
 * `expiresAt` as already due for funded states — that would expire AwaitingPayment offers
 * before their funding window closes.
 */
export function isOfferDueForExpiry(input: {
  state: OfferState;
  expiresAt: number;
  fundingDueAt: number | null;
  now: number;
}): boolean {
  if (input.state === "PendingResponse") return input.expiresAt <= input.now;
  if (input.state === "AwaitingPayment" || input.state === "PaymentFailed") {
    return input.fundingDueAt !== null && input.fundingDueAt <= input.now;
  }
  return false;
}

export async function expireOffersSweep(now: number): Promise<ExpireOffersResult> {
  const at = new Date(now);
  const due = await prisma.offer.findMany({
    where: {
      state: { in: ["PendingResponse", "AwaitingPayment", "PaymentFailed"] },
      OR: [
        { AND: [{ state: "PendingResponse" }, { expiresAt: { lte: at } }] },
        // Funding window elapsed after accept/failure (OFF-03).
        { AND: [{ state: { in: ["AwaitingPayment", "PaymentFailed"] } }, { fundingDueAt: { not: null, lte: at } }] },
      ],
    },
    select: { id: true, state: true },
    orderBy: { expiresAt: "asc" },
    take: BATCH,
  });

  let expired = 0;
  let failed = 0;
  for (const o of due) {
    try {
      advanceOffer(o.state as OfferState, "Expired");
      const updated = await prisma.offer.updateMany({
        where: {
          id: o.id,
          state: { in: ["PendingResponse", "AwaitingPayment", "PaymentFailed"] },
        },
        data: { state: "Expired" },
      });
      if (updated.count === 1) expired++;
    } catch (e) {
      failed++;
      console.error(`[offer-expiry] ${o.id} failed:`, (e as Error).message);
    }
  }
  if (due.length === BATCH) {
    console.log(`[offer-expiry] batch full (${BATCH}); more due offers remain for the next pass`);
  }
  return { due: due.length, expired, failed };
}

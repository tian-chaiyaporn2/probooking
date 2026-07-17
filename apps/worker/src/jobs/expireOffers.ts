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
 * OFF-03 offer-expiry sweep. Wall-clock-expired offers that stay in
 * PendingResponse / AwaitingPayment / PaymentFailed still count as "active" for the
 * partial unique index and open-shift listing — blocking a new offer (OFF-02) forever.
 * Confirm already rejects late payment via `offerExpired`; this job transitions the row
 * so the DB invariant matches wall-clock reality.
 *
 * Pure state (no money) → write Prisma directly, same shape as reviewPublish. Domain
 * `advanceOffer` validates the transition; races that already left the active set are skipped.
 *
 * Prefer per-row updates over a bulk `updateMany` that treats `fundingDueAt: null` as
 * already due — that would expire AwaitingPayment offers that have not yet stamped a window.
 */
export async function expireOffersSweep(now: number): Promise<ExpireOffersResult> {
  const at = new Date(now);
  const due = await prisma.offer.findMany({
    where: {
      state: { in: ["PendingResponse", "AwaitingPayment", "PaymentFailed"] },
      OR: [
        { expiresAt: { lte: at } },
        // Funding window elapsed after accept (OFF-03) — still AwaitingPayment.
        { AND: [{ state: "AwaitingPayment" }, { fundingDueAt: { not: null, lte: at } }] },
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

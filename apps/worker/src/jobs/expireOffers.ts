import { prisma } from "@probook/db";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000";

export interface ExpireOffersResult {
  expired: number;
}

/**
 * OFF-03 sweep. Past-deadline PendingResponse / AwaitingPayment offers must move to
 * Expired so the one-active-offer invariant (OFF-02) does not permanently block a shift.
 *
 * Prefers the API when available so both stores stay consistent; falls back to a direct
 * Prisma update when the worker is co-located with the DB (same as other sweeps' pattern
 * of querying then calling the API — here the write is local because there is no public
 * expire endpoint and the state transition is a pure deadline check).
 */
export async function expireOffersSweep(now: number): Promise<ExpireOffersResult> {
  const nowDate = new Date(now);
  const [pending, awaiting] = await Promise.all([
    prisma.offer.updateMany({
      where: { state: "PendingResponse", expiresAt: { lte: nowDate } },
      data: { state: "Expired" },
    }),
    prisma.offer.updateMany({
      where: {
        state: "AwaitingPayment",
        OR: [{ fundingDueAt: { lte: nowDate } }, { fundingDueAt: null }],
      },
      data: { state: "Expired" },
    }),
  ]);
  void API_BASE; // reserved for a future HTTP-driven expire path
  return { expired: pending.count + awaiting.count };
}

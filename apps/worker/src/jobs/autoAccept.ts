import { prisma } from "@probook/db";
import { workerAuthHeaders } from "../auth.js";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000";

/** Bound each pass; a backlog drains across passes rather than in one unbounded query. */
const BATCH = 500;

export interface SweepResult {
  due: number;
  accepted: number;
  failed: number;
}

/**
 * CMP-03 auto-accept sweep. Finds bookings whose professional-submitted completion
 * has passed its 24h deadline (`autoAcceptAt`) and are still `AwaitingCompletion`
 * — i.e. the clinic has not accepted and there is no terminal hold — then triggers
 * the controlled `accept-completion` action on the API for each.
 *
 * Why call the API rather than write money here: the payout (booking ->
 * ServiceCompleted, allocation Paid, Payout event, PAY-07 conservation) is a single
 * controlled action owned by the API. The worker is the scheduler; it does not
 * duplicate money logic. Idempotent by construction: a booking the clinic already
 * accepted is no longer `AwaitingCompletion` (skipped), and accept-completion itself
 * is idempotent if a race occurs.
 */
export async function autoAcceptSweep(now: number): Promise<SweepResult> {
  const due = await prisma.booking.findMany({
    where: {
      state: "AwaitingCompletion",
      autoAcceptAt: { not: null, lte: new Date(now) },
      heldAt: null, // VER-06: never auto-accept a held booking
    },
    select: { id: true },
    // Bound the pass. The candidate set only shrinks as bookings are accepted, so a backlog
    // drains across passes instead of pulling every row into memory at once.
    take: BATCH,
  });

  let accepted = 0;
  let failed = 0;
  for (const booking of due) {
    try {
      const res = await fetch(`${API_BASE}/bookings/${booking.id}/accept-completion`, {
        method: "POST",
        headers: workerAuthHeaders(),
      });
      if (res.ok) {
        accepted++;
      } else if (res.status === 409) {
        // The clinic accepted, or a cancel won the race, between our read and this call.
        // Not a failure: the booking is simply no longer ours to act on.
        continue;
      } else {
        failed++;
        console.error(`[auto-accept] ${booking.id} -> HTTP ${res.status}`);
      }
    } catch (e) {
      failed++;
      console.error(`[auto-accept] ${booking.id} failed: ${(e as Error).message}`);
    }
  }
  if (due.length === BATCH) {
    // Say so rather than letting a truncated pass read as "that was all of them".
    console.log(`[auto-accept] batch full (${BATCH}); more due bookings remain for the next pass`);
  }
  return { due: due.length, accepted, failed };
}

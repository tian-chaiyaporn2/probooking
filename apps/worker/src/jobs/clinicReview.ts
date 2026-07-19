import { prisma } from "@probook/db";
import { CLINIC_COMPLETION_REVIEW_AFTER } from "@probook/domain";
import { workerAuthHeaders } from "../auth.js";
import { workerConfig } from "../config.js";

const REVIEW_KIND = "completion_review";
const BATCH = 500;

export interface ReviewSweepResult {
  due: number;
  flagged: number;
  failed: number;
}

/**
 * CMP-04 sweep. When the professional never submits completion, a booking sits in
 * Confirmed/InProgress. 48h after the scheduled shift end, Operations must review it.
 * This finds those bookings (whose shift ended > 48h ago) that don't already have a
 * review case, and triggers the API's controlled flag-inactive action to open one.
 * Idempotent: bookings already cased are excluded in SQL, and flag-inactive itself dedupes.
 *
 * Anti-join in SQL (not take-then-filter): cased bookings used to fill a `take: 500`
 * candidate set forever, starving newer due rows once history exceeded the batch size.
 */
export async function clinicCompletionReviewSweep(now: number): Promise<ReviewSweepResult> {
  const cutoff = new Date(now - CLINIC_COMPLETION_REVIEW_AFTER);
  const due = await prisma.$queryRaw<{ id: string }[]>`
    SELECT b.id
    FROM "Booking" b
    INNER JOIN "Shift" s ON s.id = b."shiftId"
    WHERE b.state IN ('Confirmed', 'InProgress')
      AND s."endsAt" <= ${cutoff}
      AND NOT EXISTS (
        SELECT 1 FROM "SupportCase" sc
        WHERE sc."refType" = 'Booking'
          AND sc.kind = ${REVIEW_KIND}
          AND sc."refId" = b.id
      )
    ORDER BY s."endsAt" ASC
    LIMIT ${BATCH}
  `;
  if (due.length === 0) return { due: 0, flagged: 0, failed: 0 };

  let flagged = 0;
  let failed = 0;
  for (const booking of due) {
    try {
      const res = await fetch(`${workerConfig.apiBaseUrl}/bookings/${booking.id}/flag-inactive`, {
        method: "POST",
        headers: workerAuthHeaders(),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        flagged++;
      } else if (res.status === 409) {
        continue; // a case already exists for this booking — the dedupe worked
      } else {
        failed++;
        console.error(`[clinic-review] ${booking.id} -> HTTP ${res.status}`);
      }
    } catch (e) {
      failed++;
      console.error(`[clinic-review] ${booking.id} failed: ${(e as Error).message}`);
    }
  }
  if (due.length === BATCH) {
    console.log(`[clinic-review] batch full (${BATCH}); more due bookings remain for the next pass`);
  }
  return { due: due.length, flagged, failed };
}

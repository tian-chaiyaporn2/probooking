import { prisma } from "@probook/db";
import { CLINIC_COMPLETION_REVIEW_AFTER } from "@probook/domain";
import { workerAuthHeaders } from "../auth.js";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
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
 * Already-cased bookings are excluded in SQL (NOT EXISTS) so a backlog of stuck
 * Confirmed rows cannot fill the batch and starve new due bookings forever.
 */
export async function clinicCompletionReviewSweep(now: number): Promise<ReviewSweepResult> {
  const cutoff = new Date(now - CLINIC_COMPLETION_REVIEW_AFTER);
  // SupportCase uses polymorphic refType/refId (no Booking relation), so NOT EXISTS.
  const candidates = await prisma.$queryRaw<{ id: string }[]>`
    SELECT b.id
    FROM "Booking" b
    INNER JOIN "Shift" s ON s.id = b."shiftId"
    WHERE b.state IN ('Confirmed', 'InProgress')
      AND s."endsAt" <= ${cutoff}
      AND NOT EXISTS (
        SELECT 1 FROM "SupportCase" sc
        WHERE sc."refType" = 'Booking'
          AND sc."refId" = b.id
          AND sc.kind = ${REVIEW_KIND}
      )
    ORDER BY s."endsAt" ASC
    LIMIT ${BATCH}
  `;
  if (candidates.length === 0) return { due: 0, flagged: 0, failed: 0 };

  let flagged = 0;
  let failed = 0;
  for (const booking of candidates) {
    try {
      const res = await fetch(`${API_BASE}/bookings/${booking.id}/flag-inactive`, {
        method: "POST",
        headers: workerAuthHeaders(),
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
  return { due: candidates.length, flagged, failed };
}

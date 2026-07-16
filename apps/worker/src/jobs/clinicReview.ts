import { prisma } from "@probook/db";
import { CLINIC_COMPLETION_REVIEW_AFTER } from "@probook/domain";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const REVIEW_KIND = "completion_review";

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
 * Idempotent: bookings already cased are excluded, and flag-inactive itself dedupes.
 */
export async function clinicCompletionReviewSweep(now: number): Promise<ReviewSweepResult> {
  const cutoff = new Date(now - CLINIC_COMPLETION_REVIEW_AFTER);
  const candidates = await prisma.booking.findMany({
    where: {
      state: { in: ["Confirmed", "InProgress"] },
      shift: { endsAt: { lte: cutoff } },
    },
    select: { id: true },
  });
  if (candidates.length === 0) return { due: 0, flagged: 0, failed: 0 };

  // Exclude bookings that already have a completion-review case.
  const cased = await prisma.supportCase.findMany({
    where: { refType: "Booking", kind: REVIEW_KIND },
    select: { refId: true },
  });
  const casedIds = new Set(cased.map((c) => c.refId));
  const due = candidates.filter((c) => !casedIds.has(c.id));

  let flagged = 0;
  let failed = 0;
  for (const booking of due) {
    try {
      const res = await fetch(`${API_BASE}/bookings/${booking.id}/flag-inactive`, {
        method: "POST",
      });
      if (res.ok) {
        flagged++;
      } else {
        failed++;
        console.error(`[clinic-review] ${booking.id} -> HTTP ${res.status}`);
      }
    } catch (e) {
      failed++;
      console.error(`[clinic-review] ${booking.id} failed: ${(e as Error).message}`);
    }
  }
  return { due: due.length, flagged, failed };
}

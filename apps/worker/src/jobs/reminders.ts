import { prisma } from "@probook/db";
import { REMINDER_24H_BEFORE, REMINDER_3H_BEFORE } from "@probook/domain";

export interface ReminderSweepResult {
  sent: number;
  skipped: number; // lead time passed while we were down and the shift has now started
  failed: number;
}

/**
 * NOT-01 booking reminders, at 24h and 3h before the shift.
 *
 * Dueness is a durable fact ("has `startsAt - lead` passed?"), not a moving window around
 * `now`. The previous form selected `startsAt ∈ (now+from, now+to]`, so a booking whose
 * window opened AND closed while the worker was down fell out of every window and was
 * never reminded — silently, with no error and no counter. A 3h outage was enough to drop
 * the 3h reminder entirely; that is the failure this shape removes. A late worker now
 * sends late rather than not at all, and only gives up once the shift has actually started
 * (where a reminder has no purpose) — and says so via `skipped` rather than staying quiet.
 *
 * Once-only is the database's job: the partial unique index `Notification_reminder_once`
 * on (event, refId) makes a duplicate impossible even with several workers sweeping at
 * once. The SQL anti-join below keeps already-sent rows out of the batch so they cannot
 * starve unsent reminders once history exceeds BATCH.
 */
const WINDOWS = [
  { event: "reminder_24h", lead: REMINDER_24H_BEFORE },
  { event: "reminder_3h", lead: REMINDER_3H_BEFORE },
];

/** Bound each pass so a backlog can't pull unbounded rows into memory. */
const BATCH = 500;

export async function reminderSweep(now: number): Promise<ReminderSweepResult> {
  let sent = 0;
  let failed = 0;

  for (const w of WINDOWS) {
    const windowEnd = new Date(now + w.lead);
    const nowDate = new Date(now);
    const due = await prisma.$queryRaw<{ id: string; professionalId: string }[]>`
      SELECT b.id, b."professionalId"
      FROM "Booking" b
      INNER JOIN "Shift" s ON s.id = b."shiftId"
      WHERE b.state = 'Confirmed'
        AND s."startsAt" > ${nowDate}
        AND s."startsAt" <= ${windowEnd}
        AND NOT EXISTS (
          SELECT 1 FROM "Notification" n
          WHERE n.event = ${w.event}
            AND n."refType" = 'Booking'
            AND n."refId" = b.id
        )
      ORDER BY s."startsAt" ASC
      LIMIT ${BATCH}
    `;
    if (due.length === 0) continue;

    for (const b of due) {
      // Per-booking isolation: one bad row must not abort the rest of the batch, nor the
      // next window. Previously a single failure threw out of the whole sweep, so every
      // later booking was skipped that pass and the 3h window never ran at all.
      try {
        await prisma.notification.create({
          data: {
            channel: "sms",
            to: b.professionalId,
            event: w.event,
            refType: "Booking",
            refId: b.id,
          },
        });
        sent++;
      } catch (e) {
        // P2002: another worker won the race for this reminder. That is success, not failure.
        if ((e as { code?: string }).code === "P2002") continue;
        failed++;
        console.error(`[reminders] ${w.event} failed for booking ${b.id}:`, (e as Error).message);
      }
    }
    if (due.length === BATCH) {
      console.log(`[reminders] ${w.event} batch full (${BATCH}); more remain for the next pass`);
    }
  }

  return { sent, skipped: await countMissed(now), failed };
}

/**
 * Reminders we can no longer usefully send: the shift has started and no 3h reminder went
 * out. Counted so a drop is observable — a silent miss reads as "nothing was due".
 */
async function countMissed(now: number): Promise<number> {
  const windowStart = new Date(now - REMINDER_3H_BEFORE);
  const nowDate = new Date(now);
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n
    FROM "Booking" b
    INNER JOIN "Shift" s ON s.id = b."shiftId"
    WHERE b.state IN ('Confirmed', 'InProgress')
      AND s."startsAt" <= ${nowDate}
      AND s."startsAt" > ${windowStart}
      AND NOT EXISTS (
        SELECT 1 FROM "Notification" n
        WHERE n.event = 'reminder_3h'
          AND n."refType" = 'Booking'
          AND n."refId" = b.id
      )
  `;
  return Number(rows[0]?.n ?? 0n);
}

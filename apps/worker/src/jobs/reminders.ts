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
 * once. A findFirst/create pair cannot do that — both instances read "none" before either
 * writes. The pre-filter below is only an optimisation; the index is the guarantee.
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
    const due = await prisma.booking.findMany({
      where: {
        state: "Confirmed",
        // Due once the lead time has passed; still worth sending while the shift is ahead.
        shift: { startsAt: { gt: new Date(now), lte: new Date(now + w.lead) } },
      },
      select: { id: true, professionalId: true },
      take: BATCH,
    });
    if (due.length === 0) continue;

    const alreadySent = await sentFor(w.event, due.map((b) => b.id));

    for (const b of due) {
      if (alreadySent.has(b.id)) continue;
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
  }

  return { sent, skipped: await countMissed(now), failed };
}

/** Which of these bookings already have this reminder? One query, not one per booking. */
async function sentFor(event: string, bookingIds: string[]): Promise<Set<string>> {
  const rows = await prisma.notification.findMany({
    where: { event, refType: "Booking", refId: { in: bookingIds } },
    select: { refId: true },
  });
  return new Set(rows.map((r) => r.refId).filter((id): id is string => id !== null));
}

/**
 * Reminders we can no longer usefully send: the shift has started and no 3h reminder went
 * out. Counted so a drop is observable — a silent miss reads as "nothing was due".
 */
async function countMissed(now: number): Promise<number> {
  const started = await prisma.booking.findMany({
    where: {
      state: { in: ["Confirmed", "InProgress"] },
      shift: { startsAt: { lte: new Date(now), gt: new Date(now - REMINDER_3H_BEFORE) } },
    },
    select: { id: true },
    take: BATCH,
  });
  if (started.length === 0) return 0;
  const sent = await sentFor("reminder_3h", started.map((b) => b.id));
  return started.filter((b) => !sent.has(b.id)).length;
}

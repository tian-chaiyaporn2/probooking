import { prisma } from "@probook/db";
import { REMINDER_24H_BEFORE, REMINDER_3H_BEFORE } from "@probook/domain";

export interface ReminderSweepResult {
  sent: number;
}

// Bounded windows so the two reminders are mutually exclusive by timing: the 24h
// reminder fires between 3h and 24h before start; the 3h reminder within 3h.
const WINDOWS = [
  { event: "reminder_24h", from: REMINDER_3H_BEFORE, to: REMINDER_24H_BEFORE },
  { event: "reminder_3h", from: 0, to: REMINDER_3H_BEFORE },
];

/**
 * NOT-01 booking reminders. For Confirmed bookings whose shift starts within a
 * reminder window, send the reminder once (dedup via the Notification table on
 * event+refId). Runs continuously; a booking sitting in the 24h window across many
 * sweeps is reminded only once.
 */
export async function reminderSweep(now: number): Promise<ReminderSweepResult> {
  let sent = 0;
  for (const w of WINDOWS) {
    const due = await prisma.booking.findMany({
      where: {
        state: "Confirmed",
        shift: { startsAt: { gt: new Date(now + w.from), lte: new Date(now + w.to) } },
      },
      select: { id: true, professionalId: true },
    });
    for (const b of due) {
      const already = await prisma.notification.findFirst({
        where: { event: w.event, refId: b.id },
      });
      if (already) continue;
      await prisma.notification.create({
        data: { channel: "sms", to: b.professionalId, event: w.event, refType: "Booking", refId: b.id },
      });
      sent++;
    }
  }
  return { sent };
}

import "./env.js"; // MUST be first: loads DATABASE_URL before @probook/db is imported
import { prisma } from "@probook/db";
import { autoAcceptSweep } from "./jobs/autoAccept.js";
import { clinicCompletionReviewSweep } from "./jobs/clinicReview.js";
import { reviewPublishSweep } from "./jobs/reviewPublish.js";
import { reminderSweep } from "./jobs/reminders.js";

/**
 * ProBooking worker. Runs time-driven jobs (§7.2): the CMP-03 auto-accept sweep and
 * the CMP-04 clinic-inactivity review sweep. A polling loop keeps the worker runnable
 * without Redis; for scale these would become durable repeatable jobs (e.g. BullMQ)
 * without changing the job logic.
 *
 * Flags: `--once` runs a single pass and exits (used by tests / cron-style triggers).
 */
const SWEEP_MS = Number(process.env.AUTO_ACCEPT_SWEEP_MS ?? 60_000);
const runOnce = process.argv.includes("--once");

/** Run one sweep in isolation — a failure here must not starve the other sweeps. */
async function runSweep(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[worker] ${name} failed this pass:`, (e as Error).message);
  }
}

async function tick(): Promise<void> {
  const now = Date.now();
  // Each sweep is isolated so a DB error in one (e.g. review-publish) can't skip the
  // rest of the pass (e.g. reminders / auto-accept).
  await runSweep("auto-accept", async () => {
    const aa = await autoAcceptSweep(now);
    if (aa.due > 0 || aa.failed > 0) {
      console.log(`[auto-accept] due=${aa.due} accepted=${aa.accepted} failed=${aa.failed}`);
    }
  });
  await runSweep("clinic-review", async () => {
    const cr = await clinicCompletionReviewSweep(now);
    if (cr.due > 0 || cr.failed > 0) {
      console.log(`[clinic-review] due=${cr.due} flagged=${cr.flagged} failed=${cr.failed}`);
    }
  });
  await runSweep("review-publish", async () => {
    const rp = await reviewPublishSweep(now);
    if (rp.published > 0) console.log(`[review-publish] published=${rp.published}`);
  });
  await runSweep("reminders", async () => {
    const rm = await reminderSweep(now);
    if (rm.sent > 0) console.log(`[reminders] sent=${rm.sent}`);
  });
}

async function main(): Promise<void> {
  console.log(
    `ProBooking worker starting — auto-accept sweep${runOnce ? " (--once)" : ` every ${SWEEP_MS}ms`}`,
  );
  await tick();
  if (runOnce) {
    await prisma.$disconnect();
    process.exit(0);
  }
  // Self-scheduling loop: wait for each pass to finish before arming the next, so a
  // slow pass can't overlap with the following one and double-act on the same rows.
  const loop = () => setTimeout(() => void tick().finally(loop), SWEEP_MS);
  loop();
}

void main();

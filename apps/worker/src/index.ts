import "./env.js"; // MUST be first: loads DATABASE_URL before @probook/db is imported
import { prisma } from "@probook/db";
import { autoAcceptSweep } from "./jobs/autoAccept.js";
import { clinicCompletionReviewSweep } from "./jobs/clinicReview.js";
import { reviewPublishSweep } from "./jobs/reviewPublish.js";
import { reminderSweep } from "./jobs/reminders.js";

/**
 * ProBooking worker. Runs time-driven jobs (§7.2): the CMP-03 auto-accept sweep and
 * the CMP-04 clinic-inactivity review sweep. A polling loop keeps the worker runnable
 * without Redis; for scale these become BullMQ repeatable jobs (see queues.ts) without
 * changing the job logic.
 *
 * Flags: `--once` runs a single pass and exits (used by tests / cron-style triggers).
 */
const SWEEP_MS = Number(process.env.AUTO_ACCEPT_SWEEP_MS ?? 60_000);
const runOnce = process.argv.includes("--once");

async function tick(): Promise<void> {
  try {
    await runSweeps();
  } catch (e) {
    // A transient DB/API error must not kill the loop — log and skip this pass.
    console.error("[worker] sweep pass failed, skipping:", (e as Error).message);
  }
}

async function runSweeps(): Promise<void> {
  const now = Date.now();
  const aa = await autoAcceptSweep(now);
  if (aa.due > 0 || aa.failed > 0) {
    console.log(`[auto-accept] due=${aa.due} accepted=${aa.accepted} failed=${aa.failed}`);
  }
  const cr = await clinicCompletionReviewSweep(now);
  if (cr.due > 0 || cr.failed > 0) {
    console.log(`[clinic-review] due=${cr.due} flagged=${cr.flagged} failed=${cr.failed}`);
  }
  const rp = await reviewPublishSweep(now);
  if (rp.published > 0) {
    console.log(`[review-publish] published=${rp.published}`);
  }
  const rm = await reminderSweep(now);
  if (rm.sent > 0) {
    console.log(`[reminders] sent=${rm.sent}`);
  }
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

import "./env.js"; // MUST be first: loads DATABASE_URL before @probook/db is imported
import { prisma } from "@probook/db";
import { autoAcceptSweep } from "./jobs/autoAccept.js";
import { clinicCompletionReviewSweep } from "./jobs/clinicReview.js";
import { reviewPublishSweep } from "./jobs/reviewPublish.js";
import { reminderSweep } from "./jobs/reminders.js";
import { expireOffersSweep } from "./jobs/expireOffers.js";

/**
 * ProBooking worker. Runs time-driven jobs (§7.2): offer expiry (OFF-03), auto-accept
 * (CMP-03), clinic completion review (CMP-04), review publish (REV-03), and shift
 * reminders (NOT-01).
 * A polling loop keeps the worker runnable without Redis; for scale these would become
 * durable repeatable jobs (e.g. BullMQ) without changing the job logic.
 *
 * Flags: `--once` runs a single pass and exits (used by tests / cron-style triggers).
 */
const rawSweep = Number(process.env.AUTO_ACCEPT_SWEEP_MS ?? 60_000);
const SWEEP_MS = Number.isFinite(rawSweep) && rawSweep > 0 ? rawSweep : 60_000;
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
  await runSweep("offer-expiry", async () => {
    const ex = await expireOffersSweep(now);
    if (ex.due > 0 || ex.failed > 0) {
      console.log(`[offer-expiry] due=${ex.due} expired=${ex.expired} failed=${ex.failed}`);
    }
  });
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
    if (rm.sent > 0 || rm.failed > 0) console.log(`[reminders] sent=${rm.sent} failed=${rm.failed}`);
    // A reminder we can no longer send is a real miss (worker downtime across the window).
    // Log it: the whole point of the durable-dueness rewrite is that misses stop being silent.
    if (rm.skipped > 0) {
      console.warn(`[reminders] ${rm.skipped} booking(s) started without a 3h reminder`);
    }
  });
}

/** Set once a shutdown signal arrives; the loop drains rather than dying mid-pass. */
let stopping = false;
/** In-flight tick promise so SIGTERM can wait for the current pass to finish. */
let tickInFlight: Promise<void> | null = null;

async function main(): Promise<void> {
  console.log(
    `ProBooking worker starting — sweeps${runOnce ? " (--once)" : ` every ${SWEEP_MS}ms`}`,
  );
  tickInFlight = tick();
  await tickInFlight;
  tickInFlight = null;
  if (runOnce) {
    await prisma.$disconnect();
    process.exit(0);
  }
  // Self-scheduling loop: wait for each pass to finish before arming the next, so a
  // slow pass can't overlap with the following one and double-act on the same rows.
  const loop = () => {
    if (stopping) return;
    setTimeout(() => {
      if (stopping) return;
      // `.catch` before `.finally`: an unhandled rejection here would terminate the process
      // and the loop would never re-arm — auto-accept (i.e. payouts) would stop silently.
      // runSweep already absorbs per-sweep errors; this covers anything thrown outside them.
      tickInFlight = tick()
        .catch((e) => console.error("[worker] tick failed:", (e as Error)?.message ?? e))
        .finally(() => {
          tickInFlight = null;
          loop();
        });
    }, SWEEP_MS);
  };
  loop();
}

/**
 * Drain on shutdown: an orchestrator sends SIGTERM on every redeploy. Wait for the
 * in-flight pass (every action is idempotent) before disconnecting — exiting mid-pass
 * used to truncate at an arbitrary booking despite the "finishing current pass" log line.
 */
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal} received — finishing current pass, then exiting`);
  const done = tickInFlight ?? Promise.resolve();
  void done
    .catch(() => undefined)
    .finally(() => prisma.$disconnect().finally(() => process.exit(0)));
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => shutdown(signal));
}

// A rejection that escapes every catch above must be loud, not a silent process death.
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandled rejection:", reason);
});

void main();

import "./env.js"; // MUST be first: loads DATABASE_URL before @probook/db is imported
import { prisma } from "@probook/db";
import { autoAcceptSweep } from "./jobs/autoAccept.js";

/**
 * ProBooking worker. Runs time-driven jobs (§7.2). Currently: the CMP-03 auto-accept
 * sweep. A polling sweep keeps the worker runnable without Redis; for scale this
 * becomes a BullMQ repeatable job (see queues.ts) without changing the job logic.
 *
 * Flags: `--once` runs a single sweep and exits (used by tests / cron-style triggers).
 */
const SWEEP_MS = Number(process.env.AUTO_ACCEPT_SWEEP_MS ?? 60_000);
const runOnce = process.argv.includes("--once");

async function tick(): Promise<void> {
  const r = await autoAcceptSweep(Date.now());
  if (r.due > 0 || r.failed > 0) {
    console.log(`[auto-accept] due=${r.due} accepted=${r.accepted} failed=${r.failed}`);
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
  setInterval(() => {
    void tick();
  }, SWEEP_MS);
}

void main();

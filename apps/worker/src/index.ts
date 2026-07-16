import "reflect-metadata";
import { QUEUES } from "./queues.js";

/**
 * Worker entrypoint. Wires BullMQ Workers to each queue. Kept as an explicit,
 * readable registry so it is obvious which requirement each job serves.
 *
 * To activate: add `bullmq` Workers here reading REDIS_URL and dispatch to the
 * job processors in ./jobs. Left inert until Redis is configured so the scaffold
 * boots without external services.
 */
function main() {
  const queues = Object.values(QUEUES);
  // eslint-disable-next-line no-console
  console.log(`ProBooking worker ready. Queues: ${queues.join(", ")}`);
  // Example (uncomment once REDIS_URL is set):
  //
  // import { Worker } from "bullmq";
  // import IORedis from "ioredis";
  // const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  // new Worker(QUEUES.autoAccept, async (job) => processAutoAccept(job.data), { connection });
  // new Worker(QUEUES.reconciliation, async () => processReconciliation(), { connection });
}

main();

/**
 * Queue definitions for ProBooking background work (§7.2). Each queue maps to a
 * time-driven requirement. Jobs must be idempotent — reminders and money-adjacent
 * jobs may be retried (PAY-04).
 */
export const QUEUES = {
  offerExpiry: "offer-expiry", // OFF-03: expire offers at effective expiry
  fundingWindow: "funding-window", // OFF-03: 30-min funding window lapse
  reminders: "reminders", // NOT-01: 24h & 3h reminders, same-day escalation
  autoAccept: "auto-accept", // CMP-03: auto-accept completion after 24h
  clinicCompletionReview: "clinic-completion-review", // CMP-04: 48h -> Operations
  reconciliation: "reconciliation", // PAY-11: daily Finance reconciliation
  credentialExpiry: "credential-expiry", // VER-04/05: credential/insurance validity sweeps
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

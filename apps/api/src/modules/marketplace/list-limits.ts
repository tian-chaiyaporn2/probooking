/**
 * Defensive caps on unbounded list reads (M6). A single request must not be able to run an
 * unbounded query (a booking thread with thousands of messages, a party's whole history).
 * These are set FAR above realistic Phase 0 volume — they are a runaway backstop, not a
 * product page size. Shared by both stores so the memory/Prisma implementations can't drift.
 *
 * `financeExport` is deliberately very high: silently truncating a financial export would
 * drop reconciliation records, so this only guards against a pathological row count. A real
 * production export needs streaming/pagination, tracked as a Phase 1 item.
 */
export const LIST_LIMITS = {
  messages: 500,
  availability: 200,
  financeExport: 10_000,
  partyBookings: 200,
} as const;

import { ConflictError } from "./errors.util.js";

/** Minimal event shape for ledger headroom math (Prisma rows or in-memory events). */
export type LedgerEvent = { type: string; amount: number };

export function sumLedgerEvents(events: LedgerEvent[], type: string): number {
  return events.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0);
}

/**
 * PAY-08 remaining headroom on a payment order: captured minus executed payouts and
 * refunds minus Pending dual-control refund proposals. Shared by refund, payout, and
 * cancel paths so no caller can forget prior payouts.
 */
export function remainingLedgerFunds(input: {
  captured: number;
  events: LedgerEvent[];
  pendingRefundApprovals?: number;
}): number {
  const paidOut = sumLedgerEvents(input.events, "Payout");
  const refunded = sumLedgerEvents(input.events, "Refund");
  const pending = input.pendingRefundApprovals ?? 0;
  return Math.max(0, input.captured - paidOut - refunded - pending);
}

/** Throws ConflictError when `amount` would exceed remaining headroom. */
export function assertLedgerHeadroom(
  amount: number,
  input: Parameters<typeof remainingLedgerFunds>[0],
  label: string,
): void {
  const remaining = remainingLedgerFunds(input);
  if (amount > remaining) {
    throw new ConflictError(
      `ALLOCATION_EXCEEDED: ${label} of ${amount} exceeds remaining ${remaining}`,
    );
  }
}

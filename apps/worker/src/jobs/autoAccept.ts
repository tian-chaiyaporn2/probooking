import { AUTO_ACCEPT_AFTER } from "@probook/domain";

/**
 * CMP-03: if the professional submits completion, auto-accept occurs once after
 * 24 hours, measured from the later of scheduled end and submission, unless held
 * or disputed. This job is scheduled at submission time with that delay.
 */
export interface AutoAcceptPayload {
  bookingId: string;
  scheduledEnd: number; // epoch ms UTC
  submittedAt: number; // epoch ms UTC
}

export function autoAcceptRunAt(payload: AutoAcceptPayload): number {
  const base = Math.max(payload.scheduledEnd, payload.submittedAt);
  return base + AUTO_ACCEPT_AFTER;
}

export async function processAutoAccept(_payload: AutoAcceptPayload): Promise<void> {
  // TODO: load booking; if not Held/Disputed, advance completion + mark payout eligible.
  // Must be idempotent: re-running after success is a no-op (CMP-03 "once").
}

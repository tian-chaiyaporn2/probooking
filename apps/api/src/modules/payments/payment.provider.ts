import { Injectable } from "@nestjs/common";
import type { Satang } from "@probook/domain";

/** Nest DI token for the payment partner port (mock in Phase 0, real provider in prod). */
export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

/**
 * Payment partner port (§7.2 "integrations are ports"). "Payment Protected" (PAY-01) is a
 * mock here and a regulated partner in production; nothing above this line changes.
 *
 * `capture` is the durable prefunding step BKG-01 gates confirmation on. It is the API's
 * job to establish whether funds were actually collected — that fact must never be an
 * input supplied by the caller who benefits from the answer being "yes".
 */
interface CaptureRequest {
  /** Stable reference for the money being collected; doubles as the provider idempotency key. */
  orderRef: string;
  amount: Satang;
}

type CaptureResult =
  | { succeeded: true; providerRef: string }
  | { succeeded: false; reason: string };

export interface RefundRequest {
  orderRef: string;
  amount: Satang;
}

type RefundResult =
  | { succeeded: true; providerRef: string }
  | { succeeded: false; reason: string };

export interface PaymentProvider {
  capture(req: CaptureRequest): Promise<CaptureResult>;
  /** Unwind a capture. May fail — callers must check `succeeded` before assuming funds are free. */
  refund(req: RefundRequest): Promise<RefundResult>;
}

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  /**
   * Dev/e2e stand-in for the partner's capture call. Deterministic and always successful:
   * failure paths are exercised through the domain's eligibility rules, not by asking the
   * mock to misbehave. A real provider replaces this class without touching call sites.
   */
  async capture(req: CaptureRequest): Promise<CaptureResult> {
    if (req.amount <= 0) return { succeeded: false, reason: "non_positive_amount" };
    return { succeeded: true, providerRef: `mock_capture_${req.orderRef}` };
  }

  /**
   * Unwind a capture when confirm fails after funds were collected (no booking created).
   * Mock is always successful; a real provider would reverse the partner transaction.
   */
  async refund(req: RefundRequest): Promise<RefundResult> {
    return { succeeded: true, providerRef: `mock_refund_${req.orderRef}` };
  }
}

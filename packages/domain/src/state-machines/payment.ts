/**
 * Payment Order, Payout, and Refund lifecycles (§6.2).
 *
 * Money commands are idempotent and amount-limited (§6.4, PAY-04/06/08). Staff
 * cannot directly edit financial truth or terminal provider states (PAY-06) — these
 * transitions are only ever driven by authenticated, idempotent provider callbacks
 * or controlled Finance actions.
 */
import type { PaymentOrderState, PayoutState, RefundState } from "../states.js";
import { assertTransition, type TransitionMap } from "./transition.js";

export const PAYMENT_ORDER_TRANSITIONS: TransitionMap<PaymentOrderState> = {
  Created: ["Pending", "Expired", "Exception"],
  Pending: ["PaymentProtected", "Failed", "Expired", "Exception"],
  PaymentProtected: ["Refunding", "Exception"], // funds captured/guaranteed (BKG-01)
  Refunding: ["Refunded", "Exception"],
  Failed: ["Exception"],
  Expired: ["Exception"],
  Refunded: [],
  Exception: [],
};

export const PAYOUT_TRANSITIONS: TransitionMap<PayoutState> = {
  NotEligible: ["Processing", "Held"],
  Processing: ["Paid", "Failed", "Held"],
  Held: ["Processing", "Failed"],
  Failed: ["Processing"],
  Paid: ["Reversed"], // only where lawful (§6.2)
  Reversed: [],
};

export const REFUND_TRANSITIONS: TransitionMap<RefundState> = {
  None: ["Pending"],
  Pending: ["PartiallyRefunded", "Refunded", "Failed", "Exception"],
  PartiallyRefunded: ["Refunded", "Failed", "Exception"],
  Failed: ["Pending", "Exception"],
  Refunded: [],
  Exception: [],
};

export const advancePaymentOrder = (
  from: PaymentOrderState,
  to: PaymentOrderState,
): PaymentOrderState => assertTransition("paymentOrder", PAYMENT_ORDER_TRANSITIONS, from, to);

export const advancePayout = (from: PayoutState, to: PayoutState): PayoutState =>
  assertTransition("payout", PAYOUT_TRANSITIONS, from, to);

export const advanceRefund = (from: RefundState, to: RefundState): RefundState =>
  assertTransition("refund", REFUND_TRANSITIONS, from, to);

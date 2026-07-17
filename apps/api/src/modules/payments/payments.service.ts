import { Injectable } from "@nestjs/common";
import { buildCheckout, conserves, satang, withinAllocation, type Satang } from "@probook/domain";

/**
 * Payment orchestration (PAY-01..11). The provider is abstracted behind a port so
 * "Payment Protected" (PAY-01) can be a mock in dev and a regulated partner in prod.
 *
 * Invariants enforced here / at the DB layer:
 *  - PAY-04 provider callbacks & money commands are authenticated + idempotent.
 *  - PAY-05 every collection/refund/payout/reversal/adjustment is an immutable event.
 *  - PAY-07 captured == protected + payout + fee + tax + refunds + costs + adjustments.
 *  - PAY-08 no payout/refund exceeds captured/remaining allocated funds.
 */
@Injectable()
export class PaymentsService {
  /** PAY-02: build the checkout breakdown the customer sees before paying. */
  checkout(compensation: Satang, tax: Satang = satang(0)) {
    return buildCheckout(compensation, { tax });
  }

  /** PAY-07: reconciliation guard used by Finance's daily reconcile (PAY-11). */
  assertConserved(input: Parameters<typeof conserves>[0]): void {
    if (!conserves(input)) {
      throw new Error("CONSERVATION_VIOLATION: captured funds do not equal allocations (PAY-07)");
    }
  }

  /**
   * PAY-08: no payout or refund may exceed the funds available for it. This wraps the
   * domain predicate so every money command shares one definition of the cap — the rule
   * is only worth having if the code that moves money actually calls it.
   */
  assertWithinAllocation(amount: Satang, available: Satang, what: string): void {
    if (!withinAllocation(amount, available)) {
      throw new Error(
        `ALLOCATION_EXCEEDED: ${what} of ${amount} exceeds available ${available} (PAY-08)`,
      );
    }
  }
}

/**
 * PAY-11: Finance reconciles provider and platform records each business day.
 * Flags any payment order whose captured funds do not conserve (PAY-07) or whose
 * provider reference is missing/mismatched. Produces exceptions for Finance, never
 * mutates financial truth directly (PAY-06).
 */
export interface ReconciliationResult {
  checked: number;
  exceptions: string[]; // paymentOrderIds that failed conservation or matching
}

export async function processReconciliation(): Promise<ReconciliationResult> {
  // TODO: stream PaymentOrders for the business day; for each, assert conservation
  // via @probook/domain `conserves(...)` and compare provider refs. Emit exceptions.
  return { checked: 0, exceptions: [] };
}

import { buildCheckout, satang } from "@probook/domain";
import type { Checkout } from "./api";

/** PAY-02 checkout from compensation satang — shared by clinic/pro commitment moments. */
export function checkoutFromCompensation(compensation: number): Checkout {
  const c = buildCheckout(satang(compensation));
  return {
    compensation: c.compensation,
    serviceFee: c.serviceFee,
    tax: c.tax,
    total: c.total,
  };
}

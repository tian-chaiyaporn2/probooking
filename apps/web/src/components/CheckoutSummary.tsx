import { KeyValueTable } from "./KeyValueTable";
import { formatThb, type Checkout } from "../lib/api";
import { th } from "../lib/strings";

/** Canonical checkout fee breakdown (PAY-02 / UX F3) — compensation, 12% fee, tax, total. */
export function CheckoutSummary({
  checkout,
  caption,
  totalTestId,
  protectedStamp = true,
}: {
  checkout: Checkout;
  caption?: string;
  totalTestId?: string;
  protectedStamp?: boolean;
}) {
  return (
    <div className="checkout-summary">
      <KeyValueTable
        caption={caption ?? th.checkout.caption}
        rows={[
          { label: th.checkout.compensation, value: formatThb(checkout.compensation) },
          { label: th.checkout.serviceFee, value: formatThb(checkout.serviceFee) },
          { label: th.checkout.tax, value: formatThb(checkout.tax) },
          {
            label: th.checkout.total,
            value: formatThb(checkout.total),
            total: true,
            ...(totalTestId ? { valueTestId: totalTestId } : {}),
          },
        ]}
      />
      {protectedStamp ? (
        <p className="checkout-summary__stamp">{th.checkout.paymentProtected}</p>
      ) : null}
    </div>
  );
}

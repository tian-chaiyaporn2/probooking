/**
 * Money — THB in integer satang (LOC-02: "THB uses integer satang").
 *
 * All money in ProBooking is an integer number of satang (1 THB = 100 satang).
 * Never use floats for money. A `Satang` is a branded integer to prevent mixing
 * raw numbers with money amounts by accident.
 *
 * Requirement anchors:
 *  - LOC-02  integer satang
 *  - PAY-02  checkout separates compensation, 12% service fee, tax/withholding, total
 *  - PAY-07  captured funds == protected remainder + payout + fee + tax + refunds + costs + adjustments
 *  - PAY-08  no payout/refund may exceed captured or remaining allocated funds
 *  - Decision #8 clinic pays default 12% service fee
 */

export type Satang = number & { readonly __brand: "Satang" };

export function satang(value: number): Satang {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Money must be integer satang, got ${value}`);
  }
  return value as Satang;
}

/** Convert whole/decimal THB to satang. `thb(1250.5)` -> 125050 satang. */
export function thb(amount: number): Satang {
  const s = Math.round(amount * 100);
  return satang(s);
}

export function addSatang(...values: Satang[]): Satang {
  return satang(values.reduce((sum, v) => sum + v, 0));
}

export function subSatang(a: Satang, b: Satang): Satang {
  return satang(a - b);
}

/** Default clinic-paid service fee: 12% of professional compensation (PAY-02, Decision #8). */
export const DEFAULT_SERVICE_FEE_BPS = 1200; // basis points (12.00%)

/**
 * Service fee, rounded to the nearest satang. Fee is charged on the professional's
 * scheduled compensation (the payable amount). Rounding rule is documented and
 * deterministic so reconciliation (PAY-11) is reproducible.
 */
export function serviceFee(compensation: Satang, bps: number = DEFAULT_SERVICE_FEE_BPS): Satang {
  return satang(Math.round((compensation * bps) / 10_000));
}

/** A checkout breakdown (PAY-02). `tax` is any applicable tax/withholding adjustment. */
export interface Checkout {
  readonly compensation: Satang;
  readonly serviceFee: Satang;
  readonly tax: Satang;
  readonly total: Satang;
}

export function buildCheckout(
  compensation: Satang,
  opts: { bps?: number; tax?: Satang } = {},
): Checkout {
  const fee = serviceFee(compensation, opts.bps ?? DEFAULT_SERVICE_FEE_BPS);
  const tax = opts.tax ?? satang(0);
  return {
    compensation,
    serviceFee: fee,
    tax,
    total: addSatang(compensation, fee, tax),
  };
}

/**
 * Financial conservation check (PAY-07). Captured funds must equal the sum of all
 * downstream allocations. Returns true only when the books balance exactly.
 */
export interface Conservation {
  readonly captured: Satang;
  readonly protectedRemainder: Satang;
  readonly payout: Satang;
  readonly fee: Satang;
  readonly tax: Satang;
  readonly refunds: Satang;
  readonly providerCosts: Satang;
  readonly adjustments: Satang;
}

export function conserves(c: Conservation): boolean {
  const outflow = addSatang(
    c.protectedRemainder,
    c.payout,
    c.fee,
    c.tax,
    c.refunds,
    c.providerCosts,
    c.adjustments,
  );
  return c.captured === outflow;
}

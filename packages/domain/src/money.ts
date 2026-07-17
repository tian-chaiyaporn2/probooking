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
  // isSafeInteger (not isInteger): beyond 2^53 integer arithmetic loses precision, so a
  // sum that overflows must throw rather than silently corrupt a balance (PAY-07).
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money must be a safe integer number of satang, got ${value}`);
  }
  return value as Satang;
}

/**
 * Guard for amounts that cannot meaningfully be negative (compensation, payouts, refunds).
 * `satang()` itself stays signed on purpose: reversals and adjustments need a direction.
 */
export function assertNonNegative(value: Satang, what: string): void {
  if (value < 0) throw new RangeError(`${what} must not be negative, got ${value}`);
}

/** Convert whole/decimal THB to satang. `thb(1250.5)` -> 125050 satang. */
export function thb(amount: number): Satang {
  const s = Math.round(amount * 100);
  return satang(s);
}

export function addSatang(...values: Satang[]): Satang {
  return satang(values.reduce((sum, v) => sum + v, 0));
}

/**
 * PAY-08: a payout/refund may not exceed the funds available for it (nor go negative).
 * Pure predicate so the API and the acceptance spec share one definition.
 */
export function withinAllocation(amount: Satang, available: Satang): boolean {
  // A negative `available` is corrupt state — never treat it as headroom for a payout/refund.
  return amount >= 0 && available >= 0 && amount <= available;
}

/** Default clinic-paid service fee: 12% of professional compensation (PAY-02, Decision #8). */
export const DEFAULT_SERVICE_FEE_BPS = 1200; // basis points (12.00%)

/**
 * Service fee, rounded to the nearest satang. Fee is charged on the professional's
 * scheduled compensation (the payable amount). Rounding rule is documented and
 * deterministic so reconciliation (PAY-11) is reproducible.
 */
export function serviceFee(compensation: Satang, bps: number = DEFAULT_SERVICE_FEE_BPS): Satang {
  // `satang()` deliberately permits negatives — reversals and adjustments are signed. But a
  // fee on a negative compensation is not a thing, and an out-of-range bps is always a
  // typo: `serviceFee(comp, 120_000)` (12% written as if it were percent×1000) silently
  // returned 12x the compensation with nothing to catch it.
  assertNonNegative(compensation, "compensation");
  if (!Number.isFinite(bps) || bps < 0 || bps > 10_000) {
    throw new RangeError(`Service fee bps must be between 0 and 10000 (100%), got ${bps}`);
  }
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
  // A checkout is money someone is about to be charged; a negative one is a bug upstream,
  // not a refund. `buildCheckout(satang(-100))` used to return a total of -112 quite happily.
  assertNonNegative(compensation, "compensation");
  const fee = serviceFee(compensation, opts.bps ?? DEFAULT_SERVICE_FEE_BPS);
  const tax = opts.tax ?? satang(0);
  assertNonNegative(tax, "tax");
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
  // Legs other than `adjustments` (signed by design) must be non-negative or a buggy
  // caller can "balance" while moving money the wrong way.
  if (
    c.protectedRemainder < 0 ||
    c.payout < 0 ||
    c.fee < 0 ||
    c.tax < 0 ||
    c.refunds < 0 ||
    c.providerCosts < 0
  ) {
    return false;
  }
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

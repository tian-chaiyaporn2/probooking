import { describe, it, expect } from "vitest";
import {
  thb,
  satang,
  serviceFee,
  buildCheckout,
  conserves,
  withinAllocation,
  formatThb,
} from "../src/money.js";

describe("money (integer satang, LOC-02)", () => {
  it("converts THB to satang", () => {
    expect(thb(1250.5)).toBe(125050);
  });

  it("rejects non-integer satang", () => {
    expect(() => satang(10.5)).toThrow();
  });

  it("computes the default 12% service fee (PAY-02, Decision #8)", () => {
    // 10,000 THB compensation -> 1,000,000 satang -> 12% = 120,000 satang
    expect(serviceFee(thb(10_000))).toBe(120_000);
  });

  it("rounds a fractional-satang fee half-up, deterministically (PAY-11)", () => {
    // 10,000 satang divides exactly, so it cannot detect a rounding-mode change. These
    // inputs do not: 125,055 * 0.12 = 15,006.6 -> 15,007 under round, 15,006 under floor.
    // Reconciliation is only reproducible if this direction is pinned.
    expect(serviceFee(satang(125_055))).toBe(15_007);
    // Exact .5 tie -> away from zero (half-up), not banker's rounding to even.
    expect(serviceFee(satang(125), 1200)).toBe(15); // 15.0 exactly
    expect(serviceFee(satang(375), 1200)).toBe(45); // 45.0 exactly
    expect(serviceFee(satang(21), 1200)).toBe(3); // 2.52 -> 3
    expect(serviceFee(satang(125_054))).toBe(15_006); // 15,006.48 -> 15,006
  });

  it("keeps the checkout total equal to its own parts under rounding (PAY-02/07)", () => {
    // The total must be the sum of the reported (rounded) parts, never a re-derivation —
    // otherwise the customer is charged a total that its own breakdown contradicts.
    const c = buildCheckout(satang(125_055), { tax: satang(7) });
    expect(c.total).toBe(c.compensation + c.serviceFee + c.tax);
    expect(
      conserves({
        captured: c.total,
        protectedRemainder: c.compensation,
        payout: satang(0),
        fee: c.serviceFee,
        tax: c.tax,
        refunds: satang(0),
        providerCosts: satang(0),
        adjustments: satang(0),
      }),
    ).toBe(true);
  });

  it("detects an imbalance (PAY-07 must not be vacuous)", () => {
    // The positive case alone would pass even if conserves() returned true unconditionally.
    expect(
      conserves({
        captured: satang(560_000),
        protectedRemainder: satang(0),
        payout: satang(500_001), // one satang too much
        fee: satang(60_000),
        tax: satang(0),
        refunds: satang(0),
        providerCosts: satang(0),
        adjustments: satang(0),
      }),
    ).toBe(false);
  });

  it("caps payouts at the available funds and rejects negatives (PAY-08)", () => {
    expect(withinAllocation(satang(100), satang(100))).toBe(true); // boundary is inclusive
    expect(withinAllocation(satang(101), satang(100))).toBe(false);
    expect(withinAllocation(satang(-1), satang(100))).toBe(false);
    expect(withinAllocation(satang(0), satang(-1))).toBe(false); // corrupt available
  });

  it("rejects conservation with negative money legs (PAY-07)", () => {
    expect(
      conserves({
        captured: satang(100),
        protectedRemainder: satang(200),
        payout: satang(0),
        fee: satang(0),
        tax: satang(0),
        refunds: satang(-100), // "balances" only if negatives were allowed
        providerCosts: satang(0),
        adjustments: satang(0),
      }),
    ).toBe(false);
  });

  it("rejects a negative captured even when a signed adjustment would balance it (PAY-07)", () => {
    // `adjustments` is signed by design, so a negative capture could "balance" against a
    // negative adjustment and slip through the equality check — the captured>=0 guard blocks it.
    expect(
      conserves({
        captured: satang(-100),
        protectedRemainder: satang(0),
        payout: satang(0),
        fee: satang(0),
        tax: satang(0),
        refunds: satang(0),
        providerCosts: satang(0),
        adjustments: satang(-100),
      }),
    ).toBe(false);
  });

  it("builds a checkout that totals compensation + fee + tax (PAY-02)", () => {
    const c = buildCheckout(thb(5_000), { tax: satang(0) });
    expect(c.serviceFee).toBe(60_000);
    expect(c.total).toBe(560_000);
  });

  it("enforces financial conservation (PAY-07)", () => {
    // captured must equal all downstream allocations exactly
    expect(
      conserves({
        captured: satang(560_000),
        protectedRemainder: satang(0),
        payout: satang(500_000),
        fee: satang(60_000),
        tax: satang(0),
        refunds: satang(0),
        providerCosts: satang(0),
        adjustments: satang(0),
      }),
    ).toBe(true);
  });
});

describe("money constructors reject impossible amounts", () => {
  it("refuses a negative checkout (it is a bug upstream, not a refund)", () => {
    // buildCheckout(satang(-100)) used to return { total: -112 } quite happily.
    expect(() => buildCheckout(satang(-100))).toThrow(RangeError);
    expect(() => serviceFee(satang(-100))).toThrow(RangeError);
    expect(() => buildCheckout(satang(1000), { tax: satang(-1) })).toThrow(RangeError);
  });

  it("refuses an out-of-range fee rate", () => {
    // 12% mistyped as if bps were percent x 1000 silently charged 12x the compensation.
    expect(() => serviceFee(satang(1_000_000), 120_000)).toThrow(RangeError);
    expect(() => serviceFee(satang(1_000_000), -1)).toThrow(RangeError);
    // The boundaries are legal: 0% and 100%.
    expect(serviceFee(satang(1_000_000), 0)).toBe(0);
    expect(serviceFee(satang(1_000_000), 10_000)).toBe(1_000_000);
  });

  it("keeps satang() itself signed — reversals and adjustments need a direction", () => {
    expect(satang(-100)).toBe(-100);
  });

  it("formats satang as THB for UI (LOC-02)", () => {
    expect(formatThb(1_120_000)).toBe("฿11,200.00");
    expect(formatThb(satang(50))).toBe("฿0.50");
  });
});

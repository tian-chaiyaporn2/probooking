import { describe, it, expect } from "vitest";
import { thb, satang, serviceFee, buildCheckout, conserves } from "../src/money.js";

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

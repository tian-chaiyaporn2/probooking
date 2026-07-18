import { describe, it, expect } from "vitest";
import {
  remainingLedgerFunds,
  assertLedgerHeadroom,
} from "../src/modules/marketplace/money-ledger.util.js";
import { ConflictError } from "../src/modules/marketplace/errors.util.js";

describe("money-ledger.util (PAY-08 headroom)", () => {
  const captured = 1_120_000;
  const events = [
    { type: "Collection", amount: captured },
    { type: "Payout", amount: 500_000 },
    { type: "Refund", amount: 100_000 },
  ];

  it("subtracts payouts and refunds from captured", () => {
    expect(remainingLedgerFunds({ captured, events })).toBe(520_000);
  });

  it("reserves pending dual-control refund proposals", () => {
    expect(
      remainingLedgerFunds({ captured, events, pendingRefundApprovals: 200_000 }),
    ).toBe(320_000);
  });

  it("rejects amounts above remaining headroom", () => {
    expect(() =>
      assertLedgerHeadroom(600_000, { captured, events }, "refund"),
    ).toThrow(ConflictError);
    expect(() =>
      assertLedgerHeadroom(520_000, { captured, events }, "refund"),
    ).not.toThrow();
  });
});

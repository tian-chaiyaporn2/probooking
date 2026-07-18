import { describe, it, expect, beforeEach } from "vitest";
import { normalizePhone, blindIndex, resetFieldKeyCache } from "@probook/db";

describe("normalizePhone", () => {
  beforeEach(() => {
    process.env.FIELD_ENCRYPTION_KEY = "a".repeat(64);
    resetFieldKeyCache();
  });

  it("strips formatting and normalizes Thai leading zero", () => {
    expect(normalizePhone(" 081-234-5678 ")).toBe("+66812345678");
    expect(normalizePhone("+66812345678")).toBe("+66812345678");
  });

  it("makes blind index stable across formatting variants", () => {
    process.env.FIELD_ENCRYPTION_KEY = "a".repeat(64);
    expect(blindIndex("081 234 5678")).toBe(blindIndex("+66812345678"));
  });
});

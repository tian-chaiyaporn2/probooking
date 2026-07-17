import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OtpService } from "../src/modules/auth/otp.service.js";

describe("OtpService (§7.3, AUTH-01)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const codesOf = (otp: OtpService) =>
    (otp as unknown as { codes: Map<string, unknown> }).codes;

  it("sweeps expired codes rather than growing without bound", () => {
    const otp = new OtpService();
    for (let i = 0; i < 100; i++) otp.request(`+66sweep${i}`);
    expect(codesOf(otp).size).toBe(100);

    // Past the 5-minute expiry, the next request prunes the dead entries. Without the
    // sweep, spraying distinct phone numbers grew this map until the process died — an
    // expired code was only removed if someone happened to attempt it.
    vi.advanceTimersByTime(6 * 60_000);
    otp.request("+66sweepNew");
    expect(codesOf(otp).size).toBe(1);
  });

  it("issues an unguessable 6-digit code (not a constant)", () => {
    const otp = new OtpService();
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const code = otp.request(`+66rand${i}`);
      expect(code).toMatch(/^\d{6}$/);
      seen.add(code);
    }
    // The code used to be the literal "123456". Any constant collapses this to 1.
    expect(seen.size).toBeGreaterThan(20);
  });

  it("is single-use and burns the code after repeated wrong attempts", () => {
    const otp = new OtpService();
    const code = otp.request("+66single");
    expect(otp.verify("+66single", code)).toBe(true);
    expect(otp.verify("+66single", code)).toBe(false); // single-use

    const code2 = otp.request("+66burn");
    for (let i = 0; i < 5; i++) expect(otp.verify("+66burn", "000000")).toBe(false);
    expect(otp.verify("+66burn", code2)).toBe(false); // burned after 5 wrong attempts
  });

  it("expires a code after 5 minutes", () => {
    const otp = new OtpService();
    const code = otp.request("+66exp");
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(otp.verify("+66exp", code)).toBe(false);
  });
});

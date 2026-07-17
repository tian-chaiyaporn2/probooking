import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Reflector } from "@nestjs/core";
import { HttpException } from "@nestjs/common";
import { ThrottleGuard, THROTTLE_KEY, NO_THROTTLE_KEY } from "../src/modules/throttle/throttle.guard.js";

/**
 * The e2e suite raises the limits (hundreds of calls from one IP is not the attack this
 * defends against), so without these the guard would be wired but unproven — the same
 * "tested and unenforced" shape this whole review was about.
 */
class Ctx {
  constructor(
    private readonly ip: string,
    private readonly handler = "h1",
    private readonly meta: Record<string, unknown> = {},
  ) {}
  switchToHttp() {
    return { getRequest: () => ({ ip: this.ip, socket: {} }) };
  }
  getHandler() {
    return { name: this.handler };
  }
  getClass() {
    return { name: "C" };
  }
  metaFor(key: string) {
    return this.meta[key];
  }
}

function guardWith(metaByKey: Record<string, unknown> = {}) {
  const reflector = {
    getAllAndOverride: (key: string) => metaByKey[key],
  } as unknown as Reflector;
  return new ThrottleGuard(reflector);
}

const ctx = (ip: string, handler = "h1") => new Ctx(ip, handler) as never;

describe("ThrottleGuard (§7.3)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit, then throws 429 with a retry hint", () => {
    const guard = guardWith({ [THROTTLE_KEY]: { limit: 3, ttlMs: 60_000 } });
    expect(guard.canActivate(ctx("1.1.1.1"))).toBe(true);
    expect(guard.canActivate(ctx("1.1.1.1"))).toBe(true);
    expect(guard.canActivate(ctx("1.1.1.1"))).toBe(true);
    try {
      guard.canActivate(ctx("1.1.1.1"));
      throw new Error("expected a 429");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const body = (e as HttpException).getResponse() as { statusCode: number; retryAfterMs: number };
      expect(body.statusCode).toBe(429);
      expect(body.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("counts per caller, so one noisy client cannot exhaust another's budget", () => {
    const guard = guardWith({ [THROTTLE_KEY]: { limit: 1, ttlMs: 60_000 } });
    expect(guard.canActivate(ctx("1.1.1.1"))).toBe(true);
    expect(() => guard.canActivate(ctx("1.1.1.1"))).toThrow();
    // A different caller is unaffected.
    expect(guard.canActivate(ctx("2.2.2.2"))).toBe(true);
  });

  it("counts per route, so a flood on one endpoint does not lock the whole app", () => {
    const guard = guardWith({ [THROTTLE_KEY]: { limit: 1, ttlMs: 60_000 } });
    expect(guard.canActivate(ctx("1.1.1.1", "otpVerify"))).toBe(true);
    expect(() => guard.canActivate(ctx("1.1.1.1", "otpVerify"))).toThrow();
    expect(guard.canActivate(ctx("1.1.1.1", "confirm"))).toBe(true);
  });

  it("resets after the window", () => {
    const guard = guardWith({ [THROTTLE_KEY]: { limit: 1, ttlMs: 60_000 } });
    expect(guard.canActivate(ctx("1.1.1.1"))).toBe(true);
    expect(() => guard.canActivate(ctx("1.1.1.1"))).toThrow();
    vi.advanceTimersByTime(60_001);
    expect(guard.canActivate(ctx("1.1.1.1"))).toBe(true);
  });

  it("honours an exemption (health checks must never be throttled into looking down)", () => {
    const guard = guardWith({ [NO_THROTTLE_KEY]: true, [THROTTLE_KEY]: { limit: 1, ttlMs: 1000 } });
    for (let i = 0; i < 50; i++) expect(guard.canActivate(ctx("1.1.1.1"))).toBe(true);
  });

  it("does not grow its counter map without bound", () => {
    // The same unbounded-Map problem OtpService has: without the sweep, every distinct
    // ip+route seen would be retained forever.
    const guard = guardWith({ [THROTTLE_KEY]: { limit: 5, ttlMs: 1_000 } });
    for (let i = 0; i < 200; i++) guard.canActivate(ctx(`10.0.0.${i}`));
    const size = () => (guard as unknown as { counters: Map<string, unknown> }).counters.size;
    expect(size()).toBe(200);
    // Past the window, the next request sweeps the expired entries away.
    vi.advanceTimersByTime(61_000);
    guard.canActivate(ctx("10.0.0.1"));
    expect(size()).toBe(1);
  });
});


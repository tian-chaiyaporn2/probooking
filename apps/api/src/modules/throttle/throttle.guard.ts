import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

/**
 * Fixed-window rate limiting (§7.3). There was none: the only throttle in the app was
 * OtpService's per-phone interval on *requesting* a code, so `/auth/otp/verify` could be
 * hammered and every money endpoint was unbounded.
 *
 * Hand-rolled, like this codebase's JWT and body validation, rather than @nestjs/throttler:
 * the repo uses `node-linker=hoisted`, which gives apps/api its own physical @nestjs/core,
 * so a root-installed guard injects a different `Reflector` class and DI fails. Fewer
 * moving parts beats debugging module resolution for ~40 lines of counting.
 *
 * Counters are in-process — correct for one instance, per-instance behind a load balancer,
 * exactly like OtpService's. `REDIS_URL` is reserved in `.env.example` for when that matters; the
 * limits here are a blunt DoS/brute-force brake, not a quota system.
 */
export interface ThrottleLimit {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in ms. */
  ttlMs: number;
}

export const THROTTLE_KEY = "throttle";

/** Override the default limit for a handler (e.g. the stricter auth bucket). */
export const Throttle = (limit: ThrottleLimit) => SetMetadata(THROTTLE_KEY, limit);

/** Exempt a handler entirely (e.g. /health, which a load balancer polls). */
export const NO_THROTTLE_KEY = "noThrottle";
export const NoThrottle = () => SetMetadata(NO_THROTTLE_KEY, true);

/**
 * Limits are env-tunable because they are a deployment concern, not a rule: the right
 * number depends on how many users sit behind one NAT, and a test suite hammering one
 * route from one IP is not an attacker. Defaults are the production intent; CI raises them
 * so the guard stays *on* (a misconfiguration still fails the boot) without the suite
 * throttling itself.
 */
const envInt = (name: string, fallback: number): number => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const DEFAULT: ThrottleLimit = {
  limit: envInt("THROTTLE_LIMIT", 120),
  ttlMs: envInt("THROTTLE_TTL_MS", 60_000),
};

/** The stricter bucket for auth routes, where guessing — not volume — is the attack. */
export const AUTH_THROTTLE: ThrottleLimit = {
  limit: envInt("THROTTLE_AUTH_LIMIT", 10),
  ttlMs: envInt("THROTTLE_TTL_MS", 60_000),
};

interface Counter {
  count: number;
  resetAt: number;
}

@Injectable()
export class ThrottleGuard implements CanActivate {
  // Keyed by `${ip}:${route}` so one noisy caller cannot exhaust another's budget, and a
  // flood on one endpoint does not lock a user out of the rest of the app.
  private readonly counters = new Map<string, Counter>();
  private lastSweep = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const exempt = this.reflector.getAllAndOverride<boolean>(NO_THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (exempt) return true;

    const limit =
      this.reflector.getAllAndOverride<ThrottleLimit>(THROTTLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT;

    const req = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    this.sweep(now);

    // `req.ip` honours trust proxy; fall back to the socket address. Behind a proxy the app
    // must set `trust proxy` or every caller shares one key — that is a deployment concern,
    // noted rather than silently assumed.
    const who = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    const key = `${who}:${context.getClass().name}.${context.getHandler().name}`;

    const entry = this.counters.get(key);
    if (!entry || entry.resetAt <= now) {
      this.counters.set(key, { count: 1, resetAt: now + limit.ttlMs });
      return true;
    }
    if (entry.count >= limit.limit) {
      const retryAfterMs = entry.resetAt - now;
      throw new HttpException(
        {
          statusCode: 429,
          message: "too many requests; retry later",
          retryAfterMs,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    entry.count++;
    return true;
  }

  /**
   * Drop expired counters. Without this the map grows for every distinct ip+route seen —
   * the same unbounded-Map problem OtpService has. Swept lazily (at most once a window) so
   * this costs nothing on a normal request.
   */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, entry] of this.counters) {
      if (entry.resetAt <= now) this.counters.delete(key);
    }
  }
}

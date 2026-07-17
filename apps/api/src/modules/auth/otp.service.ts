import { Injectable, Logger } from "@nestjs/common";
import { randomInt } from "node:crypto";
import { maskPhone } from "../marketplace/privacy.util.js";

/**
 * OTP login (AUTH-01). Mock provider: the code is generated and "sent" (logged); in
 * production it goes via the SMS partner. Codes expire after 5 minutes and are single-use.
 */
/**
 * §7.3 rate limiting: minimum ms between OTP requests for one phone. Env-tunable for the
 * same reason the ThrottleGuard limits are — a test suite reusing a fixed set of staff
 * phones is not the SMS-bombing this defends against. Default is the production intent.
 */
const OTP_MIN_INTERVAL_MS = (() => {
  const n = Number(process.env.OTP_MIN_INTERVAL_MS);
  return Number.isFinite(n) && n >= 0 ? n : 30 * 1000;
})();
/** Max wrong verify attempts before the current code is burned (brute-force guard). */
const OTP_MAX_ATTEMPTS = 5;

/** Thrown when a phone requests OTP codes too quickly (mapped to HTTP 429). */
export class OtpRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("too many OTP requests; retry later");
  }
}

/**
 * State is in-process, like the ThrottleGuard's: correct for one instance, per-instance
 * behind a load balancer — where the 30s interval and the single-use guarantee both weaken
 * (a code becomes replayable against a second replica). `REDIS_URL` is reserved in
 * `.env.example` for when that matters; this is a Phase-1 limitation, recorded rather than implied.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger("Otp");
  private readonly codes = new Map<string, { code: string; exp: number; attempts: number }>();
  private readonly lastRequestAt = new Map<string, number>();
  private lastSweep = 0;

  /**
   * Drop expired codes and stale request timestamps. Neither map was ever pruned — an
   * expired code was only removed if someone happened to attempt it — so spraying distinct
   * phone numbers grew them until the process died. Swept lazily so a normal request pays
   * nothing.
   */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [phone, rec] of this.codes) {
      if (rec.exp < now) this.codes.delete(phone);
    }
    for (const [phone, at] of this.lastRequestAt) {
      if (now - at > OTP_MIN_INTERVAL_MS) this.lastRequestAt.delete(phone);
    }
  }

  request(phone: string): string {
    // §7.3: throttle per phone to blunt SMS-bombing / enumeration. (An IP-scoped limit is
    // applied globally by ThrottleGuard; this one is per-phone, which an attacker rotating
    // IPs cannot dodge.)
    const now = Date.now();
    this.sweep(now);
    const last = this.lastRequestAt.get(phone);
    if (last !== undefined && now - last < OTP_MIN_INTERVAL_MS) {
      throw new OtpRateLimitError(OTP_MIN_INTERVAL_MS - (now - last));
    }
    this.lastRequestAt.set(phone, now);
    // Cryptographically random, never guessable. randomInt is uniform (no modulo bias).
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.codes.set(phone, { code, exp: now + 5 * 60 * 1000, attempts: 0 });
    // Never log the code or the raw phone — logs are not a secure channel (§7.3).
    this.logger.log(`OTP issued for ${maskPhone(phone)}`);
    return code;
  }

  verify(phone: string, code: string): boolean {
    const rec = this.codes.get(phone);
    if (!rec || rec.exp < Date.now()) return false;
    if (rec.code === code) {
      this.codes.delete(phone); // single-use
      return true;
    }
    // Brute-force guard: burn the code after too many wrong attempts, forcing a re-request.
    if (++rec.attempts >= OTP_MAX_ATTEMPTS) {
      this.codes.delete(phone);
      this.logger.warn(`OTP for ${maskPhone(phone)} burned after ${OTP_MAX_ATTEMPTS} failed attempts`);
    }
    return false;
  }
}

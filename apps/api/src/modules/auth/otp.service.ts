import { Injectable, Logger } from "@nestjs/common";

/**
 * OTP login (AUTH-01). Mock provider: the code is generated and "sent" (logged); in
 * production it goes via the SMS partner. Codes expire after 5 minutes and are single-use.
 */
/** §7.3 rate limiting: minimum seconds between OTP requests for one phone. */
const OTP_MIN_INTERVAL_MS = 30 * 1000;
/** Max wrong verify attempts before the current code is burned (brute-force guard). */
const OTP_MAX_ATTEMPTS = 5;

/** Thrown when a phone requests OTP codes too quickly (mapped to HTTP 429). */
export class OtpRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("too many OTP requests; retry later");
  }
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger("Otp");
  private readonly codes = new Map<string, { code: string; exp: number; attempts: number }>();
  private readonly lastRequestAt = new Map<string, number>();

  request(phone: string): string {
    // §7.3: throttle per phone to blunt SMS-bombing / enumeration.
    const last = this.lastRequestAt.get(phone);
    const now = Date.now();
    if (last !== undefined && now - last < OTP_MIN_INTERVAL_MS) {
      throw new OtpRateLimitError(OTP_MIN_INTERVAL_MS - (now - last));
    }
    this.lastRequestAt.set(phone, now);
    // Deterministic in dev so the flow is testable; random + SMS in production.
    const code = "123456";
    this.codes.set(phone, { code, exp: now + 5 * 60 * 1000, attempts: 0 });
    this.logger.log(`OTP for ${phone}: ${code}`);
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
      this.logger.warn(`OTP for ${phone} burned after ${OTP_MAX_ATTEMPTS} failed attempts`);
    }
    return false;
  }
}

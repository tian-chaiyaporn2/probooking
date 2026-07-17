import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { Public } from "./auth.guard.js";
import { Throttle, AUTH_THROTTLE } from "../throttle/throttle.guard.js";
import { OtpService, OtpRateLimitError } from "./otp.service.js";
import { signToken } from "./token.util.js";
import { devAuthEnabled } from "./dev-mode.util.js";

/**
 * Phase-0/1 staff mapping: phones that resolve to an internal platform role on login.
 * In production this comes from an admin-managed access list (§3), not a constant.
 *
 * Sourced from env so the phones are not a published constant in the repo: a reader of
 * the source would otherwise know exactly which numbers to target for an admin session.
 * Format: `STAFF_PHONES=+66...:operations,+66...:finance`.
 */
const INTERNAL_ROLES = ["operations", "finance", "administrator"];

function parseStaffPhones(spec: string): Record<string, string> {
  const staff: Record<string, string> = {};
  for (const entry of spec.split(",").map((e) => e.trim()).filter(Boolean)) {
    const idx = entry.lastIndexOf(":");
    if (idx <= 0) continue;
    const phone = entry.slice(0, idx).trim();
    const role = entry.slice(idx + 1).trim();
    if (phone && INTERNAL_ROLES.includes(role)) staff[phone] = role;
  }
  return staff;
}

const STAFF: Record<string, string> = parseStaffPhones(process.env.STAFF_PHONES ?? "");

@Controller("auth")
export class AuthController {
  constructor(private readonly otp: OtpService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("otp/request")
  request(@Body() raw: { phone?: string }): { sent: true; devCode?: string } {
    const phone = typeof raw?.phone === "string" ? raw.phone.trim() : "";
    if (!phone || phone.length > 32) throw new BadRequestException("phone required");
    try {
      const code = this.otp.request(phone);
      // The code is a credential: it goes back to the caller ONLY under the explicit
      // dev-mode opt-in (local dev + e2e, never production). Otherwise it leaves solely
      // via the SMS partner, so requesting an OTP for someone else's phone is useless.
      return devAuthEnabled() ? { sent: true, devCode: code } : { sent: true };
    } catch (e) {
      if (e instanceof OtpRateLimitError) {
        throw new HttpException(
          { statusCode: 429, message: e.message, retryAfterMs: e.retryAfterMs },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw e;
    }
  }

  // The brute-force guard burns a code after 5 wrong attempts, but nothing stopped an
  // attacker cycling re-request -> 5 guesses indefinitely, or spraying many phones at once.
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("otp/verify")
  verify(@Body() raw: { phone?: string; code?: string }) {
    const phone = typeof raw?.phone === "string" ? raw.phone.trim() : "";
    const code = typeof raw?.code === "string" ? raw.code.trim() : "";
    if (!phone || phone.length > 32 || !code || code.length > 16) {
      throw new BadRequestException("phone and code required");
    }
    if (!this.otp.verify(phone, code)) {
      throw new UnauthorizedException("invalid or expired code");
    }
    const role = STAFF[phone] ?? "user";
    return { token: signToken({ sub: phone, role }), role };
  }
}

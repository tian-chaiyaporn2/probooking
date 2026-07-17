import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Public } from "./auth.guard.js";
import { Throttle, AUTH_THROTTLE } from "../throttle/throttle.guard.js";
import { OtpService, OtpRateLimitError } from "./otp.service.js";
import { signToken } from "./token.util.js";
import { devAuthEnabled } from "./dev-mode.util.js";
import { AuthGuard, Roles, CurrentUser } from "./auth.guard.js";
import type { TokenPayload } from "./token.util.js";
import { TokenRevocationService } from "./token-revocation.service.js";
import { StaffDirectory } from "./staff-directory.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly revocations: TokenRevocationService,
    private readonly staff: StaffDirectory,
  ) {}

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
    // Authority is the phone's CURRENT access-list entry, resolved via the shared directory
    // (the guard re-checks the same source on each request).
    const role = this.staff.roleFor(phone) ?? "user";
    return { token: signToken({ sub: phone, role }), role };
  }

  /** Log out: revoke the presented token so it can no longer be used, even before it expires. */
  @UseGuards(AuthGuard)
  @Post("logout")
  logout(@CurrentUser() user?: TokenPayload) {
    if (user) this.revocations.revoke(user);
    return { revoked: true };
  }

  /**
   * Administrator: revoke every session a subject currently holds (log them out everywhere).
   * The counterpart to removing a staff phone from the access list — that stops NEW internal
   * access; this also kills any token they already hold, including an ordinary-user session.
   */
  @UseGuards(AuthGuard)
  @Roles("administrator")
  @Post("sessions/revoke")
  revokeSessions(@Body() raw: { subject?: string }) {
    const subject = typeof raw?.subject === "string" ? raw.subject.trim() : "";
    if (!subject) throw new BadRequestException("subject required");
    this.revocations.revokeAllForSubject(subject);
    return { subject, revoked: true };
  }

  /**
   * Administrator: suspend a staff phone (§3). Removes their internal role from the access
   * list so the guard denies them on the next request, and revokes any session they already
   * hold. This is the immediate "revoke staff access now" that a config change + restart
   * could not give, and is the recovery path a leaked staff token needs.
   */
  @UseGuards(AuthGuard)
  @Roles("administrator")
  @Post("staff/suspend")
  suspendStaff(@Body() raw: { phone?: string }) {
    const phone = typeof raw?.phone === "string" ? raw.phone.trim() : "";
    if (!phone) throw new BadRequestException("phone required");
    const wasStaff = this.staff.suspend(phone);
    this.revocations.revokeAllForSubject(phone); // also kill an ordinary-user session, if any
    return { phone, suspended: wasStaff };
  }
}

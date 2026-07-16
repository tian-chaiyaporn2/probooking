import { BadRequestException, Body, Controller, Post, UnauthorizedException } from "@nestjs/common";
import { OtpService } from "./otp.service.js";
import { signToken } from "./token.util.js";

// Phase-0/1 staff mapping: phones that resolve to an internal platform role on login.
// In production this comes from an admin-managed access list (§3), not a constant.
const STAFF: Record<string, string> = {
  "+66000000001": "operations",
  "+66000000002": "finance",
  "+66000000003": "administrator",
};

const INTERNAL_ROLES = new Set(["operations", "finance", "administrator"]);

@Controller("auth")
export class AuthController {
  constructor(private readonly otp: OtpService) {}

  @Post("otp/request")
  request(@Body() dto: { phone: string }) {
    if (!dto.phone) throw new BadRequestException("phone required");
    const code = this.otp.request(dto.phone);
    // devCode is returned only for the mock provider — remove when real SMS is wired.
    return { sent: true, devCode: code };
  }

  @Post("otp/verify")
  verify(@Body() dto: { phone: string; code: string }) {
    if (!this.otp.verify(dto.phone, dto.code)) {
      throw new UnauthorizedException("invalid or expired code");
    }
    const role = STAFF[dto.phone] ?? "user";
    return { token: signToken({ sub: dto.phone, role }), role };
  }

  /**
   * Dev-only shortcut so the internal dashboards (and e2e) can obtain an
   * operations/finance token without the full OTP + access-list flow. Remove in prod.
   */
  @Post("dev/token")
  devToken(@Body() dto: { role: string }) {
    if (!INTERNAL_ROLES.has(dto.role)) throw new BadRequestException("unknown internal role");
    return { token: signToken({ sub: `dev:${dto.role}`, role: dto.role }), role: dto.role };
  }
}

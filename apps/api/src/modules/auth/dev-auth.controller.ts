import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { Public } from "./auth.guard.js";
import { Throttle, AUTH_THROTTLE } from "../throttle/throttle.guard.js";
import { signToken } from "./token.util.js";

const INTERNAL_ROLES = new Set(["operations", "finance", "administrator"]);

/**
 * Dev-only shortcut so the internal dashboards (and e2e) can obtain an
 * operations/finance token without the full OTP + access-list flow.
 *
 * This controller is registered ONLY when `devTokenRouteEnabled()` (see AuthModule) — it is
 * a complete auth bypass, so it must not exist as a route in production, and stays off even
 * in demo mode unless `DEV_TOKEN_ROUTE=true` is explicitly set (the e2e suite). Keeping it in
 * its own controller means the route is absent rather than guarded by a runtime `if`.
 */
@Controller("auth")
export class DevAuthController {
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("dev/token")
  devToken(@Body() dto: { role: string }) {
    if (!INTERNAL_ROLES.has(dto.role)) throw new BadRequestException("unknown internal role");
    return { token: signToken({ sub: `dev:${dto.role}`, role: dto.role }), role: dto.role };
  }
}

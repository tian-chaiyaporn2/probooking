import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { DevAuthController } from "./dev-auth.controller.js";
import { OtpService } from "./otp.service.js";
import { AuthGuard } from "./auth.guard.js";
import { TokenRevocationService } from "./token-revocation.service.js";
import { StaffDirectory } from "./staff-directory.js";
import { devAuthEnabled } from "./dev-mode.util.js";

// The dev-token route is a full auth bypass, so it is registered as a route only when
// explicitly enabled outside production — not merely guarded inside the handler.
//
// TokenRevocationService and StaffDirectory are exported alongside AuthGuard because the
// guard depends on them and is used from other modules (@UseGuards(AuthGuard)); their
// providers must be resolvable wherever the guard is instantiated.
@Module({
  controllers: devAuthEnabled() ? [AuthController, DevAuthController] : [AuthController],
  providers: [OtpService, AuthGuard, TokenRevocationService, StaffDirectory],
  exports: [AuthGuard, TokenRevocationService, StaffDirectory],
})
export class AuthModule {}

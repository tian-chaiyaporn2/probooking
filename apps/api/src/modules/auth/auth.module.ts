import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { DevAuthController } from "./dev-auth.controller.js";
import { OtpService } from "./otp.service.js";
import { AuthGuard } from "./auth.guard.js";
import { devAuthEnabled } from "./dev-mode.util.js";

// The dev-token route is a full auth bypass, so it is registered as a route only when
// explicitly enabled outside production — not merely guarded inside the handler.
@Module({
  controllers: devAuthEnabled() ? [AuthController, DevAuthController] : [AuthController],
  providers: [OtpService, AuthGuard],
  exports: [AuthGuard],
})
export class AuthModule {}

import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { OtpService } from "./otp.service.js";
import { AuthGuard } from "./auth.guard.js";

@Module({
  controllers: [AuthController],
  providers: [OtpService, AuthGuard],
  exports: [AuthGuard],
})
export class AuthModule {}

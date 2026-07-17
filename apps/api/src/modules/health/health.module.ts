import { Controller, Get, Module } from "@nestjs/common";
import { NoThrottle } from "../throttle/throttle.guard.js";

@Controller("health")
class HealthController {
  // Exempt: a load balancer or uptime check polls this continuously and must never be
  // throttled into reporting the service as down.
  @NoThrottle()
  @Get()
  check() {
    return { status: "ok", service: "probook-api" };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}

import { Controller, Get, Logger, Module, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../auth/auth.guard.js";
import { NoThrottle } from "../throttle/throttle.guard.js";

@Controller("health")
class HealthController {
  private readonly logger = new Logger("Health");

  // Exempt: a load balancer or uptime check polls this continuously and must never be
  // throttled into reporting the service as down — and must not require a Bearer token.
  @Public()
  @NoThrottle()
  @Get()
  check() {
    return { status: "ok", service: "probook-api" };
  }

  /**
   * Readiness (M9): liveness (`/health`) says the process is up; this says it can actually
   * serve — i.e. its persistence backend is reachable. In-memory demo mode is always ready.
   * In Postgres mode it pings the DB; a failure returns 503 so an orchestrator can hold
   * traffic. Prisma is imported lazily and only when DATABASE_URL is set, so the in-memory
   * process never constructs a PrismaClient (matching the lazy store selection).
   */
  @Public()
  @NoThrottle()
  @Get("ready")
  async ready() {
    if (!process.env.DATABASE_URL) {
      return { status: "ready", store: "in-memory" };
    }
    try {
      const { prisma } = await import("@probook/db");
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ready", store: "postgres" };
    } catch (e) {
      // Log the real cause server-side, but never return it: this probe is @Public, so a raw
      // Prisma connection error would disclose host/database/user fragments to anonymous callers.
      this.logger.warn(`readiness probe failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException({ status: "not-ready", store: "postgres" });
    }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}

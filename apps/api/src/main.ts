import "./env.js"; // MUST be first: populates process.env before any module reads it
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const isProd = process.env.NODE_ENV === "production";

  // Refuse to boot in production on the dev JWT secret — otherwise anyone could mint an
  // administrator token with the public default and pass AuthGuard (§3).
  if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-only")) {
    throw new Error("JWT_SECRET must be set to a strong, non-default value in production");
  }

  const app = await NestFactory.create(AppModule);

  // CORS: pin to an allowlist when CORS_ORIGINS is configured (comma-separated). In dev
  // (no allowlist) reflect the request origin for convenience; warn if that happens in prod.
  const origins = process.env.CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins && origins.length) {
    app.enableCors({ origin: origins });
  } else {
    if (isProd) console.warn("CORS_ORIGINS is unset in production — reflecting all origins");
    app.enableCors({ origin: true });
  }

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ProBooking API listening on :${port}`);
}

void bootstrap();

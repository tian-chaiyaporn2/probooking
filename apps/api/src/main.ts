import "./env.js"; // MUST be first: populates process.env before any module reads it
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module.js";
import { devAuthEnabled } from "./modules/auth/dev-mode.util.js";
import { assertSigningSecretConfigured } from "./modules/auth/token.util.js";
import { assertFieldKeyConfigured } from "./modules/marketplace/field-crypto.js";

async function bootstrap() {
  const isProd = process.env.NODE_ENV === "production";
  const devAuth = devAuthEnabled();

  // Fail fast at boot rather than at the first signed request. `secret()` throws unless a
  // strong JWT_SECRET is configured or the explicit dev opt-in is on (§3).
  assertSigningSecretConfigured();

  // Same for the field-encryption key: a missing key should refuse to boot, not surface as
  // the first message send or clinic registration throwing (§7.3).
  assertFieldKeyConfigured();

  // The dev-auth bypass (dev/token route + devCode in the OTP response) can never be on in
  // production — devAuthEnabled() already excludes it — but say so loudly when it IS on, so
  // an operator can never mistake a bypass-enabled host for a secured one.
  if (devAuth) {
    console.warn(
      "AUTH_DEV_MODE=true — /auth/dev/token + /auth/dev/status are exposed and OTP codes are returned in responses. " +
        "Never point this at real data or a public tunnel.",
    );
  }

  const app = await NestFactory.create(AppModule);

  // Behind a reverse proxy / tunnel, `req.ip` is only trustworthy when Express honours
  // X-Forwarded-For. Without this, every caller shares one throttle key (or spoofs freely
  // if the proxy is misconfigured). One hop is enough for our tunnel / single LB shape.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  // §7.3 security headers (HSTS, X-Content-Type-Options, Referrer-Policy, …). None were
  // set on a service handling medical credentials and money. `contentSecurityPolicy` is
  // left off: this process serves JSON only — the web app is a separate static origin, and
  // a CSP here would protect nothing while being one more thing to get wrong.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Explicit body limit. Express defaults to 100kb, which is fine — but relying on a
  // framework default for a DoS control means it can vanish in an upgrade without notice.
  app.use(json({ limit: "100kb" }));
  app.use(urlencoded({ extended: false, limit: "100kb" }));

  // CORS: pin to an allowlist when CORS_ORIGINS is configured (comma-separated). Reflecting
  // every origin is a dev-only convenience, so it is tied to the explicit dev opt-in and
  // fails closed everywhere else — a warning does not stop a misconfigured host booting.
  const origins = process.env.CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins && origins.length) {
    app.enableCors({ origin: origins });
  } else if (devAuth) {
    app.enableCors({ origin: true });
  } else {
    throw new Error(
      "CORS_ORIGINS must list the allowed origins (or set AUTH_DEV_MODE=true for local dev)",
    );
  }

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  // Drain Nest on SIGTERM so Prisma's pool is closed rather than killed mid-query on redeploy.
  app.enableShutdownHooks();
  // eslint-disable-next-line no-console
  console.log(`ProBooking API listening on :${port}`);
}

void bootstrap();

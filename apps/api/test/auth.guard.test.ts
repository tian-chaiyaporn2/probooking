import { describe, it, expect, beforeAll } from "vitest";
import { Reflector } from "@nestjs/core";
import { UnauthorizedException, ForbiddenException } from "@nestjs/common";
import type { TokenRevocationService } from "../src/modules/auth/token-revocation.service.js";
import type { StaffDirectory } from "../src/modules/auth/staff-directory.js";

process.env.AUTH_DEV_MODE = "true";
process.env.NODE_ENV = "test";

type AuthMod = typeof import("../src/modules/auth/auth.guard.js");
type TokenMod = typeof import("../src/modules/auth/token.util.js");

let AuthGuard: AuthMod["AuthGuard"];
let IS_PUBLIC_KEY: AuthMod["IS_PUBLIC_KEY"];
let ROLES_KEY: AuthMod["ROLES_KEY"];
let signToken: TokenMod["signToken"];

beforeAll(async () => {
  const token = await import("../src/modules/auth/token.util.js");
  token.assertSigningSecretConfigured();
  signToken = token.signToken;
  const auth = await import("../src/modules/auth/auth.guard.js");
  AuthGuard = auth.AuthGuard;
  IS_PUBLIC_KEY = auth.IS_PUBLIC_KEY;
  ROLES_KEY = auth.ROLES_KEY;
});

class Ctx {
  private req: { headers: { authorization?: string }; user?: unknown };

  constructor(auth: string | undefined) {
    this.req = { headers: auth ? { authorization: auth } : {} };
  }
  switchToHttp() {
    return { getRequest: () => this.req };
  }
  getHandler() {
    return { name: "h" };
  }
  getClass() {
    return { name: "C" };
  }
}

function guardWith(metaByKey: Record<string, unknown> = {}) {
  const reflector = {
    getAllAndOverride: (key: string) => metaByKey[key],
  } as unknown as Reflector;
  // Master added revocation + live staff re-validation; stub as no-ops for these unit tests.
  const revocations = { isRevoked: () => false } as unknown as TokenRevocationService;
  const staff = { roleFor: () => undefined } as unknown as StaffDirectory;
  return new AuthGuard(reflector, revocations, staff);
}

describe("AuthGuard (fail-closed + @Public)", () => {
  it("rejects missing Bearer by default", () => {
    const guard = guardWith();
    expect(() => guard.canActivate(new Ctx(undefined) as never)).toThrow(UnauthorizedException);
  });

  it("allows @Public handlers without a token", () => {
    const guard = guardWith({ [IS_PUBLIC_KEY]: true });
    expect(guard.canActivate(new Ctx(undefined) as never)).toBe(true);
  });

  it("accepts a valid token and attaches the payload", () => {
    const guard = guardWith();
    const token = signToken({ sub: "+66000", role: "user" });
    const ctx = new Ctx(`Bearer ${token}`);
    expect(guard.canActivate(ctx as never)).toBe(true);
    expect(ctx.switchToHttp().getRequest().user).toMatchObject({ sub: "+66000", role: "user" });
  });

  it("enforces @Roles when present", () => {
    const guard = guardWith({ [ROLES_KEY]: ["operations"] });
    const userTok = signToken({ sub: "+66000", role: "user" });
    expect(() => guard.canActivate(new Ctx(`Bearer ${userTok}`) as never)).toThrow(ForbiddenException);
    // `dev:` subjects skip the live staff-directory re-check (AUTH_DEV_MODE mint path).
    const opsTok = signToken({ sub: "dev:operations", role: "operations" });
    expect(guard.canActivate(new Ctx(`Bearer ${opsTok}`) as never)).toBe(true);
  });
});

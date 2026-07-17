import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { TokenRevocationService } from "../src/modules/auth/token-revocation.service.js";
import { StaffDirectory } from "../src/modules/auth/staff-directory.js";
import type { TokenPayload } from "../src/modules/auth/token.util.js";

const tok = (over: Partial<TokenPayload> = {}): TokenPayload => ({
  sub: "+66900000001",
  role: "finance",
  iat: 1000,
  exp: 1000 + 3600,
  jti: "jti-1",
  ...over,
});

describe("TokenRevocationService (§7.3)", () => {
  let svc: TokenRevocationService;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    svc = new TokenRevocationService();
  });
  afterEach(() => vi.useRealTimers());

  it("revokes a single token by jti (logout)", () => {
    const t = tok({ jti: "abc", exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(svc.isRevoked(t)).toBe(false);
    svc.revoke(t);
    expect(svc.isRevoked(t)).toBe(true);
    // A different token for the same subject is unaffected.
    expect(svc.isRevoked(tok({ jti: "xyz" }))).toBe(false);
  });

  it("revokes every session for a subject by cutoff (logout everywhere)", () => {
    const now = Math.floor(Date.now() / 1000);
    const existing = tok({ sub: "+66x", jti: "old", iat: now - 10 });
    expect(svc.isRevoked(existing)).toBe(false);
    svc.revokeAllForSubject("+66x");
    // The token issued before the cutoff is revoked...
    expect(svc.isRevoked(existing)).toBe(true);
    // ...but a fresh login (later iat) is not.
    const relogin = tok({ sub: "+66x", jti: "new", iat: now + 5 });
    expect(svc.isRevoked(relogin)).toBe(false);
  });

  it("sweeps entries once their tokens have expired, staying bounded", () => {
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 50; i++) svc.revoke(tok({ jti: `j${i}`, exp: now + 60 }));
    const size = () => (svc as unknown as { revokedJti: Map<string, number> }).revokedJti.size;
    expect(size()).toBe(50);
    // Past the tokens' expiry, the next operation sweeps them away.
    vi.advanceTimersByTime(3600_000);
    svc.revoke(tok({ jti: "fresh", exp: Math.floor(Date.now() / 1000) + 60 }));
    expect(size()).toBe(1);
  });
});

describe("StaffDirectory (§3)", () => {
  it("parses phone:role pairs and rejects unknown roles", () => {
    const d = StaffDirectory.parse("+66a:finance,+66b:operations,+66c:hacker,malformed");
    expect(d).toEqual({ "+66a": "finance", "+66b": "operations" });
  });
  it("classifies internal roles", () => {
    expect(StaffDirectory.isInternalRole("operations")).toBe(true);
    expect(StaffDirectory.isInternalRole("finance")).toBe(true);
    expect(StaffDirectory.isInternalRole("user")).toBe(false);
    expect(StaffDirectory.isInternalRole("worker")).toBe(false);
  });

  it("suspend removes the role so a re-login resolves to an ordinary user (§3)", () => {
    process.env.STAFF_PHONES = "+66fin:finance";
    const d = new StaffDirectory();
    expect(d.roleFor("+66fin")).toBe("finance");
    expect(d.suspend("+66fin")).toBe(true); // was staff
    expect(d.roleFor("+66fin")).toBeUndefined(); // -> a fresh login would be "user"
    expect(d.suspend("+66fin")).toBe(false); // idempotent: already gone
    d.grant("+66fin", "operations"); // restore, e.g. re-added to the access list
    expect(d.roleFor("+66fin")).toBe("operations");
    delete process.env.STAFF_PHONES;
  });
});

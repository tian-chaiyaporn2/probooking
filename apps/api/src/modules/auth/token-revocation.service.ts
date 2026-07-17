import { Injectable } from "@nestjs/common";
import type { TokenPayload } from "./token.util.js";

/**
 * Token revocation (§7.3). A signed token is otherwise valid for its full hour with no way
 * to kill it — a leaked or forged token cannot be stopped, and "log out" does nothing.
 *
 * Two mechanisms, both in-process (like OtpService and the throttle counters — correct for
 * one instance, per-instance behind a load balancer; `REDIS_URL` is in the env for when
 * that matters):
 *  - a deny-list of individual `jti`s, for logging out one token; and
 *  - a per-subject "not-before" cutoff, for logging out every session a subject holds
 *    (e.g. after a password/device compromise) without enumerating their tokens.
 *
 * Entries are kept only until the token they concern would expire anyway, then swept — a
 * revocation of an already-expired token is meaningless, so the store stays bounded.
 */
@Injectable()
export class TokenRevocationService {
  private readonly revokedJti = new Map<string, number>(); // jti -> exp (unix seconds)
  private readonly notBefore = new Map<string, number>(); // subject -> iat cutoff (unix seconds)
  private lastSweep = 0;

  /** Revoke a single token until its natural expiry (logout). */
  revoke(payload: TokenPayload): void {
    this.sweep();
    this.revokedJti.set(payload.jti, payload.exp);
  }

  /**
   * Revoke every token for a subject issued at or before now (log out everywhere). A token
   * with `iat <= cutoff` is rejected; new logins (later `iat`) are unaffected.
   */
  revokeAllForSubject(subject: string): void {
    this.sweep();
    this.notBefore.set(subject, Math.floor(Date.now() / 1000));
  }

  /**
   * True if this token has been revoked, individually or via its subject's cutoff.
   *
   * The cutoff is inclusive (`iat <= cutoff`): "log out everywhere" must reliably kill every
   * token issued up to that instant, including one minted in the same second. The trade is
   * that a fresh login must land in a LATER second to be honoured — the honest "you've been
   * logged out; sign in again" flow — because `iat` is second-granular (a JWT convention)
   * and the two events cannot be told apart within one second.
   */
  isRevoked(payload: TokenPayload): boolean {
    if (this.revokedJti.has(payload.jti)) return true;
    const cutoff = this.notBefore.get(payload.sub);
    return cutoff !== undefined && payload.iat <= cutoff;
  }

  /** Drop entries whose tokens have expired; a normal request pays nothing (swept ≤1/min). */
  private sweep(): void {
    const now = Math.floor(Date.now() / 1000);
    if (now - this.lastSweep < 60) return;
    this.lastSweep = now;
    for (const [jti, exp] of this.revokedJti) {
      if (exp <= now) this.revokedJti.delete(jti);
    }
    // A subject cutoff can be dropped once it is older than the max token TTL (1h) — any
    // token it could still reject has itself expired by then.
    for (const [sub, cutoff] of this.notBefore) {
      if (cutoff <= now - 3600) this.notBefore.delete(sub);
    }
  }
}

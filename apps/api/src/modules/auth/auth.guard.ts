import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { verifyToken, type TokenPayload } from "./token.util.js";
import { TokenRevocationService } from "./token-revocation.service.js";
import { StaffDirectory } from "./staff-directory.js";

const ROLES_KEY = "roles";
/** Restrict a handler to the given platform roles (§3). Empty = any authenticated user. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated token payload (set by AuthGuard) into a handler param. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): TokenPayload | undefined => {
  return ctx.switchToHttp().getRequest<Request & { user?: TokenPayload }>().user;
});

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly revocations: TokenRevocationService,
    private readonly staff: StaffDirectory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const req = context.switchToHttp().getRequest<Request & { user?: TokenPayload }>();
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    const payload = token ? verifyToken(token) : null;
    if (!payload) throw new UnauthorizedException("authentication required");

    // Revocation: a logged-out or force-expired token is rejected even though its signature
    // and expiry still check out.
    if (this.revocations.isRevoked(payload)) {
      throw new UnauthorizedException("session has been revoked");
    }

    // Live access-list check: a human staff token carries the role that was true at login.
    // Re-derive it from the current access list so removing a phone (suspending a staff
    // member) takes effect on the next request, not an hour later at expiry. Dev tokens
    // (`sub` = "dev:role", only under AUTH_DEV_MODE) and the worker service identity carry
    // no phone and are exempt.
    if (
      StaffDirectory.isInternalRole(payload.role) &&
      !payload.sub.startsWith("dev:")
    ) {
      if (this.staff.roleFor(payload.sub) !== payload.role) {
        throw new ForbiddenException("staff access has been revoked or changed");
      }
    }

    if (required.length > 0 && !required.includes(payload.role)) {
      throw new ForbiddenException(`requires role: ${required.join(" | ")}`);
    }
    req.user = payload;
    return true;
  }
}

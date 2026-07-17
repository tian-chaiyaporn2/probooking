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

export const ROLES_KEY = "roles";
/** Restrict a handler to the given platform roles (§3). Empty = any authenticated user. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const IS_PUBLIC_KEY = "isPublic";
/**
 * Opt a handler OUT of the global AuthGuard. Same shape as `@NoThrottle`: auth fails
 * closed by default; only explicitly public surfaces (registration, browse, OTP, health)
 * skip the Bearer check.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Injects the authenticated token payload (set by AuthGuard) into a handler param. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): TokenPayload | undefined => {
  return ctx.switchToHttp().getRequest<Request & { user?: TokenPayload }>().user;
});

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const req = context.switchToHttp().getRequest<Request & { user?: TokenPayload }>();
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    const payload = token ? verifyToken(token) : null;
    if (!payload) throw new UnauthorizedException("authentication required");
    if (required.length > 0 && !required.includes(payload.role)) {
      throw new ForbiddenException(`requires role: ${required.join(" | ")}`);
    }
    req.user = payload;
    return true;
  }
}

import {
  CanActivate,
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

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

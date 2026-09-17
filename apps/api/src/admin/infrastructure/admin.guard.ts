import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

/**
 * Guard de rol ADMIN para consola B2B de plataforma.
 * Debe aplicarse DESPUÉS de SessionGuard (requiere req.person poblado).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const roles = req.person?.roles ?? [];
    if (!roles.includes("ADMIN")) {
      throw new ForbiddenException("requiere rol ADMIN");
    }
    return true;
  }
}

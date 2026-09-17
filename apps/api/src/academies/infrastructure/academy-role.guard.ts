import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

/**
 * Guard de rol para crear academias.
 * Debe aplicarse DESPUÉS de SessionGuard (requiere req.person poblado).
 * La spec permite crear con rol ACADEMY_OWNER en cualquier status
 * (PENDING/SANDBOX = academia demo). Nota: el schema no tiene flag
 * `isDemo` en Academy — gap reportado; cualquier status del rol permite crear.
 */
@Injectable()
export class AcademyOwnerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const roles = req.person?.roles ?? [];
    if (!roles.includes("ACADEMY_OWNER")) {
      throw new ForbiddenException("requiere rol ACADEMY_OWNER");
    }
    return true;
  }
}

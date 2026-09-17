import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

const DOOR_ROLES = ["STAFF", "ADMIN"];

/**
 * Guard de rol para operaciones de puerta.
 * Debe aplicarse DESPUÉS de SessionGuard (requiere req.person poblado).
 */
@Injectable()
export class StaffGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const roles = req.person?.roles ?? [];
    if (!roles.some((r) => DOOR_ROLES.includes(r))) {
      throw new ForbiddenException("requiere rol STAFF o ADMIN");
    }
    return true;
  }
}

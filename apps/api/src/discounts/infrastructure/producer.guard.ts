import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

const DISCOUNT_ROLES = ["PRODUCER", "ADMIN"];

/**
 * Guard de rol para gestión de discount_code.
 * Debe aplicarse DESPUÉS de SessionGuard (requiere req.person poblado).
 */
@Injectable()
export class ProducerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const roles = req.person?.roles ?? [];
    if (!roles.some((r) => DISCOUNT_ROLES.includes(r))) {
      throw new ForbiddenException("requiere rol PRODUCER o ADMIN");
    }
    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

const SOCIAL_STAFF_ROLES = ["PRODUCER", "STAFF", "ADMIN"];

/**
 * Guard de rol para operaciones de productor/staff del módulo social
 * (guest lists, promote de waitlist). Patrón de checkins/staff.guard.ts —
 * se crea uno propio porque aquí también entra PRODUCER.
 * Debe aplicarse DESPUÉS de SessionGuard (requiere req.person poblado).
 */
@Injectable()
export class ProducerStaffGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const roles = req.person?.roles ?? [];
    if (!roles.some((r) => SOCIAL_STAFF_ROLES.includes(r))) {
      throw new ForbiddenException("requiere rol PRODUCER, STAFF o ADMIN");
    }
    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { REQUIRED_ROLES_KEY, ALLOW_SANDBOX_KEY } from "./roles.decorator";

/**
 * RBAC global. Uso: `@UseGuards(SessionGuard, RolesGuard)` +
 * `@RequireRoles("STAFF", "ADMIN")` (OR lógico).
 *
 * Semántica de PersonRole.status:
 * - APPROVED → acceso completo.
 * - SANDBOX → acceso solo en rutas con @AllowSandbox() (flujo demo).
 * - PENDING → sin acceso privilegiado.
 *
 * Sin metadata de roles → permite (la autenticación la decide SessionGuard).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required?.length) return true;

    const allowSandbox =
      this.reflector.getAllAndOverride<boolean>(ALLOW_SANDBOX_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? false;

    const req = ctx.switchToHttp().getRequest<Request>();
    const states = req.person?.roleStates ?? [];
    const ok = states.some(
      (s) =>
        required.includes(s.role) &&
        (s.status === "APPROVED" || (allowSandbox && s.status === "SANDBOX")),
    );
    if (!ok) {
      throw new ForbiddenException(`requiere rol ${required.join(" o ")}`);
    }
    return true;
  }
}

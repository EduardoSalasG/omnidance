import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "../../prisma.service";
import {
  ALLOW_SANDBOX_KEY,
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_ROLES_KEY,
} from "./roles.decorator";

// Cache de catálogo rol→permisos (compartido entre instancias del guard —
// cambia solo desde /admin, 30s de tolerancia).
const CATALOG_TTL_MS = 30_000;
const catalogCache = new Map<
  string,
  { isSuperuser: boolean; permissions: Set<string>; at: number }
>();

/** Invalida el cache del catálogo — lo llama /admin tras mutar grants/roles. */
export function invalidateRoleCatalog(roleKey?: string): void {
  if (roleKey) catalogCache.delete(roleKey);
  else catalogCache.clear();
}

/**
 * RBAC global, todo DB-driven. Uso:
 *   `@UseGuards(SessionGuard, RolesGuard)` +
 *   `@RequirePermissions("checkins.write")` (OR lógico) — preferido;
 *   `@RequireRoles("STAFF")` — escape hatch por rol directo.
 *
 * Semántica de PersonRole.status:
 * - APPROVED → acceso completo.
 * - SANDBOX → acceso solo en rutas con @AllowSandbox() (flujo demo).
 * - PENDING → sin acceso privilegiado.
 *
 * Role.isSuperuser (ADMIN) pasa cualquier check de permisos.
 * Sin metadata → permite (la autenticación la decide SessionGuard).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    const requiredPerms = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!requiredRoles?.length && !requiredPerms?.length) return true;

    const allowSandbox =
      this.reflector.getAllAndOverride<boolean>(ALLOW_SANDBOX_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? false;

    const req = ctx.switchToHttp().getRequest<Request>();
    const states = req.person?.roleStates;
    if (!states) {
      throw new ForbiddenException("sesión requerida");
    }

    const active = states.filter(
      (s) => s.status === "APPROVED" || (allowSandbox && s.status === "SANDBOX"),
    );
    const activeRoles = active.map((s) => s.role);

    if (requiredRoles?.some((r) => activeRoles.includes(r))) return true;

    if (requiredPerms?.length && (await this.hasPermission(activeRoles, requiredPerms))) {
      return true;
    }

    const what = requiredRoles?.length
      ? `rol ${requiredRoles.join(" o ")}`
      : `permiso ${requiredPerms!.join(" o ")}`;
    throw new ForbiddenException(`requiere ${what}`);
  }

  private async hasPermission(
    roleKeys: string[],
    requiredPerms: string[],
  ): Promise<boolean> {
    if (!roleKeys.length) return false;
    const missing = roleKeys.filter((k) => {
      const hit = catalogCache.get(k);
      return !hit || Date.now() - hit.at > CATALOG_TTL_MS;
    });

    if (missing.length) {
      const rows = await this.prisma.role.findMany({
        where: { key: { in: missing } },
        select: {
          key: true,
          isSuperuser: true,
          permissions: { select: { permissionKey: true } },
        },
      });
      for (const r of rows) {
        catalogCache.set(r.key, {
          isSuperuser: r.isSuperuser,
          permissions: new Set(r.permissions.map((p) => p.permissionKey)),
          at: Date.now(),
        });
      }
      // roles inexistentes en catálogo → cachear como vacío
      for (const k of missing) {
        if (!catalogCache.has(k)) {
          catalogCache.set(k, {
            isSuperuser: false,
            permissions: new Set(),
            at: Date.now(),
          });
        }
      }
    }

    return roleKeys.some((k) => {
      const r = catalogCache.get(k);
      if (!r) return false;
      if (r.isSuperuser) return true;
      return requiredPerms.some((p) => r.permissions.has(p));
    });
  }
}

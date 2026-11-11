import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { deviceLabel } from "../../common/user-agent";

/**
 * Revocación administrativa de sesiones (spec auth-sessions): el admin
 * ve las sesiones de cualquier persona desde su ficha y puede matarlas
 * - revoke-all incluye la sesión vigente del usuario, es justamente el
 * punto de matar sesiones (cuenta comprometida, soporte).
 *
 * Read/write directo sobre Prisma siguiendo la convención del módulo
 * (user-intel); la capa self-service está en me-sessions.controller.
 */
@Controller("admin")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminUserSessionsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/admin/users/:personId/sessions - sesiones recientes
   * (activas y revocadas, con el flag) para la sección de la ficha.
   */
  @Get("users/:personId/sessions")
  async list(@Param("personId") personId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException("usuario no encontrado");
    const rows = await this.prisma.authSession.findMany({
      where: { personId },
      orderBy: { lastSeenAt: "desc" },
      take: 100,
    });
    return {
      sessions: rows.map((s) => ({
        id: s.id,
        device: deviceLabel(s.userAgent),
        ip: s.ip,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        revoked: s.revokedAt !== null,
      })),
    };
  }

  @Delete("sessions/:id")
  async revoke(@Param("id") id: string) {
    const res = await this.prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!res.count) throw new NotFoundException("sesión no encontrada");
    return { ok: true };
  }

  @Post("users/:personId/sessions/revoke-all")
  @HttpCode(200)
  async revokeAll(@Param("personId") personId: string) {
    const res = await this.prisma.authSession.updateMany({
      where: { personId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true, revoked: res.count };
  }
}

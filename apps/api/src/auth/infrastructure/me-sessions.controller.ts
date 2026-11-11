import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AUTH_REPO, type AuthRepo } from "../domain/ports";
import { SessionGuard } from "./session.guard";
import { deviceLabel } from "../../common/user-agent";

/**
 * Gestión de sesiones del usuario (spec auth-sessions): "mis
 * dispositivos" - sesiones activas con el dispositivo parseado del
 * User-Agent, la sesión actual marcada por su jti y revocación
 * self-scoped (ownership por personId).
 *
 * GET lista solo activas (revokedAt null) - una sesión ya revocada no
 * aporta a la UI y queda en la fila para el admin.
 */
@Controller("me/sessions")
@UseGuards(SessionGuard)
export class MeSessionsController {
  constructor(@Inject(AUTH_REPO) private readonly repo: AuthRepo) {}

  @Get()
  async list(@Req() req: Request) {
    const rows = await this.repo.listAuthSessions(req.person!.id);
    return {
      sessions: rows
        .filter((s) => s.revokedAt === null)
        .map((s) => ({
          id: s.id,
          device: deviceLabel(s.userAgent),
          ip: s.ip,
          createdAt: s.createdAt,
          lastSeenAt: s.lastSeenAt,
          current: s.jti === req.person!.jti,
        })),
    };
  }

  @Delete(":id")
  async revoke(@Req() req: Request, @Param("id") id: string) {
    const revoked = await this.repo.revokeAuthSession(id, req.person!.id);
    if (!revoked) throw new NotFoundException("sesión no encontrada");
    return { ok: true };
  }

  /**
   * "Cerrar otras sesiones": revoca todas las activas menos la del JWT
   * actual (req.person.jti). Token legado sin jti → no hay sesión
   * actual que preservar en la tabla y revoca todas las filas.
   */
  @Post("revoke-others")
  @HttpCode(200)
  async revokeOthers(@Req() req: Request) {
    const revoked = await this.repo.revokeOtherAuthSessions(
      req.person!.id,
      req.person!.jti,
    );
    return { ok: true, revoked };
  }
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Academy } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import {
  canAdministerAcademy,
  canManageAcademy,
  type AcademyContext,
  type PersonContext,
} from "../domain/academy.service";

/**
 * Helper de infraestructura: resuelve la academia + sus instructores y aplica
 * las reglas puras de acceso del dominio (404 si no existe, 403 si no alcanza).
 */
@Injectable()
export class AcademyAccess {
  constructor(private readonly prisma: PrismaService) {}

  async loadContext(
    academyId: string,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      include: {
        instructors: { select: { personId: true, commissionPct: true } },
      },
    });
    if (!academy) throw new NotFoundException("academia no encontrada");
    return {
      academy,
      ctx: {
        ownerId: academy.ownerId,
        instructorIds: academy.instructors.map((i) => i.personId),
      },
    };
  }

  /** Resuelve admin.access desde el catálogo DB (cacheado por el guard). */
  private async withAdmin(person: PersonContext): Promise<PersonContext> {
    const isAdmin = await roleKeysHavePermission(this.prisma, person.roles, [
      "admin.access",
    ]);
    return { ...person, isAdmin };
  }

  /** owner / instructor / ADMIN — detalle y registro de asistencia. */
  async requireManage(
    academyId: string,
    person: PersonContext,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const loaded = await this.loadContext(academyId);
    if (!canManageAcademy(await this.withAdmin(person), loaded.ctx)) {
      throw new ForbiddenException("sin acceso a esta academia");
    }
    return loaded;
  }

  /** solo owner / ADMIN — planes, enrollments, slots, dashboard, listados. */
  async requireAdminister(
    academyId: string,
    person: PersonContext,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const loaded = await this.loadContext(academyId);
    if (!canAdministerAcademy(await this.withAdmin(person), loaded.ctx)) {
      throw new ForbiddenException("requiere ser owner o ADMIN");
    }
    return loaded;
  }

  /**
   * Mutaciones de consola (spec academy-saas-billing, S3): una academia
   * con `billingBlockedAt` queda read-only — cualquier escritura del
   * owner/instructor/ADMIN responde 403 `{error:"billing.blocked"}`.
   * Las lecturas siguen por requireManage/requireAdminister, y los
   * endpoints de billing (subscribe/cancel/subscription) quedan fuera
   * a propósito: el owner debe poder pagar para desbloquearse.
   */
  private assertWritable(academy: Academy): void {
    if (academy.billingBlockedAt != null) {
      throw new ForbiddenException({
        error: "billing.blocked",
        message:
          "la academia está bloqueada por suscripción impaga — regulariza el pago para volver a operar",
        blockedAt: academy.billingBlockedAt,
      });
    }
  }

  /** requireManage + no bloqueada — mutaciones que también hace instructor. */
  async requireManageWrite(
    academyId: string,
    person: PersonContext,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const loaded = await this.requireManage(academyId, person);
    this.assertWritable(loaded.academy);
    return loaded;
  }

  /** requireAdminister + no bloqueada — mutaciones solo owner/ADMIN. */
  async requireAdministerWrite(
    academyId: string,
    person: PersonContext,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const loaded = await this.requireAdminister(academyId, person);
    this.assertWritable(loaded.academy);
    return loaded;
  }
}

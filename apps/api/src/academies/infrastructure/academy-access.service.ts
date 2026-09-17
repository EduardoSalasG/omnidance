import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Academy } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
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
      include: { instructors: { select: { personId: true } } },
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

  /** owner / instructor / ADMIN — detalle y registro de asistencia. */
  async requireManage(
    academyId: string,
    person: PersonContext,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const loaded = await this.loadContext(academyId);
    if (!canManageAcademy(person, loaded.ctx)) {
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
    if (!canAdministerAcademy(person, loaded.ctx)) {
      throw new ForbiddenException("requiere ser owner o ADMIN");
    }
    return loaded;
  }
}

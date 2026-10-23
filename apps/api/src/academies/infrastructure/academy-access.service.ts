import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Academy } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import {
  canAcademy,
  canAdministerAcademy,
  canManageAcademy,
  isAcademyStaff,
  type AcademyCapability,
  type AcademyContext,
  type PersonContext,
} from "../domain/academy.service";
import {
  assertAcademyFeature,
  type AcademyFeature,
} from "../domain/academy-tiers";

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
        instructors: { select: { personId: true } },
        staff: true,
      },
    });
    if (!academy) throw new NotFoundException("academia no encontrada");
    return {
      academy,
      ctx: {
        ownerId: academy.ownerId,
        instructorIds: academy.instructors.map((i) => i.personId),
        staff: (academy.staff ?? []).map((s) => ({
          personId: s.personId,
          caps: {
            students: s.canStudents,
            payments: s.canPayments,
            plans: s.canPlans,
            schedule: s.canSchedule,
            profile: s.canProfile,
            team: s.canTeam,
            billing: s.canBilling,
          },
        })),
      },
    };
  }

  /** ¿La persona tiene `admin.access` de plataforma? (GET /:id/access). */
  async isPlatformAdmin(person: PersonContext): Promise<boolean> {
    return (await this.withAdmin(person)).isAdmin === true;
  }

  /** Resuelve admin.access desde el catálogo DB (cacheado por el guard). */
  private async withAdmin(person: PersonContext): Promise<PersonContext> {
    const isAdmin = await roleKeysHavePermission(this.prisma, person.roles, [
      "admin.access",
    ]);
    return { ...person, isAdmin };
  }

  /**
   * Gate de tier (spec academy-tier-cobros): cuando el endpoint declara
   * `feature`, la academia debe cubrirla con su suscripción → 403
   * `{error:"tier.required", upgrade:true, requiredTier}`. ADMIN de
   * plataforma opera por otro y nunca se gatea (mismo criterio que
   * producer-pro); alumnos no llegan acá (endpoints de consola).
   */
  private assertTier(
    person: PersonContext,
    academy: Academy,
    feature?: AcademyFeature,
  ): void {
    if (feature && !person.isAdmin) {
      assertAcademyFeature(academy, feature);
    }
  }

  /** owner / instructor / ADMIN - detalle y registro de asistencia. */
  async requireManage(
    academyId: string,
    person: PersonContext,
    feature?: AcademyFeature,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const loaded = await this.loadContext(academyId);
    const p = await this.withAdmin(person);
    if (!canManageAcademy(p, loaded.ctx)) {
      throw new ForbiddenException("sin acceso a esta academia");
    }
    this.assertTier(p, loaded.academy, feature);
    return loaded;
  }

  /** solo owner / ADMIN - planes, enrollments, slots, dashboard, listados. */
  async requireAdminister(
    academyId: string,
    person: PersonContext,
    feature?: AcademyFeature,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const loaded = await this.loadContext(academyId);
    const p = await this.withAdmin(person);
    if (!canAdministerAcademy(p, loaded.ctx)) {
      throw new ForbiddenException("requiere ser owner o ADMIN");
    }
    this.assertTier(p, loaded.academy, feature);
    return loaded;
  }

  /**
   * Acceso por capacidad delegada (spec academy-staff-roles): owner,
   * ADMIN o staff con el flag. La familia de endpoints que abre cada
   * capacidad está en el spec (payments/students/plans/schedule/
   * profile/team/billing).
   */
  async requireCapability(
    academyId: string,
    person: PersonContext,
    cap: AcademyCapability,
    feature?: AcademyFeature,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const loaded = await this.loadContext(academyId);
    const p = await this.withAdmin(person);
    if (!canAcademy(p, loaded.ctx, cap)) {
      throw new ForbiddenException({
        error: "academy.capability",
        message: `requiere permiso de ${cap} en esta academia`,
        capability: cap,
      });
    }
    this.assertTier(p, loaded.academy, feature);
    return loaded;
  }

  /** Miembro del equipo (owner / cualquier staff / ADMIN) - lecturas. */
  async requireStaff(
    academyId: string,
    person: PersonContext,
    feature?: AcademyFeature,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const loaded = await this.loadContext(academyId);
    const p = await this.withAdmin(person);
    if (!isAcademyStaff(p, loaded.ctx)) {
      throw new ForbiddenException("requiere ser del equipo de la academia");
    }
    this.assertTier(p, loaded.academy, feature);
    return loaded;
  }

  /**
   * Mutaciones de consola (spec academy-saas-billing, S3): una academia
   * con `billingBlockedAt` queda read-only - cualquier escritura del
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
          "la academia está bloqueada por suscripción impaga. Regulariza el pago para volver a operar",
        blockedAt: academy.billingBlockedAt,
      });
    }
  }

  /** requireManage + no bloqueada - mutaciones que también hace instructor. */
  async requireManageWrite(
    academyId: string,
    person: PersonContext,
    feature?: AcademyFeature,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const loaded = await this.requireManage(academyId, person, feature);
    this.assertWritable(loaded.academy);
    return loaded;
  }

  /** requireAdminister + no bloqueada - mutaciones solo owner/ADMIN. */
  async requireAdministerWrite(
    academyId: string,
    person: PersonContext,
    feature?: AcademyFeature,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const loaded = await this.requireAdminister(academyId, person, feature);
    this.assertWritable(loaded.academy);
    return loaded;
  }

  /** requireCapability + no bloqueada - mutaciones delegables. */
  async requireCapabilityWrite(
    academyId: string,
    person: PersonContext,
    cap: AcademyCapability,
    feature?: AcademyFeature,
  ): Promise<{ academy: Academy; ctx: AcademyContext }> {
    const loaded = await this.requireCapability(academyId, person, cap, feature);
    this.assertWritable(loaded.academy);
    return loaded;
  }
}

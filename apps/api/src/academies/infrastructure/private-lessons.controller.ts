import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { AcademyAccess } from "./academy-access.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import { dayRange, pageParams, whitelist } from "./list-filters";
import { commissionSnapshot } from "./instructor-agreement";
import { ApiQuery } from "@nestjs/swagger";

const LESSON_ACTIONS = [
  "confirm",
  "cancel",
  "done",
  "reschedule",
  "assign",
  "pay-commission",
] as const;
type LessonAction = (typeof LESSON_ACTIONS)[number];

// Filtros del listado staff (spec analytics/query-console, entidad
// `private_lessons` del catálogo ACADEMY_OWNER) - mismas whitelists.
const PRIVATE_LESSON_STATUS = [
  "REQUESTED",
  "CONFIRMED",
  "DONE",
  "CANCELLED",
] as const;
const COMMISSION_OPTS = ["all", "paid", "pending"] as const;

class RequestPrivateLessonDto {
  /** personId del instructor (también acepta el id de AcademyInstructor). */
  @IsString()
  instructorId!: string;

  @IsISO8601()
  scheduledAt!: string;

  /** Schema: no hay tarifa en AcademyInstructor - default 0. */
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  /** Alumno de la lección (creación manual staff) - default: el actor. */
  @IsOptional()
  @IsString()
  personId?: string;
}

class PrivateLessonActionDto {
  @IsIn(LESSON_ACTIONS)
  action!: LessonAction;

  /** Requerido solo para action=reschedule/assign. */
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  /** personId del instructor - requerido solo para action=assign. */
  @IsOptional()
  @IsString()
  instructorId?: string;
}

/**
 * Clases privadas 1:1 alumno↔instructor dentro de una academia.
 * Schema real: PrivateLesson tiene FKs planas (sin relaciones Prisma) -
 * instructorId guarda el personId del instructor para que /mine funcione;
 * los joins con Person se hacen manual (mismo patrón que attendance/students).
 * status es String libre en schema: REQUESTED | CONFIRMED | DONE | CANCELLED.
 */
@Controller()
export class PrivateLessonsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Creación manual de clase particular por staff (owner/instructor/admin).
   * Desde private-lesson-product el alumno no solicita - compra el producto
   * (POST /checkout/private-class) y el owner asigna instructor+fecha vía
   * PATCH action=assign. Este endpoint queda para clases manuales (cortesía,
   * convenio).
   */
  @Post("academies/:id/private-lessons")
  @UseGuards(SessionGuard)
  async request(
    @Param("id") id: string,
    @Body() dto: RequestPrivateLessonDto,
    @Req() req: Request,
  ) {
    // Mutación de staff - academia bloqueada por mora → 403 (S3).
    const { academy } = await this.access.requireManageWrite(id, req.person!);
    if (!academy.active) {
      throw new BadRequestException("la academia está inactiva");
    }

    const instructor = await this.prisma.academyInstructor.findFirst({
      where: {
        academyId: id,
        OR: [{ personId: dto.instructorId }, { id: dto.instructorId }],
      },
    });
    if (!instructor) {
      throw new NotFoundException("instructor no encontrado en la academia");
    }

    return this.prisma.privateLesson.create({
      data: {
        academyId: id,
        instructorId: instructor.personId,
        personId: dto.personId ?? req.person!.id,
        scheduledAt: new Date(dto.scheduledAt),
        price: dto.price ?? 0,
        // Snapshot del acuerdo: solo COMMISSION escribe tasa (el resto
        // nace con 0 - spec instructor-commission-subtype).
        commissionPct: commissionSnapshot(instructor),
        status: "REQUESTED",
      },
    });
  }

  /**
   * Staff (owner/instructor/admin) lista las clases privadas de la
   * academia. Filtros del contrato compartido (spec
   * analytics/query-console): status e instructorId exactos,
   * commission = paid|pending|all sobre commissionPaidAt, from/to =
   * rango inclusivo por día sobre createdAt.
   */
  @Get("academies/:id/private-lessons")
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "instructorId", required: false })
  @ApiQuery({ name: "commission", required: false })
  @ApiQuery({ name: "from", required: false })
  @ApiQuery({ name: "to", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "pageSize", required: false })
  @UseGuards(SessionGuard)
  async list(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("status") status?: string,
    @Query("instructorId") instructorId?: string,
    @Query("commission") commission?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const me = req.person!;
    const { academy } = await this.access.requireManage(id, me);
    const statusF = whitelist(status, PRIVATE_LESSON_STATUS, "status");
    const commissionF = whitelist(commission, COMMISSION_OPTS, "commission");
    const range = dayRange(from, to);
    const pg = pageParams(page, pageSize);
    const where = {
      academyId: id,
      ...(statusF ? { status: statusF } : {}),
      ...(instructorId ? { instructorId } : {}),
      // "pending"/"paid" operan sobre el snapshot >0 (acuerdo COMMISSION
      // vigente o histórico); las clases con otro acuerdo quedan fuera.
      ...(commissionF === "paid"
        ? { commissionPct: { gt: 0 }, commissionPaidAt: { not: null } }
        : commissionF === "pending"
          ? { commissionPct: { gt: 0 }, commissionPaidAt: null }
          : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const [lessons, total] = await Promise.all([
      this.prisma.privateLesson.findMany({
        where,
        orderBy: { scheduledAt: "asc" },
        skip: pg.skip,
        take: pg.take,
      }),
      this.prisma.privateLesson.count({ where }),
    ]);
    const people = await this.prisma.person.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              lessons.flatMap((l) =>
                l.instructorId ? [l.personId, l.instructorId] : [l.personId],
              ),
            ),
          ],
        },
      },
      select: { id: true, name: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));

    // La comisión solo viaja en filas con snapshot >0 (acuerdo
    // COMMISSION vigente o histórico) y la ven owner/ADMIN o el
    // instructor de la clase.
    const isAdmin = await roleKeysHavePermission(this.prisma, me.roles, [
      "admin.access",
    ]);
    const seesCommission = (l: (typeof lessons)[number]) =>
      l.commissionPct > 0 &&
      (isAdmin || academy.ownerId === me.id || l.instructorId === me.id);

    return {
      items: lessons.map((l) => {
        const base = {
          ...l,
          person: byId.get(l.personId) ?? { id: l.personId, name: null },
          // null = comprada pero aún sin instructor asignado
          // (private-lesson-product) - la UI muestra "por asignar".
          instructor: l.instructorId
            ? (byId.get(l.instructorId) ?? { id: l.instructorId, name: null })
            : null,
        };
        if (seesCommission(l)) return base;
        const { commissionPct: _c, commissionPaidAt: _p, ...rest } = base;
        return rest;
      }),
      total,
      page: pg.page,
      pageSize: pg.pageSize,
    };
  }

  /**
   * Mis clases privadas como instructor - agrega commissionClp/netClp
   * solo en lecciones con snapshot de comisión >0 (acuerdo COMMISSION
   * vigente o histórico; la UI no hace aritmética de negocio). La vista del
   * alumno vive en /classes/mine (las particulares son una reserva
   * más) - este endpoint ya no expone la rama alumno: una sola fuente.
   */
  @Get("private-lessons/mine")
  @ApiQuery({ name: "as", required: false })
  @UseGuards(SessionGuard)
  async mine(@Query("as") asRole: string | undefined, @Req() req: Request) {
    if (asRole !== "instructor") {
      throw new BadRequestException(
        "usa GET /classes/mine para tus reservas (incluye particulares)",
      );
    }
    const personId = req.person!.id;
    const lessons = await this.prisma.privateLesson.findMany({
      where: { instructorId: personId },
      orderBy: { scheduledAt: "desc" },
    });
    const studentIds = [...new Set(lessons.map((l) => l.personId))];
    const people = studentIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, name: true },
        })
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return lessons.map((l) => {
      const base = {
        ...l,
        person: byId.get(l.personId) ?? { id: l.personId, name: null },
      };
      // Solo las clases con acuerdo COMMISSION (o históricas) llevan
      // neto por comisión: con otro subtipo no existe neto calculable
      // por este mecanismo y mostrar netClp=price sugeriría que el
      // instructor cobra el precio completo.
      if (l.commissionPct <= 0) return base;
      const commissionClp = Math.round((l.price * l.commissionPct) / 100);
      return {
        ...base,
        commissionClp,
        netClp: l.price - commissionClp,
      };
    });
  }

  /**
   * Detalle de una clase privada - lo consume la ficha del alumno en
   * /clases/[id] (una particular es una reserva más; cancelar vive en
   * su ficha, igual que una reserva normal) y staff/instructor.
   * Acceso: alumno dueño, instructor asignado, owner de la academia
   * o admin. La comisión solo viaja a quien la ve en la lista
   * (acuerdo academia↔instructor - nunca al alumno).
   */
  @Get("private-lessons/:id")
  @UseGuards(SessionGuard)
  async detail(@Param("id") id: string, @Req() req: Request) {
    const lesson = await this.prisma.privateLesson.findUnique({
      where: { id },
    });
    if (!lesson) throw new NotFoundException("clase privada no encontrada");

    const academy = await this.prisma.academy.findUnique({
      where: { id: lesson.academyId },
      select: { id: true, name: true, ownerId: true, billingBlockedAt: true },
    });
    const me = req.person!;
    const isAdmin = await roleKeysHavePermission(this.prisma, me.roles, [
      "admin.access",
    ]);
    const isOwner = isAdmin || academy?.ownerId === me.id;
    const isInstructor = lesson.instructorId === me.id;
    const isStudent = lesson.personId === me.id;
    if (!isOwner && !isInstructor && !isStudent) {
      throw new ForbiddenException("sin acceso a esta clase privada");
    }

    const people = await this.prisma.person.findMany({
      where: {
        id: {
          in: [
            lesson.personId,
            ...(lesson.instructorId ? [lesson.instructorId] : []),
          ],
        },
      },
      select: { id: true, name: true, photoUrl: true, instagram: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));

    const base = {
      id: lesson.id,
      status: lesson.status,
      scheduledAt: lesson.scheduledAt,
      price: lesson.price,
      createdAt: lesson.createdAt,
      academy: {
        id: academy?.id ?? lesson.academyId,
        name: academy?.name ?? null,
        billingBlocked: academy?.billingBlockedAt != null,
      },
      person: byId.get(lesson.personId) ?? { id: lesson.personId, name: null },
      instructor: lesson.instructorId
        ? (byId.get(lesson.instructorId) ?? {
            id: lesson.instructorId,
            name: null,
            photoUrl: null,
            instagram: null,
          })
        : null,
    };
    if ((isOwner || isInstructor) && lesson.commissionPct > 0) {
      return {
        ...base,
        commissionPct: lesson.commissionPct,
        commissionPaidAt: lesson.commissionPaidAt,
      };
    }
    return base;
  }

  /**
   * Transiciones de la clase privada.
   * confirm/done/reschedule: instructor de la clase u owner (ADMIN = owner).
   * cancel: el alumno (solo REQUESTED/CONFIRMED, la suya) u owner (cualquiera
   * no cancelada). Instructor no cancela. Transición inválida → 409.
   */
  @Patch("private-lessons/:id")
  @UseGuards(SessionGuard)
  async act(
    @Param("id") id: string,
    @Body() dto: PrivateLessonActionDto,
    @Req() req: Request,
  ) {
    const lesson = await this.prisma.privateLesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException("clase privada no encontrada");

    const academy = await this.prisma.academy.findUnique({
      where: { id: lesson.academyId },
      select: { ownerId: true, billingBlockedAt: true },
    });
    const me = req.person!;
    const isAdmin = await roleKeysHavePermission(this.prisma, me.roles, [
      "admin.access",
    ]);
    const isOwner = isAdmin || academy?.ownerId === me.id;
    const isInstructor = lesson.instructorId === me.id;
    const isStudent = lesson.personId === me.id;
    if (!isOwner && !isInstructor && !isStudent) {
      throw new ForbiddenException("sin acceso a esta clase privada");
    }

    // Academia bloqueada por mora (S3): las acciones de staff
    // (confirm/done/reschedule/assign/pay-commission) quedan read-only;
    // el alumno conserva `cancel` de su propia clase - no se castiga al
    // alumno por la mora del owner.
    if (
      academy?.billingBlockedAt != null &&
      !(dto.action === "cancel" && isStudent && !isOwner && !isInstructor)
    ) {
      throw new ForbiddenException({
        error: "billing.blocked",
        message:
          "la academia está bloqueada por suscripción impaga - regulariza el pago para volver a operar",
      });
    }

    switch (dto.action) {
      case "confirm": {
        if (!isOwner && !isInstructor) {
          throw new ForbiddenException("solo instructor u owner confirman");
        }
        if (lesson.status !== "REQUESTED") {
          throw new ConflictException(
            `no se puede confirmar una clase en estado ${lesson.status}`,
          );
        }
        return this.prisma.privateLesson.update({
          where: { id },
          data: { status: "CONFIRMED" },
        });
      }
      case "done": {
        // La clase realizada la marca solo el instructor que la dictó
        // (la asistencia es del profesor, no del owner - misma regla
        // que POST /classes/:id/attendance del instructor). ADMIN
        // queda como escape hatch operativo.
        if (!isInstructor && !isAdmin) {
          throw new ForbiddenException(
            "solo el instructor de la clase la marca realizada",
          );
        }
        if (lesson.status !== "CONFIRMED") {
          throw new ConflictException(
            `no se puede marcar DONE una clase en estado ${lesson.status}`,
          );
        }
        return this.prisma.privateLesson.update({
          where: { id },
          data: { status: "DONE" },
        });
      }
      case "cancel": {
        if (isInstructor && !isOwner && !isStudent) {
          throw new ForbiddenException("el instructor no cancela clases");
        }
        if (lesson.status === "CANCELLED") {
          throw new ConflictException("la clase ya está cancelada");
        }
        if (
          isStudent &&
          !isOwner &&
          !["REQUESTED", "CONFIRMED"].includes(lesson.status)
        ) {
          throw new ConflictException(
            `el alumno solo cancela en REQUESTED/CONFIRMED (estado ${lesson.status})`,
          );
        }
        const cancelled = await this.prisma.privateLesson.update({
          where: { id },
          data: { status: "CANCELLED" },
        });
        // Lección pagada cancelada: la devolución del dinero es manual
        // (Flow) - se avisa al owner y el pago se excluye del payout de
        // la academia (payouts.controller).
        if (cancelled.paymentId && academy?.ownerId) {
          await this.notifications.notifySafe(academy.ownerId, {
            category: "OPERATIONAL",
            type: "academy.private_lesson.cancelled_paid",
            title: "Clase particular cancelada",
            body: "Reembolsar el pago al alumno",
            data: {
              lessonId: lesson.id,
              academyId: lesson.academyId,
              paymentId: cancelled.paymentId,
            },
          });
        }
        return cancelled;
      }
      case "assign": {
        // private-lesson-product: el owner asigna instructor+fecha a una
        // lección comprada "por asignar" → CONFIRMED + snapshot de la
        // comisión del acuerdo (solo si es COMMISSION) + notifica a
        // ambas partes.
        if (!isOwner) {
          throw new ForbiddenException("solo el owner asigna la clase");
        }
        if (!dto.instructorId || !dto.scheduledAt) {
          throw new BadRequestException(
            "instructorId y scheduledAt son requeridos para assign",
          );
        }
        if (lesson.status !== "REQUESTED") {
          throw new ConflictException(
            `no se puede asignar una clase en estado ${lesson.status}`,
          );
        }
        const instructor = await this.prisma.academyInstructor.findFirst({
          where: {
            academyId: lesson.academyId,
            OR: [{ personId: dto.instructorId }, { id: dto.instructorId }],
          },
        });
        if (!instructor) {
          throw new NotFoundException(
            "instructor no encontrado en la academia",
          );
        }
        const updated = await this.prisma.privateLesson.update({
          where: { id },
          data: {
            instructorId: instructor.personId,
            scheduledAt: new Date(dto.scheduledAt),
            // Snapshot del acuerdo vigente al asignar: solo COMMISSION
            // escribe tasa (spec instructor-commission-subtype).
            commissionPct: commissionSnapshot(instructor),
            status: "CONFIRMED",
          },
        });
        const df = new Intl.DateTimeFormat("es-CL", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(updated.scheduledAt!);
        await this.notifications.notifySafe(lesson.personId, {
          category: "TRANSACTIONAL",
          type: "academy.private_lesson.assigned",
          title: "Clase particular agendada",
          body: df,
          data: { lessonId: lesson.id, academyId: lesson.academyId },
        });
        await this.notifications.notifySafe(instructor.personId, {
          category: "OPERATIONAL",
          type: "academy.private_lesson.assigned",
          title: "Clase particular asignada",
          body: df,
          data: { lessonId: lesson.id, academyId: lesson.academyId },
        });
        return updated;
      }
      case "reschedule": {
        if (!isOwner && !isInstructor) {
          throw new ForbiddenException("solo instructor u owner reagendan");
        }
        if (!dto.scheduledAt) {
          throw new BadRequestException(
            "scheduledAt es requerido para reschedule",
          );
        }
        if (!["REQUESTED", "CONFIRMED"].includes(lesson.status)) {
          throw new ConflictException(
            `no se puede reagendar una clase en estado ${lesson.status}`,
          );
        }
        return this.prisma.privateLesson.update({
          where: { id },
          data: { scheduledAt: new Date(dto.scheduledAt) },
        });
      }
      case "pay-commission": {
        // Liquidación de la comisión academia→instructor: la plataforma
        // no transfiere - el owner marca commissionPaidAt cuando paga
        // por fuera (transferencia/efectivo, mismo criterio que Payout).
        if (!isOwner) {
          throw new ForbiddenException("solo el owner liquida la comisión");
        }
        if (
          !lesson.instructorId ||
          lesson.commissionPct <= 0 ||
          !["CONFIRMED", "DONE"].includes(lesson.status)
        ) {
          throw new ConflictException(
            "la clase no tiene comisión pendiente de liquidar",
          );
        }
        if (lesson.commissionPaidAt) {
          throw new ConflictException("la comisión ya fue liquidada");
        }
        const updated = await this.prisma.privateLesson.update({
          where: { id },
          data: { commissionPaidAt: new Date() },
        });
        const clp = new Intl.NumberFormat("es-CL", {
          style: "currency",
          currency: "CLP",
          maximumFractionDigits: 0,
        }).format(Math.round((lesson.price * lesson.commissionPct) / 100));
        await this.notifications.notifySafe(lesson.instructorId, {
          category: "OPERATIONAL",
          type: "private_lesson.commission_paid",
          title: "Comisión liquidada",
          body: clp,
          data: { lessonId: lesson.id, academyId: lesson.academyId },
        });
        return updated;
      }
    }
  }
}


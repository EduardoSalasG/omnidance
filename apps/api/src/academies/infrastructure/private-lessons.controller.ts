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

const LESSON_ACTIONS = [
  "confirm",
  "cancel",
  "done",
  "reschedule",
  "assign",
] as const;
type LessonAction = (typeof LESSON_ACTIONS)[number];

class RequestPrivateLessonDto {
  /** personId del instructor (también acepta el id de AcademyInstructor). */
  @IsString()
  instructorId!: string;

  @IsISO8601()
  scheduledAt!: string;

  /** Schema: no hay tarifa en AcademyInstructor — default 0. */
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  /** Alumno de la lección (creación manual staff) — default: el actor. */
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

  /** personId del instructor — requerido solo para action=assign. */
  @IsOptional()
  @IsString()
  instructorId?: string;
}

/**
 * Clases privadas 1:1 alumno↔instructor dentro de una academia.
 * Schema real: PrivateLesson tiene FKs planas (sin relaciones Prisma) —
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
   * Desde private-lesson-product el alumno no solicita — compra el producto
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
    const { academy } = await this.access.requireManage(id, req.person!);
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
        // Snapshot de la comisión vigente del instructor — el owner
        // puede cambiarla después sin retroactuar sobre esta clase.
        commissionPct: instructor.commissionPct ?? 0,
        status: "REQUESTED",
      },
    });
  }

  /** Staff (owner/instructor/admin) lista las clases privadas de la academia. */
  @Get("academies/:id/private-lessons")
  @UseGuards(SessionGuard)
  async list(@Param("id") id: string, @Req() req: Request) {
    const me = req.person!;
    const { academy } = await this.access.requireManage(id, me);
    const lessons = await this.prisma.privateLesson.findMany({
      where: { academyId: id },
      orderBy: { scheduledAt: "asc" },
    });
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

    // La comisión es del acuerdo academia↔instructor: owner/ADMIN la ven
    // en todas las filas; un instructor solo en las suyas.
    const isAdmin = await roleKeysHavePermission(this.prisma, me.roles, [
      "admin.access",
    ]);
    const seesCommission = (l: (typeof lessons)[number]) =>
      isAdmin || academy.ownerId === me.id || l.instructorId === me.id;

    return lessons.map((l) => {
      const base = {
        ...l,
        person: byId.get(l.personId) ?? { id: l.personId, name: null },
        // null = comprada pero aún sin instructor asignado
        // (private-lesson-product) — la UI muestra "por asignar".
        instructor: l.instructorId
          ? (byId.get(l.instructorId) ?? { id: l.instructorId, name: null })
          : null,
      };
      if (seesCommission(l)) return base;
      const { commissionPct: _c, ...rest } = base;
      return rest;
    });
  }

  /**
   * Mis clases privadas: como alumno (default) o como instructor. La rama
   * instructor agrega commissionClp/netClp calculados (la UI no hace
   * aritmética de negocio); la rama alumno NO expone nada de la comisión
   * — es un acuerdo academia↔instructor.
   */
  @Get("private-lessons/mine")
  @UseGuards(SessionGuard)
  async mine(@Query("as") asRole: string | undefined, @Req() req: Request) {
    const personId = req.person!.id;
    const lessons = await this.prisma.privateLesson.findMany({
      where:
        asRole === "instructor" ? { instructorId: personId } : { personId },
      orderBy: { scheduledAt: "desc" },
    });
    if (asRole === "instructor") {
      return lessons.map((l) => {
        const commissionClp = Math.round((l.price * l.commissionPct) / 100);
        return { ...l, commissionClp, netClp: l.price - commissionClp };
      });
    }
    return lessons.map((l) => {
      const { commissionPct: _c, ...rest } = l;
      return rest;
    });
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
      select: { ownerId: true },
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
        if (!isOwner && !isInstructor) {
          throw new ForbiddenException("solo instructor u owner cierran");
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
        return this.prisma.privateLesson.update({
          where: { id },
          data: { status: "CANCELLED" },
        });
      }
      case "assign": {
        // private-lesson-product: el owner asigna instructor+fecha a una
        // lección comprada "por asignar" → CONFIRMED + snapshot de la
        // comisión vigente del instructor + notifica a ambas partes.
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
            commissionPct: instructor.commissionPct ?? 0,
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
          title: "Tu clase particular quedó agendada",
          body: df,
          data: { lessonId: lesson.id, academyId: lesson.academyId },
        });
        await this.notifications.notifySafe(instructor.personId, {
          category: "OPERATIONAL",
          type: "academy.private_lesson.assigned",
          title: "Te asignaron una clase particular",
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
    }
  }
}


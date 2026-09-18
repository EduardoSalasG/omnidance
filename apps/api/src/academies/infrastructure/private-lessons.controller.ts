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
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";

const LESSON_ACTIONS = ["confirm", "cancel", "done", "reschedule"] as const;
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
}

class PrivateLessonActionDto {
  @IsIn(LESSON_ACTIONS)
  action!: LessonAction;

  /** Requerido solo para action=reschedule. */
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
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
  ) {}

  /** Alumno solicita una clase privada con un instructor de la academia. */
  @Post("academies/:id/private-lessons")
  @UseGuards(SessionGuard)
  async request(
    @Param("id") id: string,
    @Body() dto: RequestPrivateLessonDto,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.loadContext(id);
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
        personId: req.person!.id,
        scheduledAt: new Date(dto.scheduledAt),
        price: dto.price ?? 0,
        commissionPct: 0,
        status: "REQUESTED",
      },
    });
  }

  /** Staff (owner/instructor/admin) lista las clases privadas de la academia. */
  @Get("academies/:id/private-lessons")
  @UseGuards(SessionGuard)
  async list(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireManage(id, req.person!);
    const lessons = await this.prisma.privateLesson.findMany({
      where: { academyId: id },
      orderBy: { scheduledAt: "asc" },
    });
    const people = await this.prisma.person.findMany({
      where: {
        id: {
          in: [...new Set(lessons.flatMap((l) => [l.personId, l.instructorId]))],
        },
      },
      select: { id: true, name: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return lessons.map((l) => ({
      ...l,
      person: byId.get(l.personId) ?? { id: l.personId, name: null },
      instructor: byId.get(l.instructorId) ?? { id: l.instructorId, name: null },
    }));
  }

  /** Mis clases privadas: como alumno (default) o como instructor. */
  @Get("private-lessons/mine")
  @UseGuards(SessionGuard)
  mine(@Query("as") asRole: string | undefined, @Req() req: Request) {
    const personId = req.person!.id;
    return this.prisma.privateLesson.findMany({
      where:
        asRole === "instructor" ? { instructorId: personId } : { personId },
      orderBy: { scheduledAt: "desc" },
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


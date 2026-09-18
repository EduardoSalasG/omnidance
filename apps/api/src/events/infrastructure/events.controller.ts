import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { Request } from "express";
import type { EventStatus, EventType, Prisma } from "@prisma/client";
import { EVENT_RECENT_LOOKBACK_MS } from "@omnidance/shared";
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import {
  RolesGuard,
  roleKeysHavePermission,
} from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";

// Valores del enum EventType del schema (no confundir con la spec: PRACTICA,
// no PRACTICE).
const EVENT_TYPES: EventType[] = [
  "SOCIAL",
  "PRACTICA",
  "GALA",
  "CONGRESS",
  "COMPETITION",
];
const STAFF_ROLES = ["DOOR", "DOOR_SALES"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];
const EDITABLE_STATUSES: EventStatus[] = ["DRAFT", "PUBLISHED"];
const CANCELLABLE_STATUSES: EventStatus[] = ["DRAFT", "PUBLISHED", "LIVE"];

class ScheduleBlockDto {
  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsOptional()
  @IsString()
  styleId?: string;

  @IsOptional()
  @IsString()
  djId?: string;
}

class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  venueId?: string;

  @IsOptional()
  @IsString()
  seriesId?: string;

  @IsOptional()
  @IsIn(EVENT_TYPES)
  type?: EventType;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsOptional()
  @IsInt()
  capacity?: number;

  @IsOptional()
  @IsInt()
  presalePrice?: number;

  @IsOptional()
  @IsInt()
  doorPrice?: number;

  @IsOptional()
  @IsInt()
  presaleCap?: number;

  @IsOptional()
  @IsInt()
  doorCap?: number;

  @IsOptional()
  @IsInt()
  primeThreshold?: number;

  @IsOptional()
  @IsInt()
  happyHourMinutes?: number;

  @IsOptional()
  @IsString()
  academyId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleBlockDto)
  scheduleBlocks?: ScheduleBlockDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  djIds?: string[];
}

/** Mismos campos del create menos type/producerId — todo opcional (PATCH). */
class UpdateEventDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  venueId?: string;

  @IsOptional()
  @IsString()
  seriesId?: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  capacity?: number;

  @IsOptional()
  @IsInt()
  presalePrice?: number;

  @IsOptional()
  @IsInt()
  doorPrice?: number;

  @IsOptional()
  @IsInt()
  presaleCap?: number;

  @IsOptional()
  @IsInt()
  doorCap?: number;

  @IsOptional()
  @IsInt()
  primeThreshold?: number;

  @IsOptional()
  @IsInt()
  happyHourMinutes?: number;

  @IsOptional()
  @IsString()
  academyId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleBlockDto)
  scheduleBlocks?: ScheduleBlockDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  djIds?: string[];
}

class AddStaffDto {
  @IsString()
  @IsNotEmpty()
  personId!: string;

  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;
}

@Controller("events")
export class EventsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Eventos del productor autenticado — todos los estados, para la consola.
   * Debe declararse antes de @Get(":id") para que "mine" no matchee :id.
   */
  @Get("mine")
  @UseGuards(SessionGuard, RolesGuard)
  @RequirePermissions("events.manage")
  mine(@Req() req: Request) {
    return this.prisma.event.findMany({
      where: { producerId: req.person!.id },
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        presalePrice: true,
        doorPrice: true,
        series: { select: { id: true, name: true } },
        venue: { select: { name: true, address: true } },
      },
    });
  }

  @Get()
  list() {
    return this.prisma.event.findMany({
      where: {
        status: { in: ["PUBLISHED", "LIVE"] },
        startsAt: { gte: new Date(Date.now() - EVENT_RECENT_LOOKBACK_MS) },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        presalePrice: true,
        doorPrice: true,
        series: { select: { id: true, name: true } },
        venue: { select: { name: true, address: true } },
      },
    });
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        presalePrice: true,
        doorPrice: true,
        presaleCap: true,
        doorCap: true,
        primeThreshold: true,
        happyHourMinutes: true,
        producerId: true,
        venueId: true,
        academyId: true,
        series: { select: { id: true, name: true } },
        venue: { select: { name: true, address: true, capacity: true } },
        djs: {
          select: {
            slotNote: true,
            person: { select: { id: true, name: true, photoUrl: true } },
          },
        },
        scheduleBlocks: {
          orderBy: { startsAt: "asc" },
          select: {
            startsAt: true,
            endsAt: true,
            djId: true,
            style: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!event) throw new NotFoundException();
    return event;
  }

  /**
   * Crea un evento DRAFT del productor autenticado (permiso events.manage).
   * Si viene seriesId, la serie debe existir y ser del mismo productor.
   * ScheduleBlocks y EventDjs se crean anidados (misma transacción implícita).
   */
  @Post()
  @UseGuards(SessionGuard, RolesGuard)
  @RequirePermissions("events.manage")
  async create(@Body() dto: CreateEventDto, @Req() req: Request) {
    const me = req.person!;
    if (dto.seriesId) {
      await this.assertOwnSeries(dto.seriesId, me.id);
    }
    const djIds = [...new Set(dto.djIds ?? [])];
    return this.prisma.event.create({
      data: {
        name: dto.name,
        venueId: dto.venueId ?? null,
        seriesId: dto.seriesId ?? null,
        academyId: dto.academyId ?? null,
        type: dto.type ?? "SOCIAL",
        status: "DRAFT",
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        capacity: dto.capacity ?? null,
        presalePrice: dto.presalePrice ?? null,
        doorPrice: dto.doorPrice ?? null,
        presaleCap: dto.presaleCap ?? null,
        doorCap: dto.doorCap ?? null,
        primeThreshold: dto.primeThreshold ?? null,
        ...(dto.happyHourMinutes !== undefined
          ? { happyHourMinutes: dto.happyHourMinutes }
          : {}),
        producerId: me.id,
        scheduleBlocks: dto.scheduleBlocks?.length
          ? {
              create: dto.scheduleBlocks.map((b) => ({
                startsAt: new Date(b.startsAt),
                endsAt: new Date(b.endsAt),
                styleId: b.styleId ?? null,
                djId: b.djId ?? null,
              })),
            }
          : undefined,
        djs: djIds.length
          ? { create: djIds.map((personId) => ({ personId })) }
          : undefined,
      },
    });
  }

  /**
   * Edición del evento: owner (producerId) o admin.access. Solo en
   * DRAFT/PUBLISHED. scheduleBlocks/djIds, si vienen, REEMPLAZAN los actuales
   * (deleteMany + createMany en la misma transacción que el update).
   */
  @Patch(":id")
  @UseGuards(SessionGuard)
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: Request,
  ) {
    const me = req.person!;
    const event = await this.findEventOr404(id);
    await this.requireOwnerOrAdmin(event.producerId, me);
    if (!EDITABLE_STATUSES.includes(event.status)) {
      throw new ConflictException(
        "solo editable en estado DRAFT o PUBLISHED",
      );
    }
    if (dto.seriesId) {
      await this.assertOwnSeries(dto.seriesId, me.id);
    }

    const data: Prisma.EventUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.venueId !== undefined) data.venueId = dto.venueId;
    if (dto.seriesId !== undefined) data.seriesId = dto.seriesId;
    if (dto.academyId !== undefined) data.academyId = dto.academyId;
    if (dto.startsAt !== undefined) data.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) data.endsAt = new Date(dto.endsAt);
    if (dto.capacity !== undefined) data.capacity = dto.capacity;
    if (dto.presalePrice !== undefined) data.presalePrice = dto.presalePrice;
    if (dto.doorPrice !== undefined) data.doorPrice = dto.doorPrice;
    if (dto.presaleCap !== undefined) data.presaleCap = dto.presaleCap;
    if (dto.doorCap !== undefined) data.doorCap = dto.doorCap;
    if (dto.primeThreshold !== undefined)
      data.primeThreshold = dto.primeThreshold;
    if (dto.happyHourMinutes !== undefined)
      data.happyHourMinutes = dto.happyHourMinutes;

    return this.prisma.$transaction(async (tx) => {
      if (dto.scheduleBlocks !== undefined) {
        await tx.scheduleBlock.deleteMany({ where: { eventId: id } });
        if (dto.scheduleBlocks.length) {
          await tx.scheduleBlock.createMany({
            data: dto.scheduleBlocks.map((b) => ({
              eventId: id,
              startsAt: new Date(b.startsAt),
              endsAt: new Date(b.endsAt),
              styleId: b.styleId ?? null,
              djId: b.djId ?? null,
            })),
          });
        }
      }
      if (dto.djIds !== undefined) {
        await tx.eventDj.deleteMany({ where: { eventId: id } });
        const djIds = [...new Set(dto.djIds)];
        if (djIds.length) {
          await tx.eventDj.createMany({
            data: djIds.map((personId) => ({ eventId: id, personId })),
          });
        }
      }
      return tx.event.update({ where: { id }, data });
    });
  }

  /** Publica el evento: owner o admin; solo desde DRAFT. */
  @Post(":id/publish")
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async publish(@Param("id") id: string, @Req() req: Request) {
    const event = await this.findEventOr404(id);
    await this.requireOwnerOrAdmin(event.producerId, req.person!);
    if (event.status !== "DRAFT") {
      throw new ConflictException("solo se puede publicar desde DRAFT");
    }
    return this.prisma.event.update({
      where: { id },
      data: { status: "PUBLISHED" },
    });
  }

  /** Cancela el evento: owner o admin; desde DRAFT/PUBLISHED/LIVE. */
  @Post(":id/cancel")
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async cancel(@Param("id") id: string, @Req() req: Request) {
    const event = await this.findEventOr404(id);
    await this.requireOwnerOrAdmin(event.producerId, req.person!);
    if (!CANCELLABLE_STATUSES.includes(event.status)) {
      throw new ConflictException(
        "solo se puede cancelar desde DRAFT, PUBLISHED o LIVE",
      );
    }
    return this.prisma.event.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  }

  /**
   * Asigna staff al evento: owner o admin. Upsert por (eventId, personId) —
   * reenviar actualiza el rol sin duplicar la asignación.
   */
  @Post(":id/staff")
  @UseGuards(SessionGuard)
  async addStaff(
    @Param("id") id: string,
    @Body() dto: AddStaffDto,
    @Req() req: Request,
  ) {
    const event = await this.findEventOr404(id);
    await this.requireOwnerOrAdmin(event.producerId, req.person!);
    const person = await this.prisma.person.findUnique({
      where: { id: dto.personId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException("persona no encontrada");
    return this.prisma.staffAssignment.upsert({
      where: { eventId_personId: { eventId: id, personId: dto.personId } },
      create: {
        eventId: id,
        personId: dto.personId,
        role: dto.role ?? "DOOR",
      },
      update: { role: dto.role ?? "DOOR" },
    });
  }

  /**
   * Staff del evento: owner, admin o staff asignado. StaffAssignment.personId
   * es FK plana (sin relación en schema) — join manual a Person.
   */
  @Get(":id/staff")
  @UseGuards(SessionGuard)
  async listStaff(@Param("id") id: string, @Req() req: Request) {
    const me = req.person!;
    const event = await this.findEventOr404(id);
    const isOwner = event.producerId === me.id;
    const isAdmin = await roleKeysHavePermission(this.prisma, me.roles, [
      "admin.access",
    ]);
    const isStaff = await this.prisma.staffAssignment.findUnique({
      where: { eventId_personId: { eventId: id, personId: me.id } },
      select: { id: true },
    });
    if (!isOwner && !isAdmin && !isStaff) {
      throw new ForbiddenException(
        "solo el productor, un admin o el staff del evento",
      );
    }
    const rows = await this.prisma.staffAssignment.findMany({
      where: { eventId: id },
      orderBy: { createdAt: "asc" },
    });
    const people = await this.prisma.person.findMany({
      where: { id: { in: rows.map((r) => r.personId) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      person: byId.get(r.personId) ?? {
        id: r.personId,
        name: null,
        email: null,
      },
    }));
  }

  private async findEventOr404(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException("evento no encontrado");
    return event;
  }

  /** owner (event.producerId === caller) o admin.access — nunca roles literales. */
  private async requireOwnerOrAdmin(
    producerId: string | null,
    person: { id: string; roles: string[] },
  ): Promise<void> {
    if (producerId === person.id) return;
    if (
      await roleKeysHavePermission(this.prisma, person.roles, ["admin.access"])
    ) {
      return;
    }
    throw new ForbiddenException("solo el productor del evento o un admin");
  }

  private async assertOwnSeries(
    seriesId: string,
    producerId: string,
  ): Promise<void> {
    const series = await this.prisma.eventSeries.findUnique({
      where: { id: seriesId },
    });
    if (!series) throw new NotFoundException("serie no encontrada");
    if (series.producerId !== producerId) {
      throw new ForbiddenException("la serie pertenece a otro productor");
    }
  }
}

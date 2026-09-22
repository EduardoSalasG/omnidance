import {
  BadRequestException,
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
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { Request } from "express";
import type { EventStatus, EventType, Genre, Prisma } from "@prisma/client";
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

  /**
   * Override admin del cargo por servicio de preventa (null → default del
   * productor → param global). Solo seteable por admin.access.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  serviceFeeClp?: number | null;

  /** Override admin del fee de venta en puerta por app. */
  @IsOptional()
  @IsInt()
  @Min(0)
  doorAppFeeClp?: number | null;

  /** Override admin del fee de registro en efectivo en puerta. */
  @IsOptional()
  @IsInt()
  @Min(0)
  doorCashFeeClp?: number | null;

  /** Override admin del % comisión plataforma (0–100). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  platformFeePct?: number | null;

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

  /** Override admin del cargo por servicio — null limpia el override. */
  @IsOptional()
  @IsInt()
  @Min(0)
  serviceFeeClp?: number | null;

  /** Override admin del fee de puerta app — null limpia el override. */
  @IsOptional()
  @IsInt()
  @Min(0)
  doorAppFeeClp?: number | null;

  /** Override admin del fee de puerta efectivo — null limpia el override. */
  @IsOptional()
  @IsInt()
  @Min(0)
  doorCashFeeClp?: number | null;

  /** Override admin del % comisión plataforma — null limpia el override. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  platformFeePct?: number | null;

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
  async mine(@Req() req: Request) {
    const events = await this.prisma.event.findMany({
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
    const ids = events.map((e) => e.id);
    if (!ids.length) return [];

    // Pulso comercial por evento (spec §13 Productor: ventas y
    // ocupación en la consola) — 3 groupBy sobre los ids, no N×queries.
    const [soldBy, grossBy, checkinsBy] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ["eventId"],
        where: { eventId: { in: ids }, status: { in: ["ACTIVE", "USED"] } },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ["eventId"],
        where: {
          eventId: { in: ids },
          orderType: "TICKET",
          status: "PAID",
        },
        _sum: { amount: true },
      }),
      this.prisma.checkin.groupBy({
        by: ["eventId"],
        where: { eventId: { in: ids }, voidedAt: null },
        _count: { _all: true },
      }),
    ]);
    const sold = new Map(soldBy.map((r) => [r.eventId, r._count._all]));
    const gross = new Map(grossBy.map((r) => [r.eventId, r._sum.amount ?? 0]));
    const checkins = new Map(
      checkinsBy.map((r) => [r.eventId, r._count._all]),
    );

    return events.map((e) => ({
      ...e,
      stats: {
        sold: sold.get(e.id) ?? 0,
        grossClp: gross.get(e.id) ?? 0,
        checkins: checkins.get(e.id) ?? 0,
      },
    }));
  }

  /**
   * GET /events/:id/live — tablero en vivo del productor: ventas por
   * canal, check-ins (total, última hora, histograma por hora) y
   * ocupación vs aforo. Owner del evento o admin. El Prime Time y el
   * leaderboard ya son endpoints públicos por evento — el front los
   * compone; acá solo van los datos operativos privados.
   */
  @Get(":id/live")
  @UseGuards(SessionGuard)
  async live(@Param("id") id: string, @Req() req: Request) {
    const me = req.person!;
    const event = await this.findEventOr404(id);
    await this.requireOwnerOrAdmin(event.producerId, me);

    const [payments, checkins, passCount] = await Promise.all([
      this.prisma.payment.findMany({
        where: { eventId: id, orderType: "TICKET", status: "PAID" },
        select: { channel: true, quantity: true, amount: true },
      }),
      this.prisma.checkin.findMany({
        where: { eventId: id, voidedAt: null },
        select: { inAt: true, method: true },
      }),
      this.prisma.entryPass.count({
        where: { eventId: id, status: { not: "CANCELLED" } },
      }),
    ]);

    const presale = { count: 0, amount: 0 };
    const door = { count: 0, amount: 0 };
    for (const p of payments) {
      const bucket = p.channel === "DOOR" ? door : presale;
      bucket.count += p.quantity;
      bucket.amount += p.amount;
    }
    // Ventas manuales de puerta (staff Checkin MANUAL sin Payment).
    const doorManual = checkins.filter((c) => c.method === "MANUAL").length;

    const byHour = new Array<number>(24).fill(0);
    let lastHour = 0;
    const hourAgo = Date.now() - 60 * 60 * 1000;
    for (const c of checkins) {
      byHour[c.inAt.getHours()] += 1;
      if (c.inAt.getTime() >= hourAgo) lastHour += 1;
    }

    return {
      eventId: event.id,
      status: event.status,
      sales: {
        presale,
        door: { ...door, manual: doorManual },
        total: {
          count: presale.count + door.count,
          amount: presale.amount + door.amount,
        },
      },
      checkins: {
        total: checkins.length,
        lastHour,
        byHour,
      },
      capacity: event.capacity,
      occupancy:
        event.capacity && event.capacity > 0
          ? Math.min(1, checkins.length / event.capacity)
          : null,
      passes: passCount,
    };
  }

  /**
   * Cartelera pública (PUBLISHED/LIVE, ventana reciente). Filtros por
   * query: `genre` (CSV de SALSA|BACHATA|CUBANO — propio del evento o
   * heredado de la serie, unión), `venue` (venueId) y `week=this`
   * (próximos 7 días).
   * El género expuesto en la respuesta es el resuelto: event.genres si
   * tiene, si no series.genres.
   */
  @Get()
  async list(
    @Query("genre") genre?: string,
    @Query("venue") venue?: string,
    @Query("week") week?: string,
  ) {
    const GENRES: Genre[] = ["SALSA", "BACHATA", "CUBANO"];
    // ?genre= acepta CSV (multiselect): "SALSA,BACHATA" → unión.
    const gs = genre
      ?.split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean) as Genre[] | undefined;
    if (gs?.some((g) => !GENRES.includes(g))) {
      throw new BadRequestException("genre inválido");
    }
    if (week && week !== "this") {
      throw new BadRequestException("week inválido");
    }

    const where: Prisma.EventWhereInput = {
      status: { in: ["PUBLISHED", "LIVE"] },
      startsAt: {
        gte: new Date(Date.now() - EVENT_RECENT_LOOKBACK_MS),
        ...(week === "this"
          ? { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
          : {}),
      },
      ...(venue ? { venueId: venue } : {}),
      ...(gs?.length
        ? {
            OR: [
              { genres: { hasSome: gs } },
              {
                genres: { isEmpty: true },
                series: { genres: { hasSome: gs } },
              },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.event.findMany({
      where,
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
        genres: true,
        genreMix: true,
        serviceFeeClp: true,
        doorAppFeeClp: true,
        doorCashFeeClp: true,
        platformFeePct: true,
        series: { select: { id: true, name: true, genres: true, genreMix: true } },
        venue: { select: { id: true, name: true, address: true, lat: true, lng: true } },
      },
    });

    // genreMix resuelto igual que genres: el evento manda; si no, hereda
    // el ciclo de la serie. null → el card no muestra barra de mezcla.
    return rows.map(({ series, genres, genreMix, ...e }) => ({
      ...e,
      genres: genres.length > 0 ? genres : (series?.genres ?? []),
      genreMix: genreMix ?? series?.genreMix ?? null,
      series: series ? { id: series.id, name: series.name } : null,
    }));
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
        serviceFeeClp: true,
        doorAppFeeClp: true,
        doorCashFeeClp: true,
        platformFeePct: true,
        primeThreshold: true,
        happyHourMinutes: true,
        producerId: true,
        venueId: true,
        venueText: true,
        womenOnly: true,
        academyId: true,
        genres: true,
        genreMix: true,
        program: true,
        series: {
          select: {
            id: true,
            name: true,
            genres: true,
            genreMix: true,
            program: true,
          },
        },
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
        shows: {
          orderBy: { order: "asc" },
          select: { academy: true, teamType: true, name: true },
        },
        _count: { select: { rsvps: true } },
      },
    });
    if (!event) throw new NotFoundException();
    const { _count, ...rest } = event;
    return { ...rest, rsvpCount: _count.rsvps };
  }

  /**
   * GET /events/:id/friends-going — amigos confirmados (ACCEPTED) del
   * solicitante con ticket ACTIVE para el evento. Prueba social en el
   * detalle: separado del detail público para no exponer relaciones a
   * anónimos. Dedup por persona (puede tener varios tickets).
   */
  @Get(":id/friends-going")
  @UseGuards(SessionGuard)
  async friendsGoing(@Param("id") id: string, @Req() req: Request) {
    const me = req.person!.id;
    const friendships = await this.prisma.friendship.findMany({
      where: { OR: [{ aId: me }, { bId: me }], status: "ACCEPTED" },
      select: { aId: true, bId: true },
    });
    const friendIds = friendships.map((f) => (f.aId === me ? f.bId : f.aId));
    if (friendIds.length === 0) return [];

    const tickets = await this.prisma.ticket.findMany({
      where: { eventId: id, ownerId: { in: friendIds }, status: "ACTIVE" },
      select: { ownerId: true },
      distinct: ["ownerId"],
    });
    if (tickets.length === 0) return [];

    return this.prisma.person.findMany({
      where: { id: { in: tickets.map((t) => t.ownerId) } },
      select: { id: true, name: true, photoUrl: true },
      orderBy: { name: "asc" },
    });
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
    if (
      dto.serviceFeeClp !== undefined ||
      dto.doorAppFeeClp !== undefined ||
      dto.doorCashFeeClp !== undefined ||
      dto.platformFeePct !== undefined
    ) {
      await this.assertAdminFeeOverride(me);
    }
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
        serviceFeeClp: dto.serviceFeeClp ?? null,
        doorAppFeeClp: dto.doorAppFeeClp ?? null,
        doorCashFeeClp: dto.doorCashFeeClp ?? null,
        platformFeePct: dto.platformFeePct ?? null,
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
    if (dto.serviceFeeClp !== undefined) {
      // campo operativo (no contenido): solo admin.access lo fija/limpia.
      await this.assertAdminFeeOverride(me);
      data.serviceFeeClp = dto.serviceFeeClp;
    }
    if (dto.doorAppFeeClp !== undefined) {
      await this.assertAdminFeeOverride(me);
      data.doorAppFeeClp = dto.doorAppFeeClp;
    }
    if (dto.doorCashFeeClp !== undefined) {
      await this.assertAdminFeeOverride(me);
      data.doorCashFeeClp = dto.doorCashFeeClp;
    }
    if (dto.platformFeePct !== undefined) {
      await this.assertAdminFeeOverride(me);
      data.platformFeePct = dto.platformFeePct;
    }
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

  /**
   * serviceFeeClp es un campo operativo admin-only: cualquier actor que lo
   * envíe en POST/PATCH sin admin.access → 403 (aunque sea el owner).
   */
  private async assertAdminFeeOverride(person: {
    id: string;
    roles: string[];
  }): Promise<void> {
    if (
      !(await roleKeysHavePermission(this.prisma, person.roles, [
        "admin.access",
      ]))
    ) {
      throw new ForbiddenException(
        "solo admin puede fijar la comisión del evento",
      );
    }
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

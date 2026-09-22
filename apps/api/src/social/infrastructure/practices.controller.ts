import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { EVENT_RECENT_LOOKBACK_MS } from "@omnidance/shared";
import { PrismaService } from "../../prisma.service";
import {
  SocialDomainError,
  assertPracticeInput,
} from "../domain/social.service";

class CreatePracticeDto {
  @IsString()
  name!: string;

  /** Opcional (spec omni-dance.md §8): práctica sin local — parque/plaza. */
  @IsOptional()
  @IsString()
  venueId?: string;

  /** Nombre libre del lugar cuando no hay Venue ("Parque Bustamante"). */
  @IsOptional()
  @IsString()
  venueText?: string;

  /** Detalle del lugar: sala, piso, punto exacto ("Sala 1, piso 2"). */
  @IsOptional()
  @IsString()
  venueNotes?: string;

  /** Señal safety de la spec §8 — declarativa (Person no tiene género). */
  @IsOptional()
  @IsBoolean()
  womenOnly?: boolean;

  /** Simétrico a womenOnly — práctica solo hombres (p.ej. de líderes). */
  @IsOptional()
  @IsBoolean()
  menOnly?: boolean;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  /** id o nombre de Style — se materializa como ScheduleBlock del evento. */
  @IsOptional()
  @IsString()
  style?: string;

  /** Notas libres del host: qué traer, punto exacto de encuentro, etc. */
  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * Prácticas sociales (spec omni-dance.md §8): micro-eventos creados por
 * cualquier bailarín — Event type=PRACTICA, status=PUBLISHED, hostId=creador.
 */
@Controller("practices")
export class PracticesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @UseGuards(SessionGuard)
  async create(@Body() dto: CreatePracticeDto, @Req() req: Request) {
    const hostId = req.person!.id;
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    try {
      assertPracticeInput({
        name: dto.name,
        startsAt,
        endsAt,
        capacity: dto.capacity ?? null,
      });
    } catch (e) {
      if (e instanceof SocialDomainError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    // venueId opcional: si viene, debe existir; si no, la práctica queda
    // sin local (parque/plaza) → Event.venueId = null.
    if (dto.venueId) {
      const venue = await this.prisma.venue.findUnique({
        where: { id: dto.venueId },
        select: { id: true },
      });
      if (!venue) throw new NotFoundException("venue no encontrado");
    }

    // style: id directo o match por nombre → ScheduleBlock con el estilo foco
    let styleId: string | null = null;
    if (dto.style) {
      const style =
        (await this.prisma.style.findUnique({ where: { id: dto.style } })) ??
        (await this.prisma.style.findFirst({ where: { name: dto.style } }));
      if (!style) throw new BadRequestException("style no encontrado");
      styleId = style.id;
    }

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          type: "PRACTICA",
          status: "PUBLISHED",
          hostId,
          venueId: dto.venueId ?? null,
          venueText: dto.venueText?.trim() || null,
          venueNotes: dto.venueNotes?.trim() || null,
          womenOnly: dto.womenOnly ?? false,
          menOnly: dto.menOnly ?? false,
          name: dto.name,
          description: dto.description?.trim() || null,
          startsAt,
          endsAt,
          capacity: dto.capacity ?? null,
        },
      });
      if (styleId) {
        await tx.scheduleBlock.create({
          data: { eventId: event.id, startsAt, endsAt, styleId },
        });
      }
      return event;
    });
  }

  /** Shape público compartido entre el listado general y "mis prácticas". */
  private async mapPractices(
    practices: {
      hostId: string | null;
      scheduleBlocks: { style: { id: string; name: string } | null }[];
      _count: { rsvps: number };
      [k: string]: unknown;
    }[],
  ) {
    // Event.hostId es escalar → join manual del nombre del host.
    const hosts = await this.prisma.person.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              practices
                .map((p) => p.hostId)
                .filter((id): id is string => id != null),
            ),
          ],
        },
      },
      select: { id: true, name: true },
    });
    const hostById = new Map(hosts.map((h) => [h.id, h.name]));

    return practices.map(({ scheduleBlocks, _count, ...p }) => ({
      ...p,
      style: scheduleBlocks[0]?.style ?? null,
      rsvpCount: _count.rsvps,
      host: p.hostId ? { id: p.hostId, name: hostById.get(p.hostId) ?? null } : null,
    }));
  }

  /** Prácticas publicadas próximas — mismo shape público que GET /events + host. */
  @Get()
  async list() {
    const practices = await this.prisma.event.findMany({
      where: {
        type: "PRACTICA",
        status: { in: ["PUBLISHED", "LIVE"] },
        startsAt: { gte: new Date(Date.now() - EVENT_RECENT_LOOKBACK_MS) },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        hostId: true,
        capacity: true,
        startsAt: true,
        endsAt: true,
        presalePrice: true,
        doorPrice: true,
        series: { select: { name: true } },
        venue: { select: { name: true, address: true } },
        venueText: true,
        womenOnly: true,
        menOnly: true,
        _count: { select: { rsvps: true } },
        // Estilo foco: la práctica lo materializa como ScheduleBlock único.
        scheduleBlocks: {
          orderBy: { startsAt: "asc" as const },
          take: 1,
          select: { style: { select: { id: true, name: true } } },
        },
      },
    });
    return this.mapPractices(practices);
  }

  /**
   * GET /practices/mine — las que organizo + las que voy (RSVP).
   * Mismo shape del listado + `going` (mi RSVP existe). Debe declararse
   * antes que @Get(":id/rsvp") para que "mine" no matchee :id/rsvp.
   */
  @Get("mine")
  @UseGuards(SessionGuard)
  async mine(@Req() req: Request) {
    const me = req.person!.id;
    const practices = await this.prisma.event.findMany({
      where: {
        type: "PRACTICA",
        status: { in: ["PUBLISHED", "LIVE"] },
        startsAt: { gte: new Date(Date.now() - EVENT_RECENT_LOOKBACK_MS) },
        OR: [{ hostId: me }, { rsvps: { some: { personId: me } } }],
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        hostId: true,
        capacity: true,
        startsAt: true,
        endsAt: true,
        presalePrice: true,
        doorPrice: true,
        series: { select: { name: true } },
        venue: { select: { name: true, address: true } },
        venueText: true,
        womenOnly: true,
        menOnly: true,
        _count: { select: { rsvps: true } },
        scheduleBlocks: {
          orderBy: { startsAt: "asc" as const },
          take: 1,
          select: { style: { select: { id: true, name: true } } },
        },
        // Mi RSVP — solo necesito saber si existe.
        rsvps: { where: { personId: me }, select: { id: true } },
      },
    });
    return (await this.mapPractices(practices)).map((p) => {
      const { rsvps, ...rest } = p as typeof p & { rsvps: unknown[] };
      return { ...rest, going: rsvps.length > 0 };
    });
  }

  /**
   * GET /practices/:id/rsvp — estado propio + conteo público.
   * SessionGuard: el "voy" es personal; el conteo público sale en el listado.
   */
  @Get(":id/rsvp")
  @UseGuards(SessionGuard)
  async myRsvp(@Param("id") id: string, @Req() req: Request) {
    const practice = await this.prisma.event.findUnique({
      where: { id },
      select: { id: true, type: true },
    });
    if (!practice || practice.type !== "PRACTICA") {
      throw new NotFoundException("Práctica no encontrada");
    }
    const [mine, count] = await Promise.all([
      this.prisma.rsvp.findUnique({
        where: {
          eventId_personId: { eventId: id, personId: req.person!.id },
        },
        select: { id: true },
      }),
      this.prisma.rsvp.count({ where: { eventId: id } }),
    ]);
    return { going: !!mine, count };
  }

  /** POST /practices/:id/rsvp — body {going} marca o quita el "voy". */
  @Post(":id/rsvp")
  @HttpCode(200) // toggle, no creación — el 201 de Nest no aplica
  @UseGuards(SessionGuard)
  async rsvp(
    @Param("id") id: string,
    @Body() dto: { going?: boolean },
    @Req() req: Request,
  ) {
    const practice = await this.prisma.event.findUnique({
      where: { id },
      select: { id: true, type: true, endsAt: true, status: true },
    });
    if (!practice || practice.type !== "PRACTICA") {
      throw new NotFoundException("Práctica no encontrada");
    }
    if (practice.status === "CANCELLED" || new Date() >= practice.endsAt) {
      throw new BadRequestException("La práctica ya terminó");
    }
    const personId = req.person!.id;
    if (dto.going) {
      await this.prisma.rsvp.upsert({
        where: { eventId_personId: { eventId: id, personId } },
        create: { eventId: id, personId },
        update: {},
      });
    } else {
      await this.prisma.rsvp
        .delete({ where: { eventId_personId: { eventId: id, personId } } })
        .catch(() => {}); // idempotente — quitar un "voy" inexistente no falla
    }
    const count = await this.prisma.rsvp.count({ where: { eventId: id } });
    return { going: !!dto.going, count };
  }
}

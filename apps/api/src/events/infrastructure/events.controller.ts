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
  Res,
  StreamableFile,
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
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { Request, Response } from "express";
import type { EventStatus, EventType, Genre, Prisma } from "@prisma/client";
import { EVENT_RECENT_LOOKBACK_MS } from "@omnidance/shared";
import { PrismaService } from "../../prisma.service";
import { ParamsService } from "../../params/params.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import {
  RolesGuard,
  roleKeysHavePermission,
} from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { pageParams } from "../../academies/infrastructure/list-filters";
import { buildTablePdf } from "../../common/pdf-report";
import { assertProducerPro } from "../../common/producer-pro";
import {
  assertDataset,
  DATASET_TITLES,
  datasetFilters,
  exportDataset,
  toCsv,
} from "../../query/producer-export";
import { fmtCl } from "../../query/entities/helpers";
import {
  PRESALE_CUTOFF_MAX_MINUTES,
  presaleCutoffDate,
  resolvePresaleCutoffMinutes,
} from "../../common/presale-cutoff";
import {ApiProperty, ApiPropertyOptional, ApiQuery } from "@nestjs/swagger";

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
const MINE_EVENT_STATUSES: EventStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "LIVE",
  "CLOSED",
  "CANCELLED",
];

/**
 * Filtros de lista de `GET /events/mine` - mismo contrato que la barra de
 * filtros compartida (spec analytics/query-console): q (nombre),
 * status/type enum (whitelist → 400), from/to sobre `startsAt`
 * (ISO8601 → 400). Opcionales y aditivos; desconocidos ignorados por el
 * ValidationPipe global (whitelist: true).
 */
class MineEventsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiPropertyOptional()
  q?: string;

  @IsOptional()
  @IsIn(MINE_EVENT_STATUSES)
  @ApiPropertyOptional()
  status?: EventStatus;

  @IsOptional()
  @IsIn(EVENT_TYPES)
  @ApiPropertyOptional()
  type?: EventType;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  from?: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  to?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  page?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  pageSize?: string;
}

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

  /**
   * Mesas reservables de la noche. Ausente = hereda el default del
   * productor; null explícito = este evento no ofrece mesas.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  tablesTotal?: number | null;

  /** Máx. personas por reserva de mesa; ausente = default del productor. */
  @IsOptional()
  @IsInt()
  @Min(1)
  tableSeatMax?: number;

  /** Cupo sentable total en mesas (≤ capacity); ausente = default del productor. */
  @IsOptional()
  @IsInt()
  @Min(0)
  tableSeatsTotal?: number;

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
   * Corte de la preventa en minutos desde medianoche del día del evento
   * (ej. 1425 = 23:45; >1439 = post-medianoche). null/vacío → default del
   * productor → param global presale.cutoff_hour.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PRESALE_CUTOFF_MAX_MINUTES)
  presaleCutoffMinutes?: number | null;

  /**
   * Override admin de la comisión todo incluido (0–100, spec
   * producer-fee-model). El comprador siempre paga el precio publicado
   * exacto - esta tasa se descuenta de la liquidación del productor.
   */
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

/** Mismos campos del create menos type/producerId - todo opcional (PATCH). */
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

  /** Mesas reservables - null apaga el servicio de mesas. */
  @IsOptional()
  @IsInt()
  @Min(0)
  tablesTotal?: number | null;

  /** Máx. personas por reserva - null vuelve al default del productor. */
  @IsOptional()
  @IsInt()
  @Min(1)
  tableSeatMax?: number | null;

  /** Cupo sentable total - null vuelve al default del productor. */
  @IsOptional()
  @IsInt()
  @Min(0)
  tableSeatsTotal?: number | null;

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

  /** Corte de la preventa (minutos del día del evento) - null hereda. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PRESALE_CUTOFF_MAX_MINUTES)
  presaleCutoffMinutes?: number | null;

  /** Override admin de la comisión todo incluido - null limpia el override. */
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

/**
 * Filtros opcionales de los exports (spec events/producer-export delta):
 * comparten la whitelist del motor de consultas (QUERY_CATALOG.PRODUCER) -
 * from/to sobre el campo temporal del dataset + enums por dataset
 * (sales: status/channel; checkins: method/voided; guestlist: status/listId).
 * Inválido → 400 vía datasetFilters; desconocido → ignorado (el DTO no lo
 * declara).
 */
class EventExportDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  dataset!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  from?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  to?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  status?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  channel?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  method?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  voided?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  listId?: string;
}

@Controller("events")
export class EventsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
  ) {}

  /**
   * Eventos del productor autenticado - todos los estados, para la consola.
   * Debe declararse antes de @Get(":id") para que "mine" no matchee :id.
   * Filtros opcionales del contrato compartido (q sobre nombre, status/type
   * enum, from/to sobre startsAt); sin params = comportamiento anterior.
   */
  @Get("mine")
  @UseGuards(SessionGuard, RolesGuard)
  @RequirePermissions("events.manage")
  async mine(@Req() req: Request, @Query() dto: MineEventsQueryDto) {
    const q = dto.q?.trim();
    const pg = pageParams(dto.page, dto.pageSize);
    const where: Prisma.EventWhereInput = {
      producerId: req.person!.id,
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.from || dto.to
        ? {
            startsAt: {
              ...(dto.from ? { gte: new Date(dto.from) } : {}),
              ...(dto.to ? { lte: new Date(dto.to) } : {}),
            },
          }
        : {}),
    };
    // Paginación del contrato compartido: filtros primero, corte después;
    // el total cubre el universo filtrado.
    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startsAt: "desc" },
        skip: pg.skip,
        take: pg.take,
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
      }),
      this.prisma.event.count({ where }),
    ]);
    const ids = events.map((e) => e.id);
    if (!ids.length) {
      return { items: [], total, page: pg.page, pageSize: pg.pageSize };
    }

    // Pulso comercial por evento (spec §13 Productor: ventas y
    // ocupación en la consola) - 3 groupBy sobre los ids de la página,
    // no N×queries.
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

    return {
      items: events.map((e) => ({
        ...e,
        stats: {
          sold: sold.get(e.id) ?? 0,
          grossClp: gross.get(e.id) ?? 0,
          checkins: checkins.get(e.id) ?? 0,
        },
      })),
      total,
      page: pg.page,
      pageSize: pg.pageSize,
    };
  }

  /**
   * GET /events/:id/live - tablero en vivo del productor: ventas por
   * canal, check-ins (total, última hora, histograma por hora) y
   * ocupación vs aforo. Owner del evento o admin. El Prime Time y el
   * leaderboard ya son endpoints públicos por evento - el front los
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
   * GET /events/:id/export.csv?dataset=sales|checkins|guestlist -
   * descarga CSV operativa del evento (cuadratura post-evento en
   * planilla). Owner o admin - mismo patrón que /live. BOM UTF-8 para
   * Excel es-CL; nunca expone claimToken ni ids internos de persona.
   * Filtros opcionales del catálogo (from/to/status/channel/method/
   * voided/listId) - inválido → 400, desconocido → ignorado.
   */
  @Get(":id/export.csv")
  @UseGuards(SessionGuard)
  async exportCsv(
    @Param("id") id: string,
    @Query() dto: EventExportDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const event = await this.findEventOr404(id);
    await this.requireOwnerOrAdmin(event.producerId, req.person!);
    await this.requireProSelf(event.producerId, req.person!);
    assertDataset(dto.dataset);

    const filters = datasetFilters(dto.dataset, dto);
    const table = await exportDataset(this.prisma, dto.dataset, id, undefined, filters);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${id}-${dto.dataset}.csv"`,
    );
    return toCsv(table.headers, table.rows);
  }

  /**
   * GET /events/:id/export.pdf?dataset=sales|checkins|guestlist - misma
   * tabla que el CSV pero como reporte imprimible (título, fecha,
   * resumen con totales). Owner o admin. Acepta los mismos filtros.
   */
  @Get(":id/export.pdf")
  @UseGuards(SessionGuard)
  async exportPdf(
    @Param("id") id: string,
    @Query() dto: EventExportDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const event = await this.findEventOr404(id);
    await this.requireOwnerOrAdmin(event.producerId, req.person!);
    await this.requireProSelf(event.producerId, req.person!);
    assertDataset(dto.dataset);

    const filters = datasetFilters(dto.dataset, dto);
    const table = await exportDataset(this.prisma, dto.dataset, id, undefined, filters);
    const pdf = await buildTablePdf({
      title: `${DATASET_TITLES[dto.dataset]} - ${event.name}`,
      subtitle: `${fmtCl(event.startsAt)} · generado ${fmtCl(new Date())}`,
      summary: table.summary,
      headers: table.headers,
      rows: table.rows,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${id}-${dto.dataset}.pdf"`,
    );
    return new StreamableFile(pdf);
  }

  /**
   * GET /events/series/:seriesId/export.csv?dataset=sales|checkins|guestlist -
   * mismo CSV que el export por evento pero agregando todas las fechas de
   * la serie, con columna `evento` al inicio (nombre de la instancia).
   * Owner de la serie o admin. Acepta los mismos filtros opcionales.
   */
  @Get("series/:seriesId/export.csv")
  @UseGuards(SessionGuard)
  async exportSeriesCsv(
    @Param("seriesId") seriesId: string,
    @Query() dto: EventExportDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const series = await this.findSeriesOr404(seriesId);
    await this.requireOwnerOrAdmin(series.producerId, req.person!);
    await this.requireProSelf(series.producerId, req.person!);
    assertDataset(dto.dataset);

    const filters = datasetFilters(dto.dataset, dto);
    const { scope, labelByEvent } = await this.seriesScope(seriesId);
    const table = await exportDataset(this.prisma, dto.dataset, scope, labelByEvent, filters);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="serie-${seriesId}-${dto.dataset}.csv"`,
    );
    return toCsv(table.headers, table.rows);
  }

  /**
   * GET /events/series/:seriesId/export.pdf?dataset=sales|checkins|guestlist -
   * reporte PDF agregado de todas las fechas de la serie (columna
   * `evento`). Owner de la serie o admin. Acepta los mismos filtros.
   */
  @Get("series/:seriesId/export.pdf")
  @UseGuards(SessionGuard)
  async exportSeriesPdf(
    @Param("seriesId") seriesId: string,
    @Query() dto: EventExportDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const series = await this.findSeriesOr404(seriesId);
    await this.requireOwnerOrAdmin(series.producerId, req.person!);
    await this.requireProSelf(series.producerId, req.person!);
    assertDataset(dto.dataset);

    const filters = datasetFilters(dto.dataset, dto);
    const { events, scope, labelByEvent } = await this.seriesScope(seriesId);
    const table = await exportDataset(this.prisma, dto.dataset, scope, labelByEvent, filters);
    const pdf = await buildTablePdf({
      title: `${DATASET_TITLES[dto.dataset]} - Serie «${series.name}»`,
      subtitle: `${events.length} fechas · generado ${fmtCl(new Date())}`,
      summary: table.summary,
      headers: table.headers,
      rows: table.rows,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="serie-${seriesId}-${dto.dataset}.pdf"`,
    );
    return new StreamableFile(pdf);
  }

  private async findSeriesOr404(seriesId: string) {
    const series = await this.prisma.eventSeries.findUnique({
      where: { id: seriesId },
    });
    if (!series) throw new NotFoundException("serie no encontrada");
    return series;
  }

  /** Eventos de la serie → scope `{in}` + etiqueta `nombre (YYYY-MM-DD)`. */
  private async seriesScope(seriesId: string) {
    const events = await this.prisma.event.findMany({
      where: { seriesId },
      select: { id: true, name: true, startsAt: true },
      orderBy: { startsAt: "asc" },
    });
    return {
      events,
      scope: { in: events.map((e) => e.id) },
      labelByEvent: new Map(
        events.map((e) => [
          e.id,
          `${e.name} (${e.startsAt.toISOString().slice(0, 10)})`,
        ]),
      ),
    };
  }

  /**
   * Cartelera pública (PUBLISHED/LIVE, ventana reciente). Filtros por
   * query: `genre` (CSV de SALSA|BACHATA|CUBANO - propio del evento o
   * heredado de la serie, unión), `venue` (venueId) y `week=this`
   * (próximos 7 días).
   * El género expuesto en la respuesta es el resuelto: event.genres si
   * tiene, si no series.genres.
   */
  @Get()
  @ApiQuery({ name: "genre", required: false })
  @ApiQuery({ name: "venue", required: false })
  @ApiQuery({ name: "week", required: false })
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
      // Las prácticas viven en /practices - no son cartelera pública.
      type: { not: "PRACTICA" },
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
        tablesTotal: true,
        tableSeatMax: true,
        tableSeatsTotal: true,
        presalePrice: true,
        doorPrice: true,
        presaleCap: true,
        doorCap: true,
        presaleCutoffMinutes: true,
        platformFeePct: true,
        primeThreshold: true,
        happyHourMinutes: true,
        producerId: true,
        hostId: true,
        venueId: true,
        venueText: true,
        venueNotes: true,
        description: true,
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
    // Event.hostId es escalar (sin relación) → join manual, como en /practices.
    const host = event.hostId
      ? await this.prisma.person.findUnique({
          where: { id: event.hostId },
          select: { id: true, name: true, photoUrl: true },
        })
      : null;
    // Disponibilidad de mesas referencial (spec checkout-table-reservation):
    // las activas (REQUESTED|CONFIRMED) ocupan cupo; null si el evento no
    // ofrece mesas. El cupo real es en PERSONAS sentables (seatsLeft), con
    // tablesLeft como lectura rápida de mesas libres. El productor confirma
    // - no es un cap duro.
    const tablesAgg =
      event.tablesTotal != null
        ? await this.prisma.tableReservation.aggregate({
            where: {
              eventId: id,
              status: { in: ["REQUESTED", "CONFIRMED"] },
            },
            _count: true,
            _sum: { partySize: true },
          })
        : null;
    const { _count, ...rest } = event;
    const tablesActive = tablesAgg?._count ?? 0;
    const seatsUsed = tablesAgg?._sum.partySize ?? 0;
    // Corte de preventa efectivo - misma cadena que
    // CheckoutService.purchaseTicket (evento → productor → global). El
    // checkout lo usa para estimar preventa vs puerta sin replicar la regla.
    const cutoffHour = await this.params.getNumber("presale.cutoff_hour", 19);
    const producerParams = await this.params.getProducerParams(
      event.producerId,
    );
    const presaleEndsAt = presaleCutoffDate(
      event.startsAt,
      resolvePresaleCutoffMinutes(event, producerParams, cutoffHour),
    );
    return {
      ...rest,
      host,
      presaleEndsAt,
      rsvpCount: _count.rsvps,
      tablesLeft:
        event.tablesTotal != null
          ? Math.max(0, event.tablesTotal - tablesActive)
          : null,
      seatsLeft:
        event.tableSeatsTotal != null
          ? Math.max(0, event.tableSeatsTotal - seatsUsed)
          : null,
    };
  }

  /**
   * GET /events/:id/friends-going - amigos confirmados (ACCEPTED) del
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
    if (dto.platformFeePct !== undefined) {
      await this.assertAdminFeeOverride(me);
    }
    if (dto.seriesId) {
      await this.assertOwnSeries(dto.seriesId, me.id);
    }
    // Mesas (spec checkout-table-reservation): cadena evento → default del
    // productor. `tablesTotal` ausente hereda el default; `null` explícito
    // apaga el servicio en este evento aunque haya default.
    const pd = await this.params.getProducerParams(me.id);
    const tablesTotal =
      dto.tablesTotal !== undefined
        ? dto.tablesTotal
        : (pd?.tablesTotal ?? null);
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
        tablesTotal,
        tableSeatMax:
          tablesTotal != null
            ? (dto.tableSeatMax ?? pd?.tableSeatMax ?? null)
            : null,
        tableSeatsTotal:
          tablesTotal != null
            ? (dto.tableSeatsTotal ?? pd?.tableSeatsTotal ?? null)
            : null,
        presalePrice: dto.presalePrice ?? null,
        doorPrice: dto.doorPrice ?? null,
        presaleCap: dto.presaleCap ?? null,
        doorCap: dto.doorCap ?? null,
        presaleCutoffMinutes: dto.presaleCutoffMinutes ?? null,
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
    // Mesas: `tablesTotal: null` apaga el servicio; un número lo activa con
    // overrides propios. Los límites null heredan el default del productor;
    // al activar sin enviarlos se heredan solo si el evento no tenía propios.
    const tablesTouched =
      dto.tablesTotal !== undefined ||
      dto.tableSeatMax !== undefined ||
      dto.tableSeatsTotal !== undefined;
    if (tablesTouched) {
      const pd = await this.params.getProducerParams(event.producerId);
      if (dto.tablesTotal !== undefined) data.tablesTotal = dto.tablesTotal;
      if (dto.tableSeatMax !== undefined) {
        data.tableSeatMax = dto.tableSeatMax ?? pd?.tableSeatMax ?? null;
      } else if (dto.tablesTotal != null && event.tableSeatMax == null) {
        data.tableSeatMax = pd?.tableSeatMax ?? null;
      }
      if (dto.tableSeatsTotal !== undefined) {
        data.tableSeatsTotal =
          dto.tableSeatsTotal ?? pd?.tableSeatsTotal ?? null;
      } else if (dto.tablesTotal != null && event.tableSeatsTotal == null) {
        data.tableSeatsTotal = pd?.tableSeatsTotal ?? null;
      }
    }
    if (dto.presalePrice !== undefined) data.presalePrice = dto.presalePrice;
    if (dto.doorPrice !== undefined) data.doorPrice = dto.doorPrice;
    if (dto.presaleCap !== undefined) data.presaleCap = dto.presaleCap;
    if (dto.doorCap !== undefined) data.doorCap = dto.doorCap;
    if (dto.presaleCutoffMinutes !== undefined) {
      data.presaleCutoffMinutes = dto.presaleCutoffMinutes;
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
   * Asigna staff al evento: owner o admin. Upsert por (eventId, personId) -
   * reenviar actualiza el rol sin duplicar la asignación. La gestión
   * multi-staff es feature Producer Pro (S5): el owner sin Pro vigente
   * recibe 403 `pro.required` (admin operando su evento no se gatea).
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
    await this.requireProSelf(event.producerId, req.person!);
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
   * es FK plana (sin relación en schema) - join manual a Person.
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

  /** owner (event.producerId === caller) o admin.access - nunca roles literales. */
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
   * Gating Producer Pro (S5): aplica solo cuando el caller ES el productor
   * dueño del recurso - un admin operando el evento de otro pasa sin gate
   * (soporte/plataforma), y un caller ajeno ya fue rechazado por
   * requireOwnerOrAdmin.
   */
  private async requireProSelf(
    producerId: string | null,
    person: { id: string },
  ): Promise<void> {
    if (producerId != null && producerId === person.id) {
      await assertProducerPro(this.prisma, producerId);
    }
  }

  /**
   * platformFeePct es un campo operativo admin-only: cualquier actor que lo
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

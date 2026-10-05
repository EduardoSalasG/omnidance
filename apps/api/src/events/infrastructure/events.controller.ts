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
import { buildTablePdf } from "../../common/pdf-report";
import { assertProducerPro } from "../../common/producer-pro";

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

  /** Mesas reservables — null apaga el servicio de mesas. */
  @IsOptional()
  @IsInt()
  @Min(0)
  tablesTotal?: number | null;

  /** Máx. personas por reserva — null vuelve al default del productor. */
  @IsOptional()
  @IsInt()
  @Min(1)
  tableSeatMax?: number | null;

  /** Cupo sentable total — null vuelve al default del productor. */
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

/** Celda CSV: quotea si contiene , " \n \r; comillas internas → "". */
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con BOM UTF-8 (Excel es-CL) + CRLF. */
function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  return String.fromCharCode(0xfeff) + lines.join("\r\n") + "\r\n";
}

/** Datasets exportables (CSV y PDF comparten la misma tabla). */
const EXPORT_DATASETS = ["sales", "checkins", "guestlist"] as const;
type ExportDataset = (typeof EXPORT_DATASETS)[number];
const DATASET_TITLES: Record<ExportDataset, string> = {
  sales: "Ventas",
  checkins: "Check-ins",
  guestlist: "Listas de invitados",
};
interface ExportTable {
  headers: string[];
  rows: unknown[][];
  /** Líneas de resumen que el PDF muestra sobre la tabla. */
  summary: string[];
}

function assertDataset(d: string): asserts d is ExportDataset {
  if (!EXPORT_DATASETS.includes(d as ExportDataset)) {
    throw new BadRequestException("dataset inválido");
  }
}

/** $ es-CL para resúmenes del PDF ($10.500). */
const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;

const fmtCl = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(d);

@Controller("events")
export class EventsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
  ) {}

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
   * GET /events/:id/export.csv?dataset=sales|checkins|guestlist —
   * descarga CSV operativa del evento (cuadratura post-evento en
   * planilla). Owner o admin — mismo patrón que /live. BOM UTF-8 para
   * Excel es-CL; nunca expone claimToken ni ids internos de persona.
   */
  @Get(":id/export.csv")
  @UseGuards(SessionGuard)
  async exportCsv(
    @Param("id") id: string,
    @Query("dataset") dataset: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const event = await this.findEventOr404(id);
    await this.requireOwnerOrAdmin(event.producerId, req.person!);
    await this.requireProSelf(event.producerId, req.person!);
    assertDataset(dataset);

    const table = await this.exportDataset(dataset, id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${id}-${dataset}.csv"`,
    );
    return toCsv(table.headers, table.rows);
  }

  /**
   * GET /events/:id/export.pdf?dataset=sales|checkins|guestlist — misma
   * tabla que el CSV pero como reporte imprimible (título, fecha,
   * resumen con totales). Owner o admin.
   */
  @Get(":id/export.pdf")
  @UseGuards(SessionGuard)
  async exportPdf(
    @Param("id") id: string,
    @Query("dataset") dataset: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const event = await this.findEventOr404(id);
    await this.requireOwnerOrAdmin(event.producerId, req.person!);
    await this.requireProSelf(event.producerId, req.person!);
    assertDataset(dataset);

    const table = await this.exportDataset(dataset, id);
    const pdf = await buildTablePdf({
      title: `${DATASET_TITLES[dataset]} — ${event.name}`,
      subtitle: `${fmtCl(event.startsAt)} · generado ${fmtCl(new Date())}`,
      summary: table.summary,
      headers: table.headers,
      rows: table.rows,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${id}-${dataset}.pdf"`,
    );
    return new StreamableFile(pdf);
  }

  /**
   * GET /events/series/:seriesId/export.csv?dataset=sales|checkins|guestlist —
   * mismo CSV que el export por evento pero agregando todas las fechas de
   * la serie, con columna `evento` al inicio (nombre de la instancia).
   * Owner de la serie o admin.
   */
  @Get("series/:seriesId/export.csv")
  @UseGuards(SessionGuard)
  async exportSeriesCsv(
    @Param("seriesId") seriesId: string,
    @Query("dataset") dataset: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const series = await this.findSeriesOr404(seriesId);
    await this.requireOwnerOrAdmin(series.producerId, req.person!);
    await this.requireProSelf(series.producerId, req.person!);
    assertDataset(dataset);

    const { scope, labelByEvent } = await this.seriesScope(seriesId);
    const table = await this.exportDataset(dataset, scope, labelByEvent);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="serie-${seriesId}-${dataset}.csv"`,
    );
    return toCsv(table.headers, table.rows);
  }

  /**
   * GET /events/series/:seriesId/export.pdf?dataset=sales|checkins|guestlist —
   * reporte PDF agregado de todas las fechas de la serie (columna
   * `evento`). Owner de la serie o admin.
   */
  @Get("series/:seriesId/export.pdf")
  @UseGuards(SessionGuard)
  async exportSeriesPdf(
    @Param("seriesId") seriesId: string,
    @Query("dataset") dataset: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const series = await this.findSeriesOr404(seriesId);
    await this.requireOwnerOrAdmin(series.producerId, req.person!);
    await this.requireProSelf(series.producerId, req.person!);
    assertDataset(dataset);

    const { events, scope, labelByEvent } = await this.seriesScope(seriesId);
    const table = await this.exportDataset(dataset, scope, labelByEvent);
    const pdf = await buildTablePdf({
      title: `${DATASET_TITLES[dataset]} — Serie «${series.name}»`,
      subtitle: `${events.length} fechas · generado ${fmtCl(new Date())}`,
      summary: table.summary,
      headers: table.headers,
      rows: table.rows,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="serie-${seriesId}-${dataset}.pdf"`,
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

  private exportDataset(
    dataset: ExportDataset,
    eventId: string | { in: string[] },
    labelByEvent?: Map<string, string>,
  ): Promise<ExportTable> {
    return dataset === "sales"
      ? this.exportSales(eventId, labelByEvent)
      : dataset === "checkins"
        ? this.exportCheckins(eventId, labelByEvent)
        : this.exportGuestlist(eventId, labelByEvent);
  }

  /** Una fila por Ticket — incluye cancelados, la cuadratura los mira. */
  private async exportSales(
    eventId: string | { in: string[] },
    labelByEvent?: Map<string, string>,
  ): Promise<ExportTable> {
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
    });
    const payIds = [
      ...new Set(
        tickets.map((t) => t.paymentId).filter((p): p is string => !!p),
      ),
    ];
    const payments = payIds.length
      ? await this.prisma.payment.findMany({
          where: { id: { in: payIds } },
          select: { id: true, channel: true },
        })
      : [];
    const channel = new Map(payments.map((p) => [p.id, p.channel]));
    const names = await this.personNames(
      tickets.flatMap((t) => [t.buyerId, t.ownerId]),
    );
    const evCol = (id: string) =>
      labelByEvent ? [labelByEvent.get(id) ?? ""] : [];
    const cancelled = tickets.filter((t) => t.status === "CANCELLED").length;
    const gross = tickets
      .filter((t) => t.status !== "CANCELLED")
      .reduce((s, t) => s + t.listPrice + t.serviceFee, 0);
    return {
      headers: [
        ...(labelByEvent ? ["evento"] : []),
        "fecha",
        "comprador",
        "asistente",
        "precio_lista",
        "cargo_servicio",
        "total",
        "estado",
        "canal",
        "payment_id",
      ],
      rows: tickets.map((t) => [
        ...evCol(t.eventId),
        t.createdAt.toISOString(),
        names.get(t.buyerId) ?? "?",
        names.get(t.ownerId) ?? "?",
        t.listPrice,
        t.serviceFee,
        t.listPrice + t.serviceFee,
        t.status,
        (t.paymentId && channel.get(t.paymentId)) ?? "",
        t.paymentId ?? "",
      ]),
      summary: [
        `${tickets.length} tickets · recaudado ${clp(gross)} (precio + cargo, sin cancelados)`,
        ...(cancelled ? [`${cancelled} cancelados incluidos en la tabla`] : []),
      ],
    };
  }

  /** Una fila por Checkin — incluye anulados con anulado=si. */
  private async exportCheckins(
    eventId: string | { in: string[] },
    labelByEvent?: Map<string, string>,
  ): Promise<ExportTable> {
    const checkins = await this.prisma.checkin.findMany({
      where: { eventId },
      orderBy: { inAt: "asc" },
    });
    const names = await this.personNames(checkins.map((c) => c.personId));
    const voided = checkins.filter((c) => c.voidedAt).length;
    return {
      headers: [
        ...(labelByEvent ? ["evento"] : []),
        "entrada",
        "salida",
        "metodo",
        "persona",
        "anulado",
        "nota",
      ],
      rows: checkins.map((c) => [
        ...(labelByEvent ? [labelByEvent.get(c.eventId) ?? ""] : []),
        c.inAt.toISOString(),
        c.outAt?.toISOString() ?? "",
        c.method,
        names.get(c.personId) ?? "?",
        c.voidedAt ? "si" : "",
        c.note ?? "",
      ]),
      summary: [
        `${checkins.length} check-ins` +
          (voided ? ` · ${voided} anulados (incluidos en la tabla)` : ""),
      ],
    };
  }

  /** Una fila por GuestListEntry de las listas del evento. */
  private async exportGuestlist(
    eventId: string | { in: string[] },
    labelByEvent?: Map<string, string>,
  ): Promise<ExportTable> {
    const lists = await this.prisma.guestList.findMany({
      where: { eventId },
      include: { entries: { orderBy: { createdAt: "asc" } } },
    });
    const names = await this.personNames([
      ...lists.map((l) => l.ownerId),
      ...lists.flatMap((l) => l.entries.map((e) => e.personId)),
    ]);
    const entries = lists.reduce((s, l) => s + l.entries.length, 0);
    return {
      headers: [
        ...(labelByEvent ? ["evento"] : []),
        "lista",
        "dueno_lista",
        "invitado",
        "estado",
        "creado",
      ],
      rows: lists.flatMap((l) =>
        l.entries.map((e) => [
          ...(labelByEvent ? [labelByEvent.get(l.eventId) ?? ""] : []),
          l.label ?? "",
          names.get(l.ownerId) ?? "?",
          names.get(e.personId) ?? "?",
          e.status,
          e.createdAt.toISOString(),
        ]),
      ),
      summary: [`${entries} invitados en ${lists.length} listas`],
    };
  }

  /** Join manual a Person (FKs escalares) → mapa id→nombre. */
  private async personNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const people = await this.prisma.person.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(
      people.map((p) => [p.id, p.name ?? "?"] as [string, string]),
    );
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
      // Las prácticas viven en /practices — no son cartelera pública.
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
        tablesTotal: true,
        tableSeatMax: true,
        tableSeatsTotal: true,
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
    // — no es un cap duro.
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
    // Corte de preventa — mismo cálculo que CheckoutService.purchaseTicket
    // (presale.cutoff_hour del día del evento, hora local del server). El
    // checkout lo usa para estimar preventa vs puerta sin replicar la regla.
    const cutoffHour = await this.params.getNumber("presale.cutoff_hour", 19);
    const presaleEndsAt = new Date(event.startsAt);
    presaleEndsAt.setHours(cutoffHour, 0, 0, 0);
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
   * Gating Producer Pro (S5): aplica solo cuando el caller ES el productor
   * dueño del recurso — un admin operando el evento de otro pasa sin gate
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

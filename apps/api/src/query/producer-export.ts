import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { entityDef, type QueryFilters } from "@omnidance/shared";
import type { PrismaService } from "../prisma.service";
import {
  clp,
  dateRange,
  personNames,
  whitelist,
} from "./entities/helpers";
import { validateEntityFilters } from "./filters";

/**
 * Exports operativos del productor (spec events/producer-export): los
 * datasets sales/checkins/guestlist se extrajeron de EventsController al
 * motor de consultas - mismos builders para /events/:id/export.*,
 * /query/run y /query/export.*. Los filtros opcionales comparten la
 * whitelist del catálogo (QUERY_CATALOG.PRODUCER): from/to sobre el campo
 * temporal del dataset + enums propios; inválido → 400, desconocido →
 * ignorado.
 */

/** Celda CSV: quotea si contiene , " \n \r; comillas internas → "". */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con BOM UTF-8 (Excel es-CL) + CRLF. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  return String.fromCharCode(0xfeff) + lines.join("\r\n") + "\r\n";
}

/** Datasets exportables (CSV y PDF comparten la misma tabla). */
export const EXPORT_DATASETS = ["sales", "checkins", "guestlist"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];
export const DATASET_TITLES: Record<ExportDataset, string> = {
  sales: "Ventas",
  checkins: "Check-ins",
  guestlist: "Listas de invitados",
};
export interface ExportTable {
  headers: string[];
  rows: unknown[][];
  /** Líneas de resumen que el PDF muestra sobre la tabla. */
  summary: string[];
}

export function assertDataset(d: string): asserts d is ExportDataset {
  if (!EXPORT_DATASETS.includes(d as ExportDataset)) {
    throw new BadRequestException("dataset inválido");
  }
}

/**
 * Shape de los query params de export (EventExportDto lo satisface).
 * Type alias (mapped) para que el DTO con index signature implícita
 * sea asignable a Record<string, unknown>.
 */
export type DatasetFilterInput = Partial<
  Record<
    "from" | "to" | "status" | "channel" | "method" | "voided" | "listId",
    string
  >
>;

/**
 * Valida los filtros de un dataset contra la whitelist del catálogo
 * (mismos nombres/semántica que /query/run). Devuelve solo claves
 * conocidas con valores validados.
 */
export function datasetFilters(
  dataset: ExportDataset,
  raw: DatasetFilterInput,
): QueryFilters {
  const def = entityDef("PRODUCER", dataset);
  if (!def) throw new BadRequestException("dataset inválido");
  return validateEntityFilters(def, raw);
}

export function exportDataset(
  prisma: PrismaService,
  dataset: ExportDataset,
  eventId: string | { in: string[] },
  labelByEvent?: Map<string, string>,
  filters: QueryFilters = {},
): Promise<ExportTable> {
  return dataset === "sales"
    ? exportSales(prisma, eventId, labelByEvent, filters)
    : dataset === "checkins"
      ? exportCheckins(prisma, eventId, labelByEvent, filters)
      : exportGuestlist(prisma, eventId, labelByEvent, filters);
}

/** Una fila por Ticket - incluye cancelados, la cuadratura los mira. */
export async function exportSales(
  prisma: PrismaService,
  eventId: string | { in: string[] },
  labelByEvent?: Map<string, string>,
  filters: QueryFilters = {},
): Promise<ExportTable> {
  const status = whitelist(filters.status, [
    "ACTIVE",
    "USED",
    "TRANSFERRED",
    "CANCELLED",
  ] as const, "status");
  const channel = whitelist(filters.channel, ["PRESALE", "DOOR"] as const, "channel");
  const range = dateRange(filters.from, filters.to);
  const tickets = await prisma.ticket.findMany({
    where: {
      eventId,
      ...(status ? { status } : {}),
      ...(range ? { createdAt: range } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  const payIds = [
    ...new Set(
      tickets.map((t) => t.paymentId).filter((p): p is string => !!p),
    ),
  ];
  const payments = payIds.length
    ? await prisma.payment.findMany({
        where: {
          id: { in: payIds },
          // El canal vive en la orden (Payment), no en el ticket - el
          // filtro baja a la query de pagos y descarta tickets huérfanos.
          ...(channel ? { channel } : {}),
        },
        select: { id: true, channel: true },
      })
    : [];
  const channelOf = new Map(payments.map((p) => [p.id, p.channel]));
  const rows0 = tickets.filter(
    (t) =>
      !channel ||
      (t.paymentId != null && channelOf.get(t.paymentId) === channel),
  );
  const names = await personNames(
    prisma,
    rows0.flatMap((t) => [t.buyerId, t.ownerId]),
  );
  const evCol = (id: string) =>
    labelByEvent ? [labelByEvent.get(id) ?? ""] : [];
  const cancelled = rows0.filter((t) => t.status === "CANCELLED").length;
  const gross = rows0
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
    rows: rows0.map((t) => [
      ...evCol(t.eventId),
      t.createdAt.toISOString(),
      names.get(t.buyerId) ?? "?",
      names.get(t.ownerId) ?? "?",
      t.listPrice,
      t.serviceFee,
      t.listPrice + t.serviceFee,
      t.status,
      (t.paymentId && channelOf.get(t.paymentId)) ?? "",
      t.paymentId ?? "",
    ]),
    summary: [
      `${rows0.length} tickets · recaudado ${clp(gross)} (precio + cargo, sin cancelados)`,
      ...(cancelled ? [`${cancelled} cancelados incluidos en la tabla`] : []),
    ],
  };
}

/** Una fila por Checkin - incluye anulados con anulado=si (salvo filtro). */
export async function exportCheckins(
  prisma: PrismaService,
  eventId: string | { in: string[] },
  labelByEvent?: Map<string, string>,
  filters: QueryFilters = {},
): Promise<ExportTable> {
  const method = whitelist(
    filters.method,
    ["SCAN", "MANUAL", "OFFLINE"] as const,
    "method",
  );
  const voided = whitelist(
    filters.voided,
    ["all", "only", "exclude"] as const,
    "voided",
  );
  const range = dateRange(filters.from, filters.to);
  const checkins = await prisma.checkin.findMany({
    where: {
      eventId,
      ...(method ? { method } : {}),
      ...(voided === "only"
        ? { voidedAt: { not: null } }
        : voided === "exclude"
          ? { voidedAt: null }
          : {}),
      ...(range ? { inAt: range } : {}),
    },
    orderBy: { inAt: "asc" },
  });
  const names = await personNames(
    prisma,
    checkins.map((c) => c.personId),
  );
  const voidedCount = checkins.filter((c) => c.voidedAt).length;
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
        (voidedCount ? ` · ${voidedCount} anulados (incluidos en la tabla)` : ""),
    ],
  };
}

/** Una fila por GuestListEntry de las listas del evento. */
export async function exportGuestlist(
  prisma: PrismaService,
  eventId: string | { in: string[] },
  labelByEvent?: Map<string, string>,
  filters: QueryFilters = {},
): Promise<ExportTable> {
  const status = whitelist(
    filters.status,
    ["PENDING", "ARRIVED"] as const,
    "status",
  );
  const range = dateRange(filters.from, filters.to);
  const entryWhere: Prisma.GuestListEntryWhereInput = {
    ...(status ? { status } : {}),
    ...(range ? { createdAt: range } : {}),
  };
  const lists = await prisma.guestList.findMany({
    where: {
      eventId,
      ...(filters.listId ? { id: filters.listId } : {}),
    },
    include: {
      entries: {
        where: entryWhere,
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const names = await personNames(prisma, [
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

import { BadRequestException } from "@nestjs/common";
import type { QueryFilters } from "@omnidance/shared";
import type { PrismaService } from "../../prisma.service";

/**
 * Motor de consultas compartido (spec analytics/query-console): helpers y
 * contratos comunes de las entidades del registry. Cada entidad produce
 * dos shapes desde la misma fuente:
 *  - `objects`: filas tipadas (lo que hoy devuelve /admin/browse/:entity);
 *  - `rows`:    filas planas `unknown[][]` en el orden de columnas del
 *    catálogo (QUERY_CATALOG en shared) para preview/export.
 */

/** Scope resuelto por lente - ya validado contra ownership. */
export interface QueryScope {
  /** PRODUCER: eventos alcanzables (un evento o el set de la serie). */
  eventId?: string | { in: string[] };
  /** Etiqueta "nombre (YYYY-MM-DD)" por evento - presente en scope de serie. */
  labelByEvent?: Map<string, string>;
  /** ACADEMY_OWNER: academias alcanzables (una o todas las propias). */
  academyId?: string | { in: string[] };
}

export interface EntityResult {
  /** Filas planas en el orden de columnas del catálogo (+ "evento" si aplica). */
  rows: unknown[][];
  /** Shape de objetos (solo entidades admin - consumo de /admin/browse). */
  objects?: unknown[];
  /** Total real del resultado (independiente del cap de rows). */
  total: number;
  /** Líneas de resumen (es-CL) para el header del PDF y /query/run. */
  summary: string[];
}

export interface ExecOpts {
  /** Cap de filas devueltas (preview 50 / browse 100); ausente = todo. */
  take?: number;
  /** Offset de la página (paginación del preview); default 0. */
  skip?: number;
  /** false omite el count separado (browse back-compat); default true. */
  total?: boolean;
}

export interface EntityHandler {
  /**
   * Ejecuta la consulta con el scope ya resuelto (ownership validado).
   * `total` siempre refleja el resultado completo aunque rows esté capado.
   */
  execute(
    prisma: PrismaService,
    scope: QueryScope,
    filters: QueryFilters,
    opts?: ExecOpts,
  ): Promise<EntityResult>;
}

/** Valida un filtro enum por whitelist - inválido → 400 (no se ignora). */
export function whitelist<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  field: string,
): T | undefined {
  if (value === undefined || value === "") return undefined;
  if (!allowed.includes(value as T)) {
    throw new BadRequestException(
      `${field} inválido: "${value}" (válidos: ${allowed.join(", ")})`,
    );
  }
  return value as T;
}

/** ISO date o 400 - los filtros temporales nunca se ignoran en silencio. */
export function dateOr400(value: string | undefined, field: string): Date | undefined {
  if (value === undefined || value === "") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${field} inválido: "${value}"`);
  }
  return d;
}

/** Rango {gte,lte} listo para un where Prisma; undefined si no hay fechas. */
export function dateRange(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lte?: Date } | undefined {
  const gte = dateOr400(from, "from");
  const lte = dateOr400(to, "to");
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

/** Join manual a Person (FKs escalares) → mapa id→nombre. */
export async function personNames(
  prisma: PrismaService,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const people = await prisma.person.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(
    people.map((p) => [p.id, p.name ?? "?"] as [string, string]),
  );
}

export async function academiesByIds(
  prisma: PrismaService,
  ids: string[],
): Promise<Map<string, { id: string; name: string }>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, { id: string; name: string }>();
  const academies = await prisma.academy.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(academies.map((a) => [a.id, a]));
}

export async function peopleByIds(
  prisma: PrismaService,
  ids: string[],
): Promise<Map<string, { id: string; name: string }>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, { id: string; name: string }>();
  const people = await prisma.person.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(people.map((p) => [p.id, p]));
}

export async function eventsByIds(
  prisma: PrismaService,
  ids: string[],
): Promise<Map<string, { id: string; name: string; startsAt: Date }>> {
  const unique = [...new Set(ids)];
  if (!unique.length) {
    return new Map<string, { id: string; name: string; startsAt: Date }>();
  }
  const events = await prisma.event.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, startsAt: true },
  });
  return new Map(events.map((e) => [e.id, e]));
}

/** $ es-CL para resúmenes de reportes ($10.500). */
export const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;

export const fmtCl = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(d);

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");
export { iso };

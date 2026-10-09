import { BadRequestException } from "@nestjs/common";

/**
 * Filtros de listado de la consola de academia (spec
 * analytics/query-console — "Contrato de filtros compartido con
 * módulos"): mismos params/semántica que el catálogo shared. Los
 * endpoints los toman como @Query opcionales - sin params = comportamiento
 * anterior, claves desconocidas ignoradas, enum inválido → 400.
 */

/** Enum por whitelist - valor inválido → 400 (no se ignora). */
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

/** "YYYY-MM-DD" (o ISO) → Date; inválido → 400, nunca se ignora en silencio. */
export function filterDate(
  value: string | undefined,
  field: string,
): Date | undefined {
  if (value === undefined || value === "") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${field} inválido: "${value}"`);
  }
  return d;
}

/**
 * Rango {gte,lte} con límites de día inclusivos: `to` se extiende al fin
 * del día UTC para cubrir campos timestamp (createdAt/startedAt); sobre
 * campos de día (Class.date a medianoche UTC) equivale a incluir el día.
 * undefined si no hay fechas.
 */
export function dayRange(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lte?: Date } | undefined {
  const gte = filterDate(from, "from");
  const lte = filterDate(to, "to");
  if (!gte && !lte) return undefined;
  if (lte) lte.setUTCHours(23, 59, 59, 999);
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

/**
 * Paginación de listados de consola (spec academy-console-v3): los
 * endpoints responden `{items,total,page,pageSize}` - ninguna vista
 * descarga la tabla completa. `page` ≥1 (default 1), `pageSize`
 * default 25 capado a `max` (100 salvo que el endpoint pida otro tope).
 * Valores no numéricos caen al default; no son error (son UI-state).
 */
export function pageParams(
  page: string | undefined,
  pageSize: string | undefined,
  max = 100,
): { page: number; pageSize: number; skip: number; take: number } {
  const p = Math.max(1, Math.floor(Number(page)) || 1);
  const s = Math.floor(Number(pageSize));
  const size = Math.min(max, s >= 1 ? s : 25);
  return { page: p, pageSize: size, skip: (p - 1) * size, take: size };
}

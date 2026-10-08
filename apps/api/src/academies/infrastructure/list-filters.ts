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

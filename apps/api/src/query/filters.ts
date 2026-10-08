import { BadRequestException } from "@nestjs/common";
import {
  entityDef,
  type EntityDef,
  type QueryFilters,
  type QueryRole,
  type SavedReportParams,
} from "@omnidance/shared";
import { dateOr400, whitelist } from "./entities/helpers";

/**
 * Valida filtros contra el EntityDef del catálogo (spec
 * analytics/query-console): claves desconocidas se ignoran, enums fuera
 * de whitelist → 400, fechas no parseables → 400. Devuelve un mapa limpio
 * con solo claves declaradas y valores no vacíos - el handler de la
 * entidad recibe esto y traduce a `where` por whitelist propia.
 */
export function validateEntityFilters(
  def: EntityDef,
  raw: Record<string, unknown> | undefined | null,
): QueryFilters {
  const known = new Map(def.filters.map((f) => [f.key, f]));
  const out: QueryFilters = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    const fd = known.get(key);
    if (!fd) continue; // filtro desconocido → ignorado
    if (typeof value !== "string" || value === "") continue;
    if (fd.type === "enum") {
      whitelist(value, fd.options ?? [], key); // 400 si inválido
    }
    if (fd.type === "date") {
      dateOr400(value, key); // 400 si no parsea
    }
    out[key] = value;
  }
  return out;
}

/**
 * Valida `params` de una consulta guardada contra el catálogo del lente
 * (spec analytics/query-console): entity debe existir para el rol y cada
 * clave de filters debe ser un filtro declarado (enum/date validados,
 * clave desconocida → 400 - a diferencia de run, acá no se ignoran porque
 * lo persistido queda fijo). Devuelve los params normalizados.
 */
export function validateSavedParams(
  role: QueryRole,
  params: unknown,
): SavedReportParams {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new BadRequestException("params debe ser un objeto");
  }
  const p = params as { entity?: unknown; filters?: unknown };
  if (typeof p.entity !== "string" || p.entity === "") {
    throw new BadRequestException("params.entity requerido");
  }
  const def = entityDef(role, p.entity);
  if (!def) {
    throw new BadRequestException(
      `entity inválido para ${role}: "${p.entity}"`,
    );
  }
  const filters = p.filters ?? {};
  if (
    typeof filters !== "object" ||
    filters === null ||
    Array.isArray(filters)
  ) {
    throw new BadRequestException("params.filters debe ser un objeto");
  }
  const known = new Map(def.filters.map((f) => [f.key, f]));
  const clean: QueryFilters = {};
  for (const [key, value] of Object.entries(filters)) {
    const fd = known.get(key);
    if (!fd) {
      throw new BadRequestException(`filtro desconocido: "${key}"`);
    }
    if (typeof value !== "string") {
      throw new BadRequestException(`filtro "${key}" debe ser string`);
    }
    if (value === "") continue;
    if (fd.type === "enum") whitelist(value, fd.options ?? [], key);
    if (fd.type === "date") dateOr400(value, key);
    clean[key] = value;
  }
  return { entity: p.entity, filters: clean };
}

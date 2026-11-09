// Vigencia "rodante" de los planes de academia comprados online.
//
// La vigencia ya no corre por mes calendario: el endsAt del Enrollment
// es `base + duración del plan` (compra el día 15 → vence el día 15 del
// mes siguiente). Renovar con vigencia vigente extiende desde el endsAt
// pagado, sin regalar ni comer días; vencida, el ciclo parte hoy.
// `addMonths` hace clamp de día (31 ene + 1 mes → 28/29 feb) y conserva
// la hora del instante - la comparación `endsAt > now` es absoluta y no
// depende del TZ del servidor.
import type { PlanType } from "@prisma/client";

const DAY_MS = 86_400_000;

/** PlanTypes suscribibles vía motor recurrente de la pasarela (Flow). */
export const RECURRING_PLAN_TYPES = new Set<PlanType>([
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
]);

/**
 * Suma `months` (puede ser negativo) con clamp de día: si el día del mes
 * destino no existe, cae en su último día (31 ene + 1 mes → 28/29 feb).
 * Conserva la hora del instante original.
 */
function addMonths(base: Date, months: number): Date {
  const day = base.getUTCDate();
  const out = new Date(base.getTime());
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0),
  ).getUTCDate();
  out.setUTCDate(Math.min(day, lastDay));
  return out;
}

/**
 * Base de vigencia de una compra: con vigencia rodante la extensión suma
 * directo sobre el endsAt pagado (renovar no come ni regala días); una
 * vigencia vencida o inexistente parte hoy.
 */
export function membershipBase(now: Date, currentEndsAt: Date | null): Date {
  return currentEndsAt && currentEndsAt > now ? currentEndsAt : now;
}

/**
 * endsAt que recibe el Enrollment al pagar un plan (vigencia rodante):
 *  - MONTHLY    → base + 1 mes
 *  - QUARTERLY  → base + 3 meses
 *  - SEMIANNUAL → base + 6 meses
 *  - SINGLE     → base + 1 día (cubre la clase nocturna del día siguiente)
 *  - PERIOD     → base + periodDays (null si el plan no lo configura)
 *  - CLASS_PACK → null (sin fecha - vence por consumo, no auditado en v1)
 */
export function membershipEndsAt(
  plan: { type: PlanType; periodDays: number | null },
  base: Date,
): Date | null {
  switch (plan.type) {
    case "MONTHLY":
      return addMonths(base, 1);
    case "QUARTERLY":
      return addMonths(base, 3);
    case "SEMIANNUAL":
      return addMonths(base, 6);
    case "SINGLE":
      return new Date(base.getTime() + DAY_MS);
    case "PERIOD":
      return plan.periodDays
        ? new Date(base.getTime() + plan.periodDays * DAY_MS)
        : null;
    default:
      return null; // CLASS_PACK
  }
}

/**
 * Inicio del ciclo pagado vigente de una inscripción: la ventana que usa
 * la cuota por conteo (classCount) para no acumular reservas de ciclos
 * anteriores. Al renovar, endsAt = base + duración ⇒ endsAt - duración
 * es el inicio del ciclo recién pagado; el max con startedAt cubre el
 * primer ciclo y las fechas cargadas a mano. Sin endsAt (CLASS_PACK,
 * inscripción legado) la ventana parte en startedAt.
 */
export function planCycleStart(
  plan: { type: PlanType; periodDays: number | null },
  startedAt: Date,
  endsAt: Date | null,
): Date {
  if (endsAt == null) return startedAt;
  let cycleStart: Date;
  switch (plan.type) {
    case "MONTHLY":
      cycleStart = addMonths(endsAt, -1);
      break;
    case "QUARTERLY":
      cycleStart = addMonths(endsAt, -3);
      break;
    case "SEMIANNUAL":
      cycleStart = addMonths(endsAt, -6);
      break;
    case "PERIOD":
      cycleStart = plan.periodDays
        ? new Date(endsAt.getTime() - plan.periodDays * DAY_MS)
        : startedAt;
      break;
    case "SINGLE":
      cycleStart = new Date(endsAt.getTime() - DAY_MS);
      break;
    default:
      return startedAt; // CLASS_PACK
  }
  return cycleStart > startedAt ? cycleStart : startedAt;
}

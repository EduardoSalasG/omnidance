// Vigencia "fecha calendario" de los planes de academia comprados online.
//
// Convención de fecha de corte: mediodía Chile (~15:00 UTC, seguro entre
// UTC-3/-4) del último día válido - la misma que usa el staff al cargar
// "pagado hasta" desde un input date. Así el día que muestra la UI en
// es-CL coincide con el día de vigencia y la comparación `endsAt > now`
// no depende del TZ del servidor.
import type { PlanType } from "@prisma/client";

const CL_TZ = "America/Santiago";
const DAY_MS = 86_400_000;

const clFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function clParts(d: Date): { y: number; m: number; day: number } {
  const [y, m, day] = clFmt.format(d).split("-").map(Number);
  return { y, m, day };
}

/** Mediodía Chile del último día del mes `m` (1-12) del año `y`. */
function endOfClMonth(y: number, m: number): Date {
  return new Date(Date.UTC(y, m, 0, 15));
}

/**
 * Base de vigencia de una compra: si ya hay enrollment ACTIVE con fecha
 * futura, la compra extiende desde el día siguiente a su vencimiento
 * (renovar no come ni regala días); si no, parte hoy.
 */
/** PlanTypes suscribibles vía motor recurrente de la pasarela (Flow). */
export const RECURRING_PLAN_TYPES = new Set<PlanType>([
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
]);

export function membershipBase(now: Date, currentEndsAt: Date | null): Date {
  return currentEndsAt && currentEndsAt > now
    ? new Date(currentEndsAt.getTime() + DAY_MS)
    : now;
}

/**
 * endsAt que recibe el Enrollment al pagar un plan.
 *  - MONTHLY    → fin del mes calendario en curso
 *  - QUARTERLY  → fin del 3er mes calendario desde la compra
 *  - SEMIANNUAL → fin del 6º mes calendario
 *  - SINGLE     → mediodía CL del día siguiente (cubre la clase nocturna)
 *  - PERIOD     → base + periodDays (misma derivación que el alta staff)
 *  - TRIAL      → base + periodDays si el owner lo configuró; si no, null
 *    (igual que el alta staff: la prueba queda sin fecha)
 *  - CLASS_PACK → null (sin fecha - vence por consumo, no auditado en v1)
 */
export function membershipEndsAt(
  plan: { type: PlanType; periodDays: number | null },
  base: Date,
): Date | null {
  const { y, m, day } = clParts(base);
  switch (plan.type) {
    case "MONTHLY":
      return endOfClMonth(y, m);
    case "QUARTERLY":
      return endOfClMonth(y, m + 2);
    case "SEMIANNUAL":
      return endOfClMonth(y, m + 5);
    case "SINGLE":
      return new Date(Date.UTC(y, m - 1, day + 1, 15));
    case "PERIOD":
    case "TRIAL":
      return plan.periodDays
        ? new Date(base.getTime() + plan.periodDays * DAY_MS)
        : null;
    default:
      return null; // CLASS_PACK
  }
}

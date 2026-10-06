// Corte de la preventa (spec event-presale-cutoff): el instante se deriva
// del DÍA del evento - medianoche local de `startsAt` + N minutos. La
// cadena de resolución es la misma de los fees: override del evento →
// default del productor (ProducerParams) → param global
// `presale.cutoff_hour` (en horas, default 19). Minutos >1439 expresan un
// corte post-medianoche (ej. 1500 = la 01:00 del día siguiente).

/** Cota del DTO: 47:59 cubre cualquier corte nocturno sin timestamps. */
export const PRESALE_CUTOFF_MAX_MINUTES = 2879;

export function resolvePresaleCutoffMinutes(
  event: { presaleCutoffMinutes?: number | null },
  producer: { presaleCutoffMinutes?: number | null } | null | undefined,
  globalCutoffHour: number,
): number {
  return (
    event.presaleCutoffMinutes ??
    producer?.presaleCutoffMinutes ??
    globalCutoffHour * 60
  );
}

export function presaleCutoffDate(startsAt: Date, minutes: number): Date {
  const cutoff = new Date(startsAt);
  cutoff.setHours(0, 0, 0, 0);
  // setMinutes con overflow rueda a las horas/días siguientes.
  cutoff.setMinutes(minutes);
  return cutoff;
}

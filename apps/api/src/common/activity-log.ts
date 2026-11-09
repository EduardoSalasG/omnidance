// Emisor del event store de ciclo de vida del actor (spec
// platform-trials): `ActivityEvent` append-only. A diferencia de
// emitPaymentEvent no lleva hash-chain - la frontera es: PaymentEvent
// audita el dinero, ActivityEvent observa al actor (admin/CX, línea de
// vida). Acepta el cliente transaccional para emitir dentro de la misma
// tx del cambio de dominio (atomicidad evento+estado).
import type { Prisma } from "@prisma/client";

export interface ActivityInput {
  type: string;
  personId?: string;
  academyId?: string;
  refType?: string;
  refId?: string;
  data?: Prisma.InputJsonValue;
  /** Timestamp del hecho; default now(). El barrido de trials vencidos
      y el backfill lo fijan al instante real del evento, no al de la
      corrida que lo registra. */
  at?: Date;
}

export function emitActivity(
  tx: Pick<Prisma.TransactionClient, "activityEvent">,
  { at, ...event }: ActivityInput,
) {
  return tx.activityEvent.create({
    data: { ...event, ...(at ? { createdAt: at } : {}) },
  });
}

/**
 * Emit con dedup por (refType, refId, type) - la misma llave que usa el
 * backfill para no duplicar la historia. Sirve cuando dos caminos
 * convergen al mismo hecho (sub.started vía notifyStarted o vía el
 * primer settle TRANSFER) o cuando un barrido re-encuentra un evento
 * ya registrado.
 */
export async function emitActivityOnce(
  tx: Pick<Prisma.TransactionClient, "activityEvent">,
  event: ActivityInput & { refType: string; refId: string },
) {
  const existing = await tx.activityEvent.findFirst({
    where: { type: event.type, refType: event.refType, refId: event.refId },
    select: { id: true },
  });
  if (existing) return existing;
  return emitActivity(tx, event);
}

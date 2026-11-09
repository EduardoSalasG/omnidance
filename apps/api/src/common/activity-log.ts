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
}

export function emitActivity(
  tx: Pick<Prisma.TransactionClient, "activityEvent">,
  event: ActivityInput,
) {
  return tx.activityEvent.create({ data: event });
}

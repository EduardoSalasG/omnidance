// Referencia de orden legible para correlación con la pasarela de pago.
// Formato: tkt_<eventId>_<codeId|->_<uuid>
// (cuid/uuid no contienen "_", por lo que el split es seguro).
//
// El contexto de la compra se persiste en Payment.eventId/discountCodeId;
// el decode solo queda como fallback para pagos legacy sin esas columnas.

import { randomUUID } from "node:crypto";

export interface TicketOrderRef {
  eventId: string;
  codeId: string | null;
  uid: string;
}

export function encodeTicketOrderRef(
  eventId: string,
  codeId?: string | null,
): string {
  return `tkt_${eventId}_${codeId ?? ""}_${randomUUID()}`;
}

export function decodeTicketOrderRef(refId: string): TicketOrderRef | null {
  const parts = refId.split("_");
  if (parts.length < 4 || parts[0] !== "tkt") return null;
  const [, eventId, codeId, ...rest] = parts;
  const uid = rest.join("_");
  if (!eventId || !uid) return null;
  return { eventId, codeId: codeId || null, uid };
}

// Referencia de orden legible: el modelo Payment no persiste eventId ni
// discountCodeId, así que el contexto de la compra viaja codificado en refId.
// Formato: tkt_<eventId>_<codeId|->_<uuid>
// (cuid/uuid no contienen "_", por lo que el split es seguro).
//
// NOTA: lo ideal es agregar `metadata Json` (o `eventId`) a Payment — cambio
// de schema pendiente, reportado.

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

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

// ─── Series pass ───
// Formato: sp_<seriesId>_<month>_<uuid>. month es "YYYY-MM" (contiene "-",
// no "_") y cuid/uuid tampoco tienen "_", por lo que el split es seguro.
//
// A diferencia del ticket, la orden SERIES_PASS no tiene columna propia en
// Payment (eventId queda null): el contexto (seriesId, month) solo viaja en
// el refId — el webhook y el cálculo de payouts lo decodifican como fuente
// primaria.
export interface SeriesPassRef {
  seriesId: string;
  month: string; // "YYYY-MM"
  uid: string;
}

export function encodeSeriesPassRef(seriesId: string, month: string): string {
  return `sp_${seriesId}_${month}_${randomUUID()}`;
}

export function decodeSeriesPassRef(refId: string): SeriesPassRef | null {
  const parts = refId.split("_");
  if (parts.length < 4 || parts[0] !== "sp") return null;
  const [, seriesId, month, ...rest] = parts;
  const uid = rest.join("_");
  if (!seriesId || !month || !uid) return null;
  return { seriesId, month, uid };
}

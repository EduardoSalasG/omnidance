// Referencia de orden legible para correlación con la pasarela de pago.
//
// Límite externo: Flow rechaza payment/create cuando commerceOrder supera
// 45 caracteres (HTTP 400) y refId dobla como commerceOrder para TODOS
// los proveedores - cada formato se diseña para caber con ids cuid (25).
// El sufijo aleatorio son 8 chars base36 (~2,8e12); refId es @unique en
// DB y una colisión teórica falla el insert, nunca cruza correlaciones.
//
// Formato: tkt_<eventId>_<uid8>
// El codeId NO viaja en el ref: Payment.discountCodeId es la fuente de
// verdad (el formato legacy tkt_<event>_<code>_<uuid> se sigue
// decodificando para pagos antiguos sin esas columnas).

import { randomInt, randomUUID } from "node:crypto";

const MAX_REF_LEN = 45;
const UID_LEN = 8;
const UID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function shortUid(): string {
  let out = "";
  for (let i = 0; i < UID_LEN; i++) {
    out += UID_ALPHABET[randomInt(UID_ALPHABET.length)];
  }
  return out;
}

// Guardrail local del límite de Flow: un formato que no cupiera explota
// aquí (error claro) en vez de recibir un 400 de la pasarela.
function fits(ref: string): string {
  if (ref.length > MAX_REF_LEN) {
    throw new Error(`order-ref excede ${MAX_REF_LEN} chars (${ref.length})`);
  }
  return ref;
}

interface TicketOrderRef {
  eventId: string;
  codeId: string | null;
  uid: string;
}

export function encodeTicketOrderRef(eventId: string): string {
  return fits(`tkt_${eventId}_${shortUid()}`);
}

export function decodeTicketOrderRef(refId: string): TicketOrderRef | null {
  const parts = refId.split("_");
  if (parts.length < 3 || parts[0] !== "tkt") return null;
  const [, eventId, ...rest] = parts;
  if (!eventId) return null;
  // Formato corto: tkt_<eventId>_<uid> → 3 partes, sin codeId.
  if (parts.length === 3) {
    const uid = rest.join("_");
    return uid ? { eventId, codeId: null, uid } : null;
  }
  // Legacy: tkt_<eventId>_<codeId|>_<uuid>
  const [codeId, ...uidParts] = rest;
  const uid = uidParts.join("_");
  if (!uid) return null;
  return { eventId, codeId: codeId || null, uid };
}

// ─── Series pass ───
// Formato: sp_<seriesId>_<month>_<uid8>. month es "YYYY-MM" (contiene "-",
// no "_") y cuid/uid tampoco tienen "_", por lo que el split es seguro.
//
// A diferencia del ticket, la orden SERIES_PASS no tiene columna propia en
// Payment (eventId queda null): el contexto (seriesId, month) solo viaja en
// el refId - el webhook y el cálculo de payouts lo decodifican como fuente
// primaria.
interface SeriesPassRef {
  seriesId: string;
  month: string; // "YYYY-MM"
  uid: string;
}

export function encodeSeriesPassRef(seriesId: string, month: string): string {
  return fits(`sp_${seriesId}_${month}_${shortUid()}`);
}

export function decodeSeriesPassRef(refId: string): SeriesPassRef | null {
  const parts = refId.split("_");
  if (parts.length < 4 || parts[0] !== "sp") return null;
  const [, seriesId, month, ...rest] = parts;
  const uid = rest.join("_");
  if (!seriesId || !month || !uid) return null;
  return { seriesId, month, uid };
}

// ─── Membership (plan de academia) ───
// Formato: mem_<planId>_<uid8>. Como SERIES_PASS, el contexto solo viaja
// en el refId (Payment no tiene columna para el plan); el webhook lo
// decodifica para materializar el Enrollment al PAID.
interface MembershipRef {
  planId: string;
  uid: string;
}

export function encodeMembershipRef(planId: string): string {
  return fits(`mem_${planId}_${shortUid()}`);
}

export function decodeMembershipRef(refId: string): MembershipRef | null {
  const parts = refId.split("_");
  if (parts.length < 3 || parts[0] !== "mem") return null;
  const [, planId, ...rest] = parts;
  const uid = rest.join("_");
  if (!planId || !uid) return null;
  return { planId, uid };
}

// ─── Clase suelta / taller (WORKSHOP) ───
// Formato: wks_<classId>_<uid8>. Como MEMBERSHIP, el contexto solo viaja
// en el refId - el settle decodifica la clase y crea el ClassBooking con
// paymentId (asiento pagado: no consume cuota ni exige inscripción).
interface ClassDropinRef {
  classId: string;
  uid: string;
}

export function encodeClassRef(classId: string): string {
  return fits(`wks_${classId}_${shortUid()}`);
}

export function decodeClassRef(refId: string): ClassDropinRef | null {
  const parts = refId.split("_");
  if (parts.length < 3 || parts[0] !== "wks") return null;
  const [, classId, ...rest] = parts;
  const uid = rest.join("_");
  if (!classId || !uid) return null;
  return { classId, uid };
}

// ─── Clase particular (PRIVATE) ───
// Formato: pvt_<academyId>_<uid8>. El contexto solo viaja en el refId - el
// settle crea la PrivateLesson "por asignar" (sin instructor ni fecha; el
// owner de la academia los define post-compra).
interface PrivateLessonRef {
  academyId: string;
  uid: string;
}

export function encodePrivateRef(academyId: string): string {
  return fits(`pvt_${academyId}_${shortUid()}`);
}

export function decodePrivateRef(refId: string): PrivateLessonRef | null {
  const parts = refId.split("_");
  if (parts.length < 3 || parts[0] !== "pvt") return null;
  const [, academyId, ...rest] = parts;
  const uid = rest.join("_");
  if (!academyId || !uid) return null;
  return { academyId, uid };
}

// ─── Suscripción de plataforma (PLATFORM_SUB) ───
// Formato: platsub_<platformSubscriptionId>_<invoiceId>. Cobros de la
// suscripción SaaS de la plataforma (academia / Producer Pro - spec
// academy-saas-billing): cada invoice Flow pagada genera un Payment con
// este refId; el reconcile lo usa como dedup y el settle decodifica la
// suscripción para aplicar los efectos (limpiar gracia/bloqueo, proTier).
interface PlatformSubRef {
  subscriptionId: string;
  invoiceId: string;
}

export function encodePlatformSubRef(
  subscriptionId: string,
  invoiceId: string,
): string {
  return `platsub_${subscriptionId}_${invoiceId}`;
}

export function decodePlatformSubRef(refId: string): PlatformSubRef | null {
  const parts = refId.split("_");
  if (parts.length < 3 || parts[0] !== "platsub") return null;
  const [, subscriptionId, ...rest] = parts;
  const invoiceId = rest.join("_");
  if (!subscriptionId || !invoiceId) return null;
  return { subscriptionId, invoiceId };
}

// ─── Cobro suelto de plataforma (PLATFORM_CHARGE) ───
// Formato: platchg_<uuid v4>. Cobros arbitrarios plataforma→actor
// (deuda, fee especial, ajuste - spec payments/platform-charges) sin
// suscripción asociada: el refId solo lleva correlación, el concepto
// viaja en el payload del evento ORDER_CREATED. "platchg_" (8) + uuid
// (36) = 44 chars - dentro del límite de 45 del commerceOrder de Flow.
interface PlatformChargeRef {
  uid: string;
}

export function encodePlatformChargeRef(): string {
  return fits(`platchg_${randomUUID()}`);
}

export function decodePlatformChargeRef(
  refId: string,
): PlatformChargeRef | null {
  const parts = refId.split("_");
  if (parts.length !== 2 || parts[0] !== "platchg") return null;
  const uid = parts[1];
  if (!uid) return null;
  return { uid };
}

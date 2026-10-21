// Generador .ics (RFC 5545) de una clase — spec class-calendar-ics.
// Función pura: el controller resuelve la clase + sede + zona horaria y
// acá solo se serializa el VCALENDAR/VEVENT. iOS/Android abren el
// "agregar a calendario" nativo al descargar el archivo - no hace falta
// API ni share-sheet extra.

export interface ClassIcsInput {
  /** Id de la clase - compone UID y el link de la ficha. */
  classId: string;
  /** Class.date - medianoche UTC del día de la clase (wall-clock). */
  date: Date;
  /** "HH:mm" wall-clock del slot (sin conversión - TZID hace el trabajo). */
  startTime: string;
  endTime: string;
  /** IANA timezone ya resuelta (City.timezone o fallback del caller). */
  timezone: string;
  /** Título de la clase (series.name ?? academy.name). */
  title: string;
  academyName: string;
  /** "Sede, dirección" ya armada (academia - las clases no tienen venue). */
  location: string;
  /** Texto plano multi-línea; los \n se escapan a \n literales del .ics. */
  description: string;
  /** Base pública del front (WEB_URL) para el link de la ficha. */
  webUrl: string;
  /** DTSTAMP - inyectable para tests deterministas. */
  now?: Date;
}

// Caracteres reservados de un valor TEXT (RFC 5545 §3.3.11): backslash
// primero, luego ; , y los saltos de línea → \n literal.
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folding RFC 5545 §3.1: ninguna línea física supera 75 octets; la
 * continuación empieza con un espacio (que cuenta dentro del límite).
 * Cuenta octets UTF-8 - un corte entre bytes de un char multibyte
 * corrompería el valor.
 */
export function foldIcsLine(line: string): string {
  const chunks: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    // El primer chunk tiene 75 octets; los siguientes 74 + el espacio.
    const cap = chunks.length === 0 ? 75 : 74;
    if (bytes + b > cap) {
      chunks.push(cur);
      cur = ch;
      bytes = b;
    } else {
      cur += ch;
      bytes += b;
    }
  }
  chunks.push(cur);
  return chunks.join("\r\n ");
}

/** YYYYMMDD del día de la clase (date llega a medianoche UTC). */
function icsDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** HHmmss desde "HH:mm" del slot (los segundos no se modelan → 00). */
function icsTime(t: string): string {
  const [h = "0", m = "0"] = t.split(":");
  return `${h.padStart(2, "0")}${m.padStart(2, "0")}00`;
}

function minutesOf(t: string): number {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
}

/** YYYYMMDDTHHMMSSZ UTC - timestamp de emisión del archivo. */
function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * VCALENDAR de una sola clase: VEVENT con UID estable (mismo archivo en
 * cada descarga), DTSTART/DTEND con TZID (el wall-clock de la app ya es
 * hora local de la academia), VALARM 60 min antes (estándar industria).
 */
export function buildClassIcs(input: ClassIcsInput): string {
  // Una clase que cruza medianoche (23:00–00:30) tiene DTEND al día
  // siguiente - mismo criterio de duración que classStart del dominio.
  const endDate =
    minutesOf(input.endTime) <= minutesOf(input.startTime)
      ? new Date(input.date.getTime() + 86_400_000)
      : input.date;

  const summary =
    input.title === input.academyName
      ? input.title
      : `${input.title} — ${input.academyName}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Omnidance//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:class-${input.classId}@omnidance`,
    `DTSTAMP:${icsStamp(input.now ?? new Date())}`,
    `DTSTART;TZID=${input.timezone}:${icsDate(input.date)}T${icsTime(input.startTime)}`,
    `DTEND;TZID=${input.timezone}:${icsDate(endDate)}T${icsTime(input.endTime)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(input.location)}`,
    `DESCRIPTION:${escapeIcsText(input.description)}`,
    `URL:${input.webUrl}/clases/${input.classId}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT60M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

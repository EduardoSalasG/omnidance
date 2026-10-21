import { describe, it, expect } from "vitest";
import {
  buildClassIcs,
  escapeIcsText,
  foldIcsLine,
} from "./class-ics";

// buildClassIcs / escapeIcsText / foldIcsLine - serialización RFC 5545
// pura: escaping de valores TEXT y folding a 75 octets sin partir
// caracteres multibyte.

const base = {
  classId: "cls-1",
  date: new Date(Date.UTC(2026, 8, 15)),
  startTime: "20:00",
  endTime: "21:00",
  timezone: "America/Santiago",
  title: "Bachata Inicial",
  academyName: "Academia X",
  location: "Academia X, Av. Siempre Viva 123",
  description: "Clase de Academia X",
  webUrl: "https://app.test",
  now: new Date(Date.UTC(2026, 8, 1, 12, 34, 56)),
};

describe("escapeIcsText", () => {
  it("escapa backslash, punto y coma, coma y saltos de línea", () => {
    expect(escapeIcsText('a\\b;c,d\ne\r\nf')).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
});

describe("foldIcsLine", () => {
  it("líneas cortas no se pliegan", () => {
    expect(foldIcsLine("SUMMARY:hola")).toBe("SUMMARY:hola");
  });

  it("pliega a 75 octets con continuación ' +'", () => {
    const line = "X".repeat(80);
    const folded = foldIcsLine(line);
    const physical = folded.split("\r\n");
    expect(physical[0]).toHaveLength(75);
    expect(physical[1]).toBe(" " + "X".repeat(5));
  });

  it("no parte un carácter multibyte en el corte", () => {
    // 74 ASCII + "ó" (2 bytes) no cabe en 75 → la ó va a la continuación.
    const line = "X".repeat(74) + "ó" + "Y".repeat(10);
    const folded = foldIcsLine(line);
    const [first, second] = folded.split("\r\n ");
    expect(first).toBe("X".repeat(74));
    expect(second.startsWith("ó")).toBe(true);
    for (const p of folded.split("\r\n")) {
      expect(Buffer.byteLength(p, "utf8")).toBeLessThanOrEqual(75);
    }
  });
});

describe("buildClassIcs", () => {
  it("estructura VCALENDAR/VEVENT completa con CRLF", () => {
    const ics = buildClassIcs(base);
    expect(ics.endsWith("\r\n")).toBe(true);
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines[lines.length - 2]).toBe("END:VCALENDAR");
    expect(ics).toContain("DTSTAMP:20260901T123456Z");
    expect(ics).toContain("DTSTART;TZID=America/Santiago:20260915T200000");
    expect(ics).toContain("DTEND;TZID=America/Santiago:20260915T210000");
    expect(ics).toContain("UID:class-cls-1@omnidance");
    expect(ics).toContain("URL:https://app.test/clases/cls-1");
    expect(ics).toContain("TRIGGER:-PT60M");
  });

  it("cada línea física queda en 75 octets o menos", () => {
    const ics = buildClassIcs({
      ...base,
      description:
        "Descripción muy larga, con texto que excede el límite de línea; " +
        "debe plegarse respetando los 75 octets del RFC 5545.",
    });
    for (const p of ics.split("\r\n")) {
      expect(Buffer.byteLength(p, "utf8")).toBeLessThanOrEqual(75);
    }
  });
});

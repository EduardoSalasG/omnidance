import { describe, it, expect } from "vitest";
import {
  PRESALE_CUTOFF_MAX_MINUTES,
  presaleCutoffDate,
  resolvePresaleCutoffMinutes,
} from "./presale-cutoff";

describe("resolvePresaleCutoffMinutes", () => {
  it("override del evento gana a productor y global", () => {
    expect(
      resolvePresaleCutoffMinutes(
        { presaleCutoffMinutes: 1425 },
        { presaleCutoffMinutes: 1320 },
        19,
      ),
    ).toBe(1425);
  });

  it("sin override del evento gana el default del productor", () => {
    expect(
      resolvePresaleCutoffMinutes(
        { presaleCutoffMinutes: null },
        { presaleCutoffMinutes: 1320 },
        19,
      ),
    ).toBe(1320);
  });

  it("sin evento ni productor cae al param global (horas → minutos)", () => {
    expect(
      resolvePresaleCutoffMinutes({ presaleCutoffMinutes: null }, null, 19),
    ).toBe(19 * 60);
  });

  it("productor sin el campo configurado también cae al global", () => {
    expect(
      resolvePresaleCutoffMinutes(
        { presaleCutoffMinutes: null },
        { presaleCutoffMinutes: null },
        23,
      ),
    ).toBe(23 * 60);
  });
});

describe("presaleCutoffDate", () => {
  const eventDay = new Date(2026, 9, 14, 21, 0, 0); // mié 14 oct 2026 21:00

  it("23:45 del día del evento", () => {
    const c = presaleCutoffDate(eventDay, 23 * 60 + 45);
    expect(c.getHours()).toBe(23);
    expect(c.getMinutes()).toBe(45);
    expect(c.getDate()).toBe(14);
  });

  it("0 → medianoche del día del evento", () => {
    const c = presaleCutoffDate(eventDay, 0);
    expect(c.getHours()).toBe(0);
    expect(c.getMinutes()).toBe(0);
    expect(c.getDate()).toBe(14);
  });

  it(">1439 rueda al día siguiente (25:00 = 01:00)", () => {
    const c = presaleCutoffDate(eventDay, 25 * 60);
    expect(c.getDate()).toBe(15);
    expect(c.getHours()).toBe(1);
    expect(c.getMinutes()).toBe(0);
  });

  it("2879 (max) = 47:59 → dos días después a las 23:59", () => {
    const c = presaleCutoffDate(eventDay, PRESALE_CUTOFF_MAX_MINUTES);
    expect(c.getDate()).toBe(15);
    expect(c.getHours()).toBe(23);
    expect(c.getMinutes()).toBe(59);
  });
});

import { describe, expect, it } from "vitest";
import {
  membershipBase,
  membershipEndsAt,
} from "./membership-vigency";

// Fechas fijas en UTC; el helper trabaja en America/Santiago vía Intl,
// así que el caso de prueba elige horas donde el día CL es inequívoco.
const oct12 = new Date("2026-10-12T18:00:00Z"); // lunes 12 oct, tarde CL

describe("membershipBase", () => {
  it("sin vigencia previa → base = hoy", () => {
    expect(membershipBase(oct12, null)).toBe(oct12);
  });

  it("vigencia vencida → base = hoy (reinicia, no regala días)", () => {
    const past = new Date("2026-10-01T15:00:00Z");
    expect(membershipBase(oct12, past)).toBe(oct12);
  });

  it("vigencia futura → base = día siguiente al vencimiento (extiende)", () => {
    const ends = new Date("2026-10-31T15:00:00Z");
    expect(membershipBase(oct12, ends).getTime()).toBe(
      ends.getTime() + 86_400_000,
    );
  });
});

describe("membershipEndsAt", () => {
  const plan = (type: string, periodDays: number | null = null) => ({
    type: type as never,
    periodDays,
  });

  it("MONTHLY → fin del mes calendario en curso (CL)", () => {
    const end = membershipEndsAt(plan("MONTHLY"), oct12)!;
    // 31 oct mediodía CL ≈ 15:00 UTC
    expect(end.toISOString()).toBe("2026-10-31T15:00:00.000Z");
  });

  it("QUARTERLY → fin del 3er mes desde la compra", () => {
    const end = membershipEndsAt(plan("QUARTERLY"), oct12)!;
    expect(end.toISOString()).toBe("2026-12-31T15:00:00.000Z");
  });

  it("SEMIANNUAL → fin del 6º mes desde la compra", () => {
    const end = membershipEndsAt(plan("SEMIANNUAL"), oct12)!;
    expect(end.toISOString()).toBe("2027-03-31T15:00:00.000Z");
  });

  it("SEMIANNUAL cruza el año correctamente (compra en noviembre)", () => {
    const nov10 = new Date("2026-11-10T18:00:00Z");
    const end = membershipEndsAt(plan("SEMIANNUAL"), nov10)!;
    expect(end.toISOString()).toBe("2027-04-30T15:00:00.000Z");
  });

  it("SINGLE → mediodía CL del día siguiente (cubre la clase nocturna)", () => {
    const end = membershipEndsAt(plan("SINGLE"), oct12)!;
    expect(end.toISOString()).toBe("2026-10-13T15:00:00.000Z");
  });

  it("PERIOD → base + periodDays (misma derivación que el alta staff)", () => {
    const end = membershipEndsAt(plan("PERIOD", 30), oct12)!;
    expect(end.getTime()).toBe(oct12.getTime() + 30 * 86_400_000);
  });

  it("PERIOD sin periodDays → null", () => {
    expect(membershipEndsAt(plan("PERIOD"), oct12)).toBeNull();
  });

  it("CLASS_PACK → null (sin fecha — vence por consumo)", () => {
    expect(membershipEndsAt(plan("CLASS_PACK"), oct12)).toBeNull();
  });

  it("renovación MONTHLY desde 31 oct → fin de noviembre", () => {
    const ends = new Date("2026-10-31T15:00:00Z");
    const base = membershipBase(oct12, ends);
    expect(membershipEndsAt(plan("MONTHLY"), base)!.toISOString()).toBe(
      "2026-11-30T15:00:00.000Z",
    );
  });
});

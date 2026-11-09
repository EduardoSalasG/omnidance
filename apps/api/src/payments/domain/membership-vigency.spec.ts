import { describe, expect, it } from "vitest";
import {
  membershipBase,
  membershipEndsAt,
  planCycleStart,
} from "./membership-vigency";

// Vigencia rodante: fechas absolutas en UTC - addMonths hace clamp de
// día y conserva la hora, así que los instantes se comparan directo.
const DAY_MS = 86_400_000;
const oct15 = new Date("2026-10-15T15:00:00Z");

const plan = (type: string, periodDays: number | null = null) => ({
  type: type as never,
  periodDays,
});

describe("membershipBase", () => {
  it("sin vigencia previa → base = hoy", () => {
    expect(membershipBase(oct15, null)).toBe(oct15);
  });

  it("vigencia vencida → base = hoy (reinicia, no regala días)", () => {
    const past = new Date("2026-10-01T15:00:00Z");
    expect(membershipBase(oct15, past)).toBe(oct15);
  });

  it("vigencia futura → base = endsAt pagado (extiende sin día extra)", () => {
    const ends = new Date("2026-10-31T15:00:00Z");
    expect(membershipBase(oct15, ends)).toBe(ends);
  });
});

describe("membershipEndsAt", () => {
  it("MONTHLY → mismo día del mes siguiente (compra 15 → vence 15)", () => {
    expect(membershipEndsAt(plan("MONTHLY"), oct15)!.toISOString()).toBe(
      "2026-11-15T15:00:00.000Z",
    );
  });

  it("MONTHLY con clamp de día (31 ene + 1 mes → último día de feb)", () => {
    const jan31 = new Date("2026-01-31T15:00:00Z");
    // 2026 no es bisiesto: febrero termina el 28.
    expect(membershipEndsAt(plan("MONTHLY"), jan31)!.toISOString()).toBe(
      "2026-02-28T15:00:00.000Z",
    );
  });

  it("QUARTERLY → base + 3 meses", () => {
    expect(membershipEndsAt(plan("QUARTERLY"), oct15)!.toISOString()).toBe(
      "2027-01-15T15:00:00.000Z",
    );
  });

  it("SEMIANNUAL → base + 6 meses", () => {
    expect(membershipEndsAt(plan("SEMIANNUAL"), oct15)!.toISOString()).toBe(
      "2027-04-15T15:00:00.000Z",
    );
  });

  it("SINGLE → base + 1 día", () => {
    expect(membershipEndsAt(plan("SINGLE"), oct15)!.getTime()).toBe(
      oct15.getTime() + DAY_MS,
    );
  });

  it("PERIOD → base + periodDays", () => {
    expect(membershipEndsAt(plan("PERIOD", 30), oct15)!.getTime()).toBe(
      oct15.getTime() + 30 * DAY_MS,
    );
  });

  it("PERIOD sin periodDays → null", () => {
    expect(membershipEndsAt(plan("PERIOD"), oct15)).toBeNull();
  });

  it("CLASS_PACK → null (sin fecha - vence por consumo)", () => {
    expect(membershipEndsAt(plan("CLASS_PACK"), oct15)).toBeNull();
  });

  it("renovación MONTHLY desde endsAt → un mes más, sin día extra", () => {
    const ends = new Date("2026-10-31T15:00:00Z");
    const base = membershipBase(oct15, ends);
    expect(membershipEndsAt(plan("MONTHLY"), base)!.toISOString()).toBe(
      "2026-11-30T15:00:00.000Z",
    );
  });
});

describe("planCycleStart", () => {
  const startedAt = new Date("2026-01-10T15:00:00Z");

  it("endsAt null (CLASS_PACK) → startedAt", () => {
    expect(planCycleStart(plan("CLASS_PACK"), startedAt, null)).toBe(startedAt);
  });

  it("MONTHLY renovado → endsAt - 1 mes (inicio del ciclo recién pagado)", () => {
    const ends = new Date("2026-11-30T15:00:00Z");
    expect(
      planCycleStart(plan("MONTHLY"), startedAt, ends).toISOString(),
    ).toBe("2026-10-30T15:00:00.000Z");
  });

  it("endsAt - duración antes del alta → no retrocede antes de startedAt", () => {
    // Vigencia corta cargada a mano (20 días): el inicio del ciclo no
    // puede preceder al alta de la inscripción.
    const ends = new Date("2026-01-30T15:00:00Z");
    expect(planCycleStart(plan("MONTHLY"), startedAt, ends)).toEqual(
      startedAt,
    );
  });

  it("PERIOD → endsAt - periodDays", () => {
    const ends = new Date("2026-10-31T15:00:00Z");
    expect(planCycleStart(plan("PERIOD", 30), startedAt, ends).getTime()).toBe(
      ends.getTime() - 30 * DAY_MS,
    );
  });

  it("SINGLE → endsAt - 1 día", () => {
    const ends = new Date("2026-10-16T15:00:00Z");
    expect(planCycleStart(plan("SINGLE"), startedAt, ends).getTime()).toBe(
      ends.getTime() - DAY_MS,
    );
  });
});

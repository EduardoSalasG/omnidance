import { describe, it, expect } from "vitest";
import {
  BadgeAwarder,
  buildStreakWeeks,
  computePrimeTime,
  computeStreak,
  evaluateMission,
  leaderboard,
  maskSmallCount,
  primeWindow,
  weekIndex,
  PRIME_DEFAULT_CAPACITY,
  PUBLIC_COUNT_MIN,
} from "./rules";

const DAY = 24 * 3600 * 1000;
const WEEK = 7 * DAY;

// 1970-01-01 era jueves; el primer lunes alineado es 1969-12-29 (epoch -3d).
const MON_EPOCH = -3 * DAY;

describe("weekIndex", () => {
  it("semana 0 = lunes 1969-12-29 → domingo 1970-01-04 (UTC)", () => {
    expect(weekIndex(new Date(0))).toBe(0); // jueves 01-01
    expect(weekIndex(new Date(MON_EPOCH))).toBe(0); // lunes 29-12
    expect(weekIndex(new Date(MON_EPOCH + 6 * DAY))).toBe(0); // domingo 04-01
  });

  it("el lunes siguiente abre la semana 1", () => {
    expect(weekIndex(new Date(MON_EPOCH + 7 * DAY))).toBe(1);
    expect(weekIndex(new Date(MON_EPOCH + WEEK - 1))).toBe(0);
  });

  it("semanas recientes crecen monótonamente", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(weekIndex(new Date(now.getTime() + WEEK))).toBe(weekIndex(now) + 1);
  });
});

describe("buildStreakWeeks", () => {
  const now = new Date("2026-09-30T12:00:00Z"); // miércoles — semana actual en curso

  it("sin actividad → todo false", () => {
    const weeks = buildStreakWeeks([], now, 4);
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => !w)).toBe(true);
  });

  it("marca solo las semanas con actividad", () => {
    const dates = [
      now, // semana actual
      new Date(now.getTime() - 8 * DAY), // semana pasada
    ];
    const weeks = buildStreakWeeks(dates, now, 4);
    expect(weeks).toEqual([false, false, false, true, true]);
  });

  it("varias fechas en la misma semana colapsan en un true", () => {
    const dates = [now, new Date(now.getTime() - DAY)];
    const weeks = buildStreakWeeks(dates, now, 2);
    expect(weeks).toEqual([false, false, true]);
  });
});

describe("computeStreak", () => {
  it("array vacío → 0/0", () => {
    expect(computeStreak([])).toEqual({ currentWeeks: 0, bestWeeks: 0 });
  });

  it("todo false → 0/0", () => {
    expect(computeStreak([false, false, false])).toEqual({
      currentWeeks: 0,
      bestWeeks: 0,
    });
  });

  it("racha al final → current = trailing trues", () => {
    expect(computeStreak([false, true, true, true])).toEqual({
      currentWeeks: 3,
      bestWeeks: 3,
    });
  });

  it("semana actual en curso sin actividad no mata la racha", () => {
    // último elemento = semana actual (aún puede completarse)
    expect(computeStreak([false, true, true, false])).toEqual({
      currentWeeks: 2,
      bestWeeks: 2,
    });
  });

  it("una semana muerta antes de la actual sí corta la racha", () => {
    expect(computeStreak([true, true, false, false])).toEqual({
      currentWeeks: 0,
      bestWeeks: 2,
    });
  });

  it("best registra la racha histórica aunque la actual sea menor", () => {
    expect(
      computeStreak([true, true, true, false, true, false, true]),
    ).toEqual({ currentWeeks: 1, bestWeeks: 3 });
  });

  it("empate: best considera la racha en curso", () => {
    expect(computeStreak([true, false, true, true])).toEqual({
      currentWeeks: 2,
      bestWeeks: 2,
    });
  });

  it("una sola semana activa", () => {
    expect(computeStreak([true])).toEqual({ currentWeeks: 1, bestWeeks: 1 });
    expect(computeStreak([false])).toEqual({ currentWeeks: 0, bestWeeks: 0 });
  });
});

describe("primeWindow", () => {
  it("fin = próxima medianoche local tras startsAt; inicio = fin - minutos", () => {
    const startsAt = new Date("2026-10-03T21:00:00");
    const { start, end } = primeWindow(startsAt, 60);
    expect(end.getHours()).toBe(0);
    expect(end.getMinutes()).toBe(0);
    expect(end.getTime()).toBeGreaterThan(startsAt.getTime());
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000);
  });

  it("evento que empieza pasada medianoche usa la medianoche siguiente", () => {
    const startsAt = new Date("2026-10-03T01:30:00");
    const { end } = primeWindow(startsAt, 30);
    expect(end.getTime() - startsAt.getTime()).toBeGreaterThan(20 * 3600 * 1000);
  });
});

describe("computePrimeTime", () => {
  const window = {
    start: new Date("2026-10-03T23:00:00Z"),
    end: new Date("2026-10-04T00:00:00Z"),
  };
  const at = (iso: string) => ({ at: new Date(iso) });

  it("threshold = primeThreshold del evento cuando está configurado", () => {
    const r = computePrimeTime({
      sessions: [],
      window,
      capacity: 500,
      primeThreshold: 33,
    });
    expect(r.threshold).toBe(33);
  });

  it("threshold = ceil(capacity * 20%) sin override", () => {
    expect(
      computePrimeTime({
        sessions: [],
        window,
        capacity: 200,
        primeThreshold: null,
      }).threshold,
    ).toBe(40);
    expect(
      computePrimeTime({
        sessions: [],
        window,
        capacity: 105,
        primeThreshold: null,
      }).threshold,
    ).toBe(21); // ceil(21)
    expect(
      computePrimeTime({
        sessions: [],
        window,
        capacity: 103,
        primeThreshold: null,
      }).threshold,
    ).toBe(21); // ceil(20.6)
  });

  it("sin capacity ni override → default sobre aforo de referencia", () => {
    const r = computePrimeTime({
      sessions: [],
      window,
      capacity: null,
      primeThreshold: null,
    });
    expect(r.threshold).toBe(Math.ceil(PRIME_DEFAULT_CAPACITY * 0.2));
  });

  it("cuenta solo sesiones dentro de la ventana [start, end)", () => {
    const r = computePrimeTime({
      sessions: [
        at("2026-10-03T22:59:59Z"), // fuera (antes)
        at("2026-10-03T23:00:00Z"), // borde: incluida
        at("2026-10-03T23:30:00Z"),
        at("2026-10-04T00:00:00Z"), // borde: excluida
        at("2026-10-04T00:10:00Z"),
      ],
      window,
      capacity: 200,
      primeThreshold: null,
    });
    expect(r.current).toBe(2);
  });

  it("unlocked exactamente en el threshold (boundary)", () => {
    const mk = (n: number) =>
      computePrimeTime({
        sessions: Array.from({ length: n }, (_, i) =>
          at(`2026-10-03T23:${String(i).padStart(2, "0")}:00Z`),
        ),
        window,
        capacity: null,
        primeThreshold: 3,
      });
    expect(mk(2).unlocked).toBe(false);
    expect(mk(3).unlocked).toBe(true);
    expect(mk(4).unlocked).toBe(true);
  });

  it("happy hour multiplica sesiones dentro de su ventana", () => {
    const r = computePrimeTime({
      sessions: [
        at("2026-10-03T23:10:00Z"), // ×2 → 2
        at("2026-10-03T23:10:30Z"), // ×2 → 2
        at("2026-10-03T23:50:00Z"), // ×1 → 1
      ],
      window,
      capacity: null,
      primeThreshold: 5,
      happyHours: [
        {
          start: new Date("2026-10-03T23:00:00Z"),
          end: new Date("2026-10-03T23:30:00Z"),
          multiplier: 2,
        },
      ],
    });
    expect(r.current).toBe(5);
    expect(r.unlocked).toBe(true);
  });
});

describe("leaderboard", () => {
  const s = (inviterId: string, inviteeId: string) => ({
    inviterId,
    inviteeId,
  });

  it("agrupa por rol: inviter → leader, invitee → follower", () => {
    const r = leaderboard([s("a", "b"), s("a", "c"), s("c", "b")]);
    expect(r.leaders).toEqual([
      { personId: "a", count: 2 },
      { personId: "c", count: 1 },
    ]);
    expect(r.followers).toEqual([
      { personId: "b", count: 2 },
      { personId: "c", count: 1 },
    ]);
  });

  it("ordena desc por count; empate → personId asc (determinista)", () => {
    const r = leaderboard([s("b", "x"), s("a", "y"), s("c", "z")]);
    expect(r.leaders.map((l) => l.personId)).toEqual(["a", "b", "c"]);
  });

  it("corta en top N", () => {
    const sessions = Array.from({ length: 25 }, (_, i) =>
      s(`leader-${String(i).padStart(2, "0")}`, `f-${i}`),
    );
    const r = leaderboard(sessions, 20);
    expect(r.leaders).toHaveLength(20);
    expect(r.followers.length).toBeLessThanOrEqual(20);
  });

  it("sin sesiones → listas vacías", () => {
    expect(leaderboard([])).toEqual({ leaders: [], followers: [] });
  });
});

describe("maskSmallCount (privacidad k~5)", () => {
  it("count >= 5 → número real", () => {
    expect(maskSmallCount(5)).toBe(5);
    expect(maskSmallCount(12)).toBe(12);
  });
  it("count < 5 → '<5'", () => {
    expect(maskSmallCount(4)).toBe("<5");
    expect(maskSmallCount(0)).toBe("<5");
    expect(maskSmallCount(PUBLIC_COUNT_MIN - 1)).toBe("<5");
  });
});

describe("evaluateMission", () => {
  const activity = (over: Partial<Parameters<typeof evaluateMission>[2]>) => ({
    sessions: [],
    checkins: [],
    ...over,
  });

  describe("baila_diverso", () => {
    it("cuenta parejas distintas (repetidas no suman)", () => {
      const r = evaluateMission(
        "baila_diverso",
        { partners: 3 },
        activity({
          sessions: [
            { partnerId: "p1", styleId: null, at: new Date() },
            { partnerId: "p1", styleId: null, at: new Date() },
            { partnerId: "p2", styleId: null, at: new Date() },
          ],
        }),
      );
      expect(r).toEqual({ progress: 2, target: 3, completed: false });
    });

    it("completa al llegar al target", () => {
      const r = evaluateMission(
        "baila_diverso",
        { partners: 2 },
        activity({
          sessions: [
            { partnerId: "p1", styleId: null, at: new Date() },
            { partnerId: "p2", styleId: null, at: new Date() },
          ],
        }),
      );
      expect(r.completed).toBe(true);
      expect(r.progress).toBe(2);
    });

    it("target default = 5 sin config", () => {
      const r = evaluateMission("baila_diverso", null, activity({}));
      expect(r.target).toBe(5);
    });
  });

  describe("madrugador", () => {
    const early = new Date("2026-10-03T22:15:00"); // antes de 23:00 local
    const late = new Date("2026-10-04T00:30:00");

    it("check-in antes del cutoff → completed", () => {
      const r = evaluateMission(
        "madrugador",
        { before: "23:00" },
        activity({ checkins: [{ inAt: early }] }),
      );
      expect(r).toEqual({ progress: 1, target: 1, completed: true });
    });

    it("check-in después del cutoff → sin progreso", () => {
      const r = evaluateMission(
        "madrugador",
        { before: "23:00" },
        activity({ checkins: [{ inAt: late }] }),
      );
      expect(r.completed).toBe(false);
    });

    it("sin check-in, una sesión temprana también completa (fallback)", () => {
      const r = evaluateMission(
        "madrugador",
        { before: "23:00" },
        activity({
          sessions: [{ partnerId: "x", styleId: null, at: early }],
        }),
      );
      expect(r.completed).toBe(true);
    });

    it("cutoff configurable via config.before", () => {
      const r = evaluateMission(
        "madrugador",
        { before: "22:00" },
        activity({ checkins: [{ inAt: early }] }), // 22:15 > 22:00
      );
      expect(r.completed).toBe(false);
    });
  });

  describe("estilo_explorer", () => {
    it("cuenta estilos distintos (null ignorado, repetidos no suman)", () => {
      const r = evaluateMission(
        "estilo_explorer",
        { styles: 2 },
        activity({
          sessions: [
            { partnerId: "a", styleId: "salsa-cubana", at: new Date() },
            { partnerId: "b", styleId: "salsa-cubana", at: new Date() },
            { partnerId: "c", styleId: null, at: new Date() },
            { partnerId: "d", styleId: "bachata-sensual", at: new Date() },
          ],
        }),
      );
      expect(r).toEqual({ progress: 2, target: 2, completed: true });
    });

    it("un solo estilo → incompleta", () => {
      const r = evaluateMission(
        "estilo_explorer",
        { styles: 2 },
        activity({
          sessions: [{ partnerId: "a", styleId: "casino", at: new Date() }],
        }),
      );
      expect(r.completed).toBe(false);
      expect(r.progress).toBe(1);
    });
  });

  it("template desconocido → target 1, sin progreso", () => {
    expect(evaluateMission("no_existe", null, activity({}))).toEqual({
      progress: 0,
      target: 1,
      completed: false,
    });
  });
});

describe("BadgeAwarder", () => {
  const awarder = new BadgeAwarder();

  it("0 sesiones → ningún badge", () => {
    expect(awarder.evaluate({ confirmedSessions: 0 })).toEqual([]);
  });

  it("primera sesión confirmada → primera_bachata", () => {
    expect(awarder.evaluate({ confirmedSessions: 1 })).toEqual([
      "primera_bachata",
    ]);
  });

  it("9 sesiones → aún no bailarin_constante", () => {
    expect(awarder.evaluate({ confirmedSessions: 9 })).toEqual([
      "primera_bachata",
    ]);
  });

  it("10+ sesiones → ambos badges", () => {
    expect(awarder.evaluate({ confirmedSessions: 10 })).toEqual([
      "primera_bachata",
      "bailarin_constante",
    ]);
    expect(awarder.evaluate({ confirmedSessions: 500 })).toEqual([
      "primera_bachata",
      "bailarin_constante",
    ]);
  });

  it("no repite badges ya otorgados", () => {
    expect(
      awarder.evaluate({ confirmedSessions: 10 }, ["primera_bachata"]),
    ).toEqual(["bailarin_constante"]);
    expect(
      awarder.evaluate(
        { confirmedSessions: 10 },
        ["primera_bachata", "bailarin_constante"],
      ),
    ).toEqual([]);
  });
});

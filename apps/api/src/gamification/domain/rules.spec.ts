import { describe, it, expect } from "vitest";
import {
  BadgeAwarder,
  buildBadgeStats,
  buildStreakWeeks,
  computePrimeTime,
  computeReveal,
  computeStreak,
  evaluateMission,
  isEarlyCheckinAt,
  leaderboard,
  maskSmallCount,
  POINT_VALUES,
  primeWindow,
  selectFeaturedBadge,
  summarizePoints,
  weekIndex,
  CROWN_BADGE_KEY,
  MARATONISTA_SESSIONS,
  MARIPOSA_SOCIAL_PARTNERS,
  PRIME_DEFAULT_CAPACITY,
  PUBLIC_COUNT_MIN,
  REVEAL_BAYES_C,
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

  // ─── badges de conducta por noche (spec-gap-closure / badge-rules) ───

  it("madrugador: ≥1 check-in temprano; tardío no otorga", () => {
    const stats = (earlyCheckins: number) => ({
      confirmedSessions: 0,
      earlyCheckins,
    });
    expect(awarder.evaluate(stats(1))).toEqual(["madrugador"]);
    expect(awarder.evaluate(stats(0))).toEqual([]);
  });

  it(`maratonista: ${MARATONISTA_SESSIONS}+ sesiones en una noche`, () => {
    const stats = (maxSessionsInNight: number) => ({
      confirmedSessions: 0,
      maxSessionsInNight,
    });
    expect(
      awarder.evaluate(stats(MARATONISTA_SESSIONS - 1)),
    ).toEqual([]);
    expect(awarder.evaluate(stats(MARATONISTA_SESSIONS))).toEqual([
      "maratonista",
    ]);
  });

  it(`mariposa_social: ${MARIPOSA_SOCIAL_PARTNERS}+ parejas distintas en una noche`, () => {
    const stats = (maxDistinctPartnersInNight: number) => ({
      confirmedSessions: 0,
      maxDistinctPartnersInNight,
    });
    expect(
      awarder.evaluate(stats(MARIPOSA_SOCIAL_PARTNERS - 1)),
    ).toEqual([]);
    expect(awarder.evaluate(stats(MARIPOSA_SOCIAL_PARTNERS))).toEqual([
      "mariposa_social",
    ]);
  });

  it("stats nuevos ausentes → 0 (backward compatible)", () => {
    expect(awarder.evaluate({ confirmedSessions: 0 })).toEqual([]);
  });
});

describe("isEarlyCheckinAt", () => {
  it("antes del cutoff 23:00 → temprano; 00:xx post-medianoche → tarde", () => {
    expect(isEarlyCheckinAt(new Date("2026-10-03T22:59:00"))).toBe(true);
    expect(isEarlyCheckinAt(new Date("2026-10-03T23:01:00"))).toBe(false);
    expect(isEarlyCheckinAt(new Date("2026-10-04T00:30:00"))).toBe(false);
  });

  it("ventana empieza al mediodía (madrugada no es 'temprano')", () => {
    expect(isEarlyCheckinAt(new Date("2026-10-03T11:59:00"))).toBe(false);
    expect(isEarlyCheckinAt(new Date("2026-10-03T12:00:00"))).toBe(true);
  });

  it("cutoff configurable en minutos", () => {
    const at = new Date("2026-10-03T22:15:00");
    expect(isEarlyCheckinAt(at, 22 * 60)).toBe(false); // 22:15 > 22:00
    expect(isEarlyCheckinAt(at, 23 * 60)).toBe(true);
  });
});

describe("buildBadgeStats", () => {
  const s = (eventId: string, inviterId: string, inviteeId: string) => ({
    eventId,
    inviterId,
    inviteeId,
  });
  const me = "me";

  it("maxSessionsInNight = mayor count por evento (no el total)", () => {
    const stats = buildBadgeStats(
      [
        ...Array.from({ length: 4 }, (_, i) => s("e1", me, `p${i}`)),
        ...Array.from({ length: 7 }, (_, i) => s("e2", `x${i}`, me)),
      ],
      [],
      me,
    );
    expect(stats.confirmedSessions).toBe(11);
    expect(stats.maxSessionsInNight).toBe(7);
  });

  it("maxDistinctPartnersInNight ignora parejas repetidas", () => {
    const stats = buildBadgeStats(
      [
        s("e1", me, "a"),
        s("e1", me, "a"),
        s("e1", "b", me),
        s("e2", me, "a"),
      ],
      [],
      me,
    );
    expect(stats.maxSessionsInNight).toBe(3); // e1
    expect(stats.maxDistinctPartnersInNight).toBe(2); // e1: a,b
  });

  it("earlyCheckins cuenta solo check-ins dentro de la ventana", () => {
    const stats = buildBadgeStats(
      [],
      [
        { inAt: new Date("2026-10-03T22:15:00") },
        { inAt: new Date("2026-10-04T00:30:00") },
        { inAt: new Date("2026-10-03T21:00:00") },
      ],
      me,
    );
    expect(stats.earlyCheckins).toBe(2);
  });
});

describe("summarizePoints", () => {
  it("total + breakdown por reason", () => {
    expect(
      summarizePoints([
        { reason: "session_confirmed", points: 10 },
        { reason: "session_confirmed", points: 10 },
        { reason: "early_checkin", points: 15 },
      ]),
    ).toEqual({
      total: 35,
      byReason: { session_confirmed: 20, early_checkin: 15 },
    });
  });

  it("vacío → 0 / {}", () => {
    expect(summarizePoints([])).toEqual({ total: 0, byReason: {} });
  });

  it("POINT_VALUES calza la tabla del spec", () => {
    expect(POINT_VALUES).toEqual({
      session_confirmed: 10,
      rating_closed: 5,
      early_checkin: 15,
      mission_completed: 20,
    });
  });
});

describe("computeReveal", () => {
  const sess = (
    inviterId: string,
    inviteeId: string,
    ratings: { raterId: string; global: number }[],
    styleId: string | null = null,
  ) => ({ inviterId, inviteeId, styleId, ratings });

  it("score bayesiano (Σv + C·m)/(n+C), mínimo de muestra por candidato", () => {
    const C = REVEAL_BAYES_C;
    const r = computeReveal({
      sessions: [
        // leader L: 3 evals de 5 → sum 15
        sess("L", "f1", [{ raterId: "f1", global: 5 }]),
        sess("L", "f2", [{ raterId: "f2", global: 5 }]),
        sess("L", "f3", [{ raterId: "f3", global: 5 }]),
        // follower F: 3 evals de 5
        sess("l1", "F", [{ raterId: "l1", global: 5 }]),
        sess("l2", "F", [{ raterId: "l2", global: 5 }]),
        sess("l3", "F", [{ raterId: "l3", global: 5 }]),
        // low: solo 2 evals → fuera del reveal
        sess("low", "f4", [{ raterId: "f4", global: 5 }]),
        sess("low", "f5", [{ raterId: "f5", global: 5 }]),
      ],
    });
    // todos los ratings = 5 → m = 5 → score = (15+50)/13 = 5
    expect(r.eventMean).toBe(5);
    expect(r.bestLeader).toEqual({
      personId: "L",
      score: (15 + C * 5) / (3 + C),
      evaluations: 3,
    });
    expect(r.bestFollower?.personId).toBe("F");
    expect(r.bestLeader?.personId).not.toBe("low");
  });

  it("empate de score → personId asc (determinista)", () => {
    const mk = (inv: string, invs: string[]) =>
      invs.map((f) => sess(inv, f, [{ raterId: f, global: 4 }]));
    const r = computeReveal({
      sessions: [...mk("b-lead", ["x1", "x2", "x3"]), ...mk("a-lead", ["y1", "y2", "y3"])],
    });
    expect(r.bestLeader?.personId).toBe("a-lead");
  });

  it("PersonStyleRole gana sobre la inferencia inviter≈leader", () => {
    // "switch" es inviter en las 3 sesiones pero declara FOLLOWER → su
    // bucket es follower; no aparece como leader.
    const r = computeReveal({
      sessions: [
        sess("switch", "a", [{ raterId: "a", global: 5 }], "salsa"),
        sess("switch", "b", [{ raterId: "b", global: 5 }], "salsa"),
        sess("switch", "c", [{ raterId: "c", global: 5 }], "salsa"),
      ],
      styleRoles: [{ personId: "switch", styleId: "salsa", role: "FOLLOWER" }],
    });
    expect(r.bestLeader).toBeNull();
    expect(r.bestFollower?.personId).toBe("switch");
  });

  it("misma persona top en ambos roles → conserva el de más evaluaciones", () => {
    // "both": 4 evals como inviter (leader) + 3 como invitee (follower),
    // todo 5s → gana ambos; se queda leader y follower va al runner-up.
    const r = computeReveal({
      sessions: [
        ...["f1", "f2", "f3", "f4"].map((f) =>
          sess("both", f, [{ raterId: f, global: 5 }]),
        ),
        ...["l1", "l2", "l3"].map((l) =>
          sess(l, "both", [{ raterId: l, global: 5 }]),
        ),
        // runner-up follower: 3 evals de 4
        ...["m1", "m2", "m3"].map((l) =>
          sess(l, "F2", [{ raterId: l, global: 4 }]),
        ),
      ],
    });
    expect(r.bestLeader?.personId).toBe("both");
    expect(r.bestFollower?.personId).toBe("F2");
  });

  it("pareja de la noche: mutuo ≥4; falta una dirección → no aplica", () => {
    const r = computeReveal({
      sessions: [
        // mutuo 5/5
        sess("A", "B", [
          { raterId: "A", global: 5 },
          { raterId: "B", global: 5 },
        ]),
        // mutuo pero un lado <4 → descartado
        sess("C", "D", [
          { raterId: "C", global: 5 },
          { raterId: "D", global: 3 },
        ]),
        // una sola dirección → no es pareja
        sess("E", "F", [{ raterId: "E", global: 5 }]),
      ],
    });
    expect(r.coupleOfTheNight).toEqual({ aId: "A", bId: "B", score: 5 });
  });

  it("sin ratings suficientes → ganadores null pero eventMean presente", () => {
    const r = computeReveal({
      sessions: [sess("a", "b", [{ raterId: "a", global: 5 }])],
    });
    expect(r.eventMean).toBe(5);
    expect(r.bestLeader).toBeNull();
    expect(r.bestFollower).toBeNull();
    expect(r.coupleOfTheNight).toBeNull();
  });
});

describe("selectFeaturedBadge", () => {
  const now = new Date("2026-10-10T00:00:00Z");
  const badge = (
    key: string,
    over: Partial<{ featured: boolean; expiresAt: Date | null }> = {},
  ) => ({
    key,
    name: `Nombre ${key}`,
    featured: over.featured ?? false,
    expiresAt: over.expiresAt ?? null,
  });
  const future = new Date(now.getTime() + 3 * DAY);
  const past = new Date(now.getTime() - DAY);

  it("sin badges → null", () => {
    expect(selectFeaturedBadge([], now)).toBeNull();
  });

  it("featured no expirado gana sobre la corona", () => {
    const r = selectFeaturedBadge(
      [
        badge(CROWN_BADGE_KEY, { expiresAt: future }),
        badge("primera_bachata", { featured: true }),
      ],
      now,
    );
    expect(r?.key).toBe("primera_bachata");
  });

  it("featured expirado no cuenta → cae a la corona vigente", () => {
    const r = selectFeaturedBadge(
      [
        badge("primera_bachata", { featured: true, expiresAt: past }),
        badge(CROWN_BADGE_KEY, { expiresAt: future }),
      ],
      now,
    );
    expect(r?.key).toBe(CROWN_BADGE_KEY);
  });

  it("corona vigente sin featured → corona; corona expirada → null", () => {
    expect(
      selectFeaturedBadge([badge(CROWN_BADGE_KEY, { expiresAt: future })], now)
        ?.key,
    ).toBe(CROWN_BADGE_KEY);
    expect(
      selectFeaturedBadge([badge(CROWN_BADGE_KEY, { expiresAt: past })], now),
    ).toBeNull();
  });
});

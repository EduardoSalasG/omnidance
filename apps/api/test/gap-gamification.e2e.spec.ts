import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { GamificationModule } from "../src/gamification/gamification.module";
import { GamificationService } from "../src/gamification/domain/gamification.service";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { QrModule } from "../src/qr/qr.module";
import { PrismaService } from "../src/prisma.service";

/**
 * e2e del change spec-gap-closure (lado gamificación):
 * - GET /api/events/:id/prime-time/reveal (score bayesiano, pareja, corona)
 * - GET /api/gamification/me/points (ledger de temporada)
 * - badges madrugador / maratonista / mariposa_social
 * - retroDeclared:false en contador Prime Time y reveal
 * - featuredBadge en GET /api/qr/mine (shape; el wiring del provider queda
 *   documentado para el padre — QrModule aún no importa GamificationModule)
 */
describe("gap-gamification e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let gamification: GamificationService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  const ids = {
    venueId: "",
    eventRevealId: "", // LIVE unlocked — reveal completo
    eventRetroId: "", // LIVE, retro en ventana → no desbloquea
    eventLowEvalId: "", // LIVE unlocked, candidato solo con evals retro
    eventBadgesId: "",
    seasonId: "",
    oldSeasonId: "",
    crownBadgeId: "",
    // personas
    meId: "",
    meSession: "",
    emptyId: "",
    emptySession: "",
    leaderId: "",
    followerId: "",
    almostId: "",
    coupleAId: "",
    coupleBId: "",
    retroStarId: "",
    validFollowerId: "",
    marathonerId: "",
    marathonerSession: "",
    socialiteId: "",
    socialiteSession: "",
    earlyBirdId: "",
    earlyBirdSession: "",
    lateOwlId: "",
    lateOwlSession: "",
    extraIds: [] as string[],
  };

  const get = (path: string, session?: string) =>
    fetch(`${baseUrl}${path}`, {
      headers: session ? { cookie: `omnidance_session=${session}` } : {},
    });

  const DAY = 24 * 3600 * 1000;

  /** ayer a la hora local dada (evento "de anoche" — ventana ya cerró). */
  const yesterdayAt = (h: number, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(h, m, 0, 0);
    return d;
  };

  const session = (data: {
    eventId: string;
    inviterId: string;
    inviteeId: string;
    at: Date;
    status?: "CONFIRMED" | "RATED";
    retro?: boolean;
  }) =>
    prisma.danceSession.create({
      data: {
        eventId: data.eventId,
        inviterId: data.inviterId,
        inviteeId: data.inviteeId,
        status: data.status ?? "CONFIRMED",
        retroDeclared: data.retro ?? false,
        scannedAt: data.at,
        confirmedAt: data.at,
      },
    });

  const rated = async (data: {
    eventId: string;
    inviterId: string;
    inviteeId: string;
    at: Date;
    retro?: boolean;
    ratings: { raterId: string; global: number }[];
  }) => {
    const s = await session({ ...data, status: "RATED" });
    for (const r of data.ratings) {
      await prisma.sessionRating.create({
        data: { sessionId: s.id, raterId: r.raterId, global: r.global },
      });
    }
    return s;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GamificationModule, AuthModule, QrModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    gamification = app.get(GamificationService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    const suffix = Date.now().toString(36);
    const mkPerson = (tag: string) =>
      prisma.person.create({
        data: {
          name: `Gap ${tag} ${suffix}`,
          email: `gap-${tag}-${suffix}@test.cl`,
          roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
        },
      });

    // ─── catálogo de badges (compartido con seed/otros specs) ───
    await prisma.badge.createMany({
      skipDuplicates: true,
      data: [
        { key: "primera_bachata", name: "Primera bachata", category: "MILESTONE" },
        { key: "bailarin_constante", name: "Bailarín constante", category: "MILESTONE" },
        { key: "madrugador", name: "Madrugador", category: "CONDUCT" },
        { key: "maratonista", name: "Maratonista", category: "CONDUCT" },
        { key: "mariposa_social", name: "Mariposa social", category: "CONDUCT" },
        { key: "prime_time_crown", name: "Corona Prime Time", category: "TEMPORARY_STATUS" },
      ],
    });
    const crown = await prisma.badge.findUnique({
      where: { key: "prime_time_crown" },
    });
    ids.crownBadgeId = crown!.id;

    // ─── infra ───
    const venue = await prisma.venue.create({
      data: { name: `Venue Gap ${suffix}`, capacity: 100 },
    });
    ids.venueId = venue.id;

    const mkEvent = (name: string, capacity: number | null) =>
      prisma.event.create({
        data: {
          venueId: venue.id,
          name: `${name} ${suffix}`,
          status: "LIVE",
          capacity,
          startsAt: yesterdayAt(21),
          endsAt: new Date(),
        },
      });
    const [evReveal, evRetro, evLowEval, evBadges] = await Promise.all([
      mkEvent("Reveal", 20), // threshold = ceil(20*0.2) = 4
      mkEvent("Retro", 20),
      mkEvent("LowEval", 20),
      mkEvent("Badges", null),
    ]);
    ids.eventRevealId = evReveal.id;
    ids.eventRetroId = evRetro.id;
    ids.eventLowEvalId = evLowEval.id;
    ids.eventBadgesId = evBadges.id;

    // ─── personas ───
    const [
      me,
      empty,
      leader,
      follower,
      almost,
      coupleA,
      coupleB,
      retroStar,
      validFollower,
      marathoner,
      socialite,
      earlyBird,
      lateOwl,
      ...extras
    ] = await Promise.all([
      mkPerson("me"),
      mkPerson("empty"),
      mkPerson("leader"),
      mkPerson("follower"),
      mkPerson("almost"),
      mkPerson("coupleA"),
      mkPerson("coupleB"),
      mkPerson("retrostar"),
      mkPerson("validfollower"),
      mkPerson("marathoner"),
      mkPerson("socialite"),
      mkPerson("earlybird"),
      mkPerson("lateowl"),
      ...Array.from({ length: 10 }, (_, i) => mkPerson(`e${i}`)),
    ]);
    ids.meId = me.id;
    ids.emptyId = empty.id;
    ids.leaderId = leader.id;
    ids.followerId = follower.id;
    ids.almostId = almost.id;
    ids.coupleAId = coupleA.id;
    ids.coupleBId = coupleB.id;
    ids.retroStarId = retroStar.id;
    ids.validFollowerId = validFollower.id;
    ids.marathonerId = marathoner.id;
    ids.socialiteId = socialite.id;
    ids.earlyBirdId = earlyBird.id;
    ids.lateOwlId = lateOwl.id;
    ids.extraIds = extras.map((p) => p.id);
    const e = ids.extraIds;

    ids.meSession = await auth.issueSession(me.id);
    ids.emptySession = await auth.issueSession(empty.id);
    ids.marathonerSession = await auth.issueSession(marathoner.id);
    ids.socialiteSession = await auth.issueSession(socialite.id);
    ids.earlyBirdSession = await auth.issueSession(earlyBird.id);
    ids.lateOwlSession = await auth.issueSession(lateOwl.id);

    // ─── eventReveal: desbloqueado (4 en ventana) + ratings ───
    // contador: 4 sesiones en ventana 23:30→00:00; la retro de las 23:45
    // NO debe contar (retroDeclared:false en la query del repo).
    for (let i = 0; i < 4; i++) {
      await session({
        eventId: evReveal.id,
        inviterId: e[i * 2],
        inviteeId: e[i * 2 + 1],
        at: yesterdayAt(23, 35 + i * 5),
      });
    }
    // leader: 4 evaluaciones de 5 como inviter → mejor leader
    for (let i = 0; i < 4; i++) {
      await rated({
        eventId: evReveal.id,
        inviterId: leader.id,
        inviteeId: e[i],
        at: yesterdayAt(22, i * 5),
        ratings: [{ raterId: e[i], global: 5 }],
      });
    }
    // follower: 3 evaluaciones de 5 como invitee → mejor follower
    for (let i = 4; i < 7; i++) {
      await rated({
        eventId: evReveal.id,
        inviterId: e[i],
        inviteeId: follower.id,
        at: yesterdayAt(22, 20 + i),
        ratings: [{ raterId: e[i], global: 5 }],
      });
    }
    // almost: solo 2 evaluaciones legítimas (5 y 4) + 1 retro de 5 que no
    // cuenta → queda bajo el mínimo de 3 y fuera del reveal.
    await rated({
      eventId: evReveal.id,
      inviterId: almost.id,
      inviteeId: e[8],
      at: yesterdayAt(22, 45),
      ratings: [{ raterId: e[8], global: 5 }],
    });
    await rated({
      eventId: evReveal.id,
      inviterId: almost.id,
      inviteeId: e[9],
      at: yesterdayAt(22, 50),
      ratings: [{ raterId: e[9], global: 4 }],
    });
    await rated({
      eventId: evReveal.id,
      inviterId: almost.id,
      inviteeId: e[7],
      at: yesterdayAt(23, 45), // en ventana pero retro → ni contador ni reveal
      retro: true,
      ratings: [{ raterId: e[7], global: 5 }],
    });
    // pareja de la noche: mutuo 5/5
    await rated({
      eventId: evReveal.id,
      inviterId: coupleA.id,
      inviteeId: coupleB.id,
      at: yesterdayAt(22, 55),
      ratings: [
        { raterId: coupleA.id, global: 5 },
        { raterId: coupleB.id, global: 5 },
      ],
    });

    // ─── eventRetro: 3 normales + 1 retro en ventana → no desbloquea ───
    for (let i = 0; i < 3; i++) {
      await session({
        eventId: evRetro.id,
        inviterId: e[i * 2],
        inviteeId: e[i * 2 + 1],
        at: yesterdayAt(23, 35 + i * 5),
      });
    }
    await session({
      eventId: evRetro.id,
      inviterId: e[6],
      inviteeId: e[7],
      at: yesterdayAt(23, 50),
      retro: true,
    });

    // ─── eventLowEval: unlocked; candidato leader solo con evals retro ───
    for (let i = 0; i < 4; i++) {
      await session({
        eventId: evLowEval.id,
        inviterId: e[i * 2],
        inviteeId: e[i * 2 + 1],
        at: yesterdayAt(23, 35 + i * 5),
      });
    }
    // retroStar: 2 evals normales + 1 retro → n=2 → bestLeader null
    for (const [i, ex] of [0, 1].entries()) {
      await rated({
        eventId: evLowEval.id,
        inviterId: retroStar.id,
        inviteeId: e[ex],
        at: yesterdayAt(22, 10 + i),
        ratings: [{ raterId: e[ex], global: 5 }],
      });
    }
    await rated({
      eventId: evLowEval.id,
      inviterId: retroStar.id,
      inviteeId: e[2],
      at: yesterdayAt(22, 30),
      retro: true,
      ratings: [{ raterId: e[2], global: 5 }],
    });
    // validFollower: 3 evals legítimas → bestFollower sí aparece
    for (let i = 3; i < 6; i++) {
      await rated({
        eventId: evLowEval.id,
        inviterId: e[i],
        inviteeId: validFollower.id,
        at: yesterdayAt(22, 40 + i),
        ratings: [{ raterId: e[i], global: 5 }],
      });
    }

    // ─── eventBadges: conducta por noche ───
    // marathoner: 15 sesiones con solo 3 parejas distintas → maratonista,
    // no mariposa_social.
    for (let i = 0; i < 15; i++) {
      await session({
        eventId: evBadges.id,
        inviterId: marathoner.id,
        inviteeId: e[i % 3],
        at: yesterdayAt(21, i * 10),
      });
    }
    // socialite: 8 sesiones con 8 parejas distintas → mariposa_social,
    // no maratonista.
    for (let i = 0; i < 8; i++) {
      await session({
        eventId: evBadges.id,
        inviterId: e[i],
        inviteeId: socialite.id,
        at: yesterdayAt(22, i * 5),
      });
    }
    // earlyBird / lateOwl: check-in antes/después del cutoff 23:00.
    await prisma.checkin.create({
      data: {
        eventId: evBadges.id,
        personId: earlyBird.id,
        inAt: yesterdayAt(22, 15),
      },
    });
    await prisma.checkin.create({
      data: {
        eventId: evBadges.id,
        personId: lateOwl.id,
        inAt: new Date(new Date().setHours(0, 30, 0, 0)),
      },
    });

    // ─── seasons para puntos ───
    const [season, oldSeason] = await Promise.all([
      prisma.season.create({
        data: {
          name: `Season ${suffix}`,
          startsAt: new Date(Date.now() - 7 * DAY),
          endsAt: new Date(Date.now() + 30 * DAY),
        },
      }),
      prisma.season.create({
        data: {
          name: `Old ${suffix}`,
          startsAt: new Date(Date.now() - 90 * DAY),
          endsAt: new Date(Date.now() - 60 * DAY),
        },
      }),
    ]);
    ids.seasonId = season.id;
    ids.oldSeasonId = oldSeason.id;
    // entrada de otra temporada — no debe contar en el total activo
    await prisma.pointLedger.create({
      data: {
        personId: me.id,
        seasonId: oldSeason.id,
        points: 999,
        reason: "session_confirmed",
        refType: "session",
        refId: "gap-old-season",
      },
    });
  });

  afterAll(async () => {
    const personIds = [
      ids.meId,
      ids.emptyId,
      ids.leaderId,
      ids.followerId,
      ids.almostId,
      ids.coupleAId,
      ids.coupleBId,
      ids.retroStarId,
      ids.validFollowerId,
      ids.marathonerId,
      ids.socialiteId,
      ids.earlyBirdId,
      ids.lateOwlId,
      ...ids.extraIds,
    ].filter(Boolean);
    const eventIds = [
      ids.eventRevealId,
      ids.eventRetroId,
      ids.eventLowEvalId,
      ids.eventBadgesId,
    ];
    await prisma.sessionRating.deleteMany({
      where: { session: { eventId: { in: eventIds } } },
    });
    await prisma.danceSession.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.checkin.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.personBadge.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.pointLedger.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.season.deleteMany({
      where: { id: { in: [ids.seasonId, ids.oldSeasonId] } },
    });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await app.close();
  });

  // ─── Prime Time reveal ───

  describe("GET /api/events/:eventId/prime-time/reveal", () => {
    it("público: sin sesión responde 200", async () => {
      const res = await get(`/api/events/${ids.eventRevealId}/prime-time/reveal`);
      expect(res.status).toBe(200);
    });

    it("evento sin desbloqueo → {unlocked:false} (retro no cuenta)", async () => {
      // 3 normales + 1 retro en ventana; threshold 4 → locked
      const prime = await (
        await get(`/api/events/${ids.eventRetroId}/prime-time`)
      ).json();
      expect(prime.current).toBe(3);
      expect(prime.unlocked).toBe(false);

      const res = await get(`/api/events/${ids.eventRetroId}/prime-time/reveal`);
      const body = await res.json();
      expect(body.unlocked).toBe(false);
    });

    it("unlocked → bestLeader/bestFollower por score bayesiano + pareja", async () => {
      const res = await get(`/api/events/${ids.eventRevealId}/prime-time/reveal`);
      const body = await res.json();
      expect(body.unlocked).toBe(true);
      expect(body.revealed).toBe(true);

      expect(body.bestLeader.personId).toBe(ids.leaderId);
      expect(body.bestLeader.name).toContain("Gap leader");
      expect(body.bestLeader.evaluations).toBe(4);
      expect(body.bestLeader.score).toBeGreaterThan(0);

      expect(body.bestFollower.personId).toBe(ids.followerId);
      expect(body.bestFollower.evaluations).toBe(3);

      // "almost" (2 evals legítimas + 1 retro) queda fuera del reveal
      expect(body.bestLeader.personId).not.toBe(ids.almostId);

      const coupleIds = [
        body.coupleOfTheNight.a.personId,
        body.coupleOfTheNight.b.personId,
      ].sort();
      expect(coupleIds).toEqual([ids.coupleAId, ids.coupleBId].sort());
      expect(body.coupleOfTheNight.score).toBe(5);
    });

    it("otorga corona PersonBadge(+7d) idempotente a los ganadores", async () => {
      const res = await get(`/api/events/${ids.eventRevealId}/prime-time/reveal`);
      expect(res.status).toBe(200);

      for (const winnerId of [ids.leaderId, ids.followerId]) {
        const badges = await prisma.personBadge.findMany({
          where: { personId: winnerId, badgeId: ids.crownBadgeId },
        });
        expect(badges).toHaveLength(1);
        const sevenDays = Date.now() + 6 * 24 * 3600 * 1000;
        expect(badges[0].expiresAt!.getTime()).toBeGreaterThan(sevenDays);
      }

      // segundo reveal → mismos ganadores, sin duplicar coronas
      const again = await (
        await get(`/api/events/${ids.eventRevealId}/prime-time/reveal`)
      ).json();
      expect(again.bestLeader.personId).toBe(ids.leaderId);
      const all = await prisma.personBadge.findMany({
        where: {
          badgeId: ids.crownBadgeId,
          personId: { in: [ids.leaderId, ids.followerId] },
        },
      });
      expect(all).toHaveLength(2);
    });

    it("retro no alimenta el reveal: candidato sin muestra → null", async () => {
      const res = await get(
        `/api/events/${ids.eventLowEvalId}/prime-time/reveal`,
      );
      const body = await res.json();
      expect(body.unlocked).toBe(true);
      expect(body.revealed).toBe(true);
      // retroStar: 2 evals normales + 1 retro → n=2 < 3 → sin leader
      expect(body.bestLeader).toBeNull();
      expect(body.bestFollower.personId).toBe(ids.validFollowerId);
    });

    it("evento inexistente → 404", async () => {
      const res = await get("/api/events/no-existe/prime-time/reveal");
      expect(res.status).toBe(404);
    });
  });

  // ─── Season points ───

  describe("GET /api/gamification/me/points + accruePoints", () => {
    it("sin sesión → 401", async () => {
      const res = await get("/api/gamification/me/points");
      expect(res.status).toBe(401);
    });

    it("accruePoints es idempotente por (personId, reason, refType, refId)", async () => {
      expect(
        await gamification.accruePoints(
          ids.meId,
          "session_confirmed",
          "session",
          "gap-s1",
        ),
      ).toBe(true);
      expect(
        await gamification.accruePoints(
          ids.meId,
          "session_confirmed",
          "session",
          "gap-s1",
        ),
      ).toBe(false); // mismo ref → no duplica
      expect(
        await gamification.accruePoints(
          ids.meId,
          "session_confirmed",
          "session",
          "gap-s2",
        ),
      ).toBe(true); // otro ref → sí acredita
    });

    it("total + byReason de la season activa; excluye otras temporadas", async () => {
      await gamification.accruePoints(
        ids.meId,
        "rating_closed",
        "session",
        "gap-s1",
      );
      await gamification.accruePoints(
        ids.meId,
        "early_checkin",
        "checkin",
        "gap-c1",
      );
      await gamification.accruePoints(
        ids.meId,
        "mission_completed",
        "mission",
        "gap-m1",
      );

      const res = await get("/api/gamification/me/points", ids.meSession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.seasonId).toBe(ids.seasonId);
      // 2×session_confirmed + rating_closed + early_checkin + mission_completed
      expect(body.total).toBe(10 + 10 + 5 + 15 + 20);
      expect(body.byReason).toEqual({
        session_confirmed: 20,
        rating_closed: 5,
        early_checkin: 15,
        mission_completed: 20,
      });
      // la entrada de la season antigua (999 pts) quedó fuera
      expect(body.total).not.toBe(999);
    });

    it("usuario sin puntos → total 0", async () => {
      const res = await get("/api/gamification/me/points", ids.emptySession);
      const body = await res.json();
      expect(body.total).toBe(0);
      expect(body.byReason).toEqual({});
    });
  });

  // ─── Badge rules ───

  describe("badges de conducta por noche (GET /api/gamification/me/badges)", () => {
    const keysOf = async (session: string) => {
      const res = await get("/api/gamification/me/badges", session);
      expect(res.status).toBe(200);
      return (await res.json()).map(
        (b: { badge: { key: string } }) => b.badge.key,
      );
    };

    it("maratonista: 15 sesiones en la noche (3 parejas → sin mariposa)", async () => {
      const keys = await keysOf(ids.marathonerSession);
      expect(keys).toContain("maratonista");
      expect(keys).not.toContain("mariposa_social");
    });

    it("mariposa_social: 8 parejas distintas (8 sesiones → sin maratonista)", async () => {
      const keys = await keysOf(ids.socialiteSession);
      expect(keys).toContain("mariposa_social");
      expect(keys).not.toContain("maratonista");
    });

    it("madrugador: check-in antes de 23:00; tardío no otorga", async () => {
      expect(await keysOf(ids.earlyBirdSession)).toContain("madrugador");
      expect(await keysOf(ids.lateOwlSession)).not.toContain("madrugador");
    });

    it("sin conducta → sin badges nuevos (idempotente)", async () => {
      const keys = await keysOf(ids.emptySession);
      expect(keys).not.toContain("madrugador");
      expect(keys).not.toContain("maratonista");
      expect(keys).not.toContain("mariposa_social");
    });
  });

  // ─── Featured badge en QR ───

  describe("featuredBadge", () => {
    it("GET /api/qr/mine incluye featuredBadge en la respuesta", async () => {
      const res = await get("/api/qr/mine", ids.meSession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeTruthy();
      // GamificationService llega @Optional: QrModule aún no importa
      // GamificationModule → null hasta que el padre cablee el import.
      expect(body).toHaveProperty("featuredBadge");
    });

    it("featuredBadgeFor: featured > corona vigente > null", async () => {
      const first = await prisma.badge.findUnique({
        where: { key: "primera_bachata" },
      });
      // 1) featured elegido por la persona
      await prisma.personBadge.create({
        data: { personId: ids.meId, badgeId: first!.id, featured: true },
      });
      expect((await gamification.featuredBadgeFor(ids.meId))?.key).toBe(
        "primera_bachata",
      );
      // 2) corona vigente no desplaza al featured
      await prisma.personBadge.create({
        data: {
          personId: ids.meId,
          badgeId: ids.crownBadgeId,
          expiresAt: new Date(Date.now() + 3 * DAY),
        },
      });
      expect((await gamification.featuredBadgeFor(ids.meId))?.key).toBe(
        "primera_bachata",
      );
      // 3) sin featured → corona vigente
      await prisma.personBadge.update({
        where: {
          personId_badgeId: { personId: ids.meId, badgeId: first!.id },
        },
        data: { featured: false },
      });
      expect((await gamification.featuredBadgeFor(ids.meId))?.key).toBe(
        "prime_time_crown",
      );
      // 4) corona expirada → null
      await prisma.personBadge.update({
        where: {
          personId_badgeId: {
            personId: ids.meId,
            badgeId: ids.crownBadgeId,
          },
        },
        data: { expiresAt: new Date(Date.now() - DAY) },
      });
      expect(await gamification.featuredBadgeFor(ids.meId)).toBeNull();
    });
  });
});

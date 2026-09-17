import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { GamificationModule } from "../src/gamification/gamification.module";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { PrismaService } from "../src/prisma.service";

describe("gamification e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  const ids = {
    venueId: "",
    eventLiveId: "", // LIVE — leaderboard/prime-time visibles
    eventDraftId: "", // PUBLISHED — leaderboard oculto
    style1Id: "",
    style2Id: "",
    // personas
    meId: "",
    topLeaderId: "",
    lowLeaderId: "",
    topFollowerId: "",
    extraIds: [] as string[],
    emptyId: "", // persona sin actividad
    // sesiones http
    meSession: "",
    emptySession: "",
    // misiones
    diversoMissionId: "",
    madrugadorMissionId: "",
    explorerMissionId: "",
    templateIds: [] as string[],
  };

  const get = (path: string, session?: string) =>
    fetch(`${baseUrl}${path}`, {
      headers: session ? { cookie: `omnidance_session=${session}` } : {},
    });

  const post = (path: string, body: unknown, session?: string) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(session ? { cookie: `omnidance_session=${session}` } : {}),
      },
      body: JSON.stringify(body),
    });

  const DAY = 24 * 3600 * 1000;
  const WEEK = 7 * DAY;

  /** ayer a la hora local dada (el evento "de anoche" para prime-time). */
  const yesterdayAt = (h: number, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(h, m, 0, 0);
    return d;
  };

  const confirmed = (data: {
    eventId: string;
    inviterId: string;
    inviteeId: string;
    at: Date;
    styleId?: string | null;
  }) =>
    prisma.danceSession.create({
      data: {
        eventId: data.eventId,
        inviterId: data.inviterId,
        inviteeId: data.inviteeId,
        styleId: data.styleId ?? null,
        status: "CONFIRMED",
        scannedAt: data.at,
        confirmedAt: data.at,
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GamificationModule, AuthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    const suffix = Date.now().toString(36);

    // ─── infraestructura ───
    const venue = await prisma.venue.create({
      data: { name: `Venue Gamif ${suffix}`, capacity: 100 },
    });
    ids.venueId = venue.id;

    // evento LIVE de "anoche": ventana prime = 23:30→00:00 (happyHourMinutes 30)
    const eventLive = await prisma.event.create({
      data: {
        venueId: venue.id,
        name: `Social LIVE ${suffix}`,
        status: "LIVE",
        capacity: 20, // threshold default = ceil(20*0.2) = 4
        startsAt: yesterdayAt(21),
        endsAt: new Date(), // ya debería haber cerrado
      },
    });
    ids.eventLiveId = eventLive.id;

    const eventDraft = await prisma.event.create({
      data: {
        venueId: venue.id,
        name: `Social PUBLISHED ${suffix}`,
        status: "PUBLISHED",
        startsAt: new Date(Date.now() + DAY),
        endsAt: new Date(Date.now() + DAY + 5 * 3600 * 1000),
      },
    });
    ids.eventDraftId = eventDraft.id;

    const style1 = await prisma.style.create({
      data: { name: `casino-${suffix}`, genre: "CUBANO" },
    });
    const style2 = await prisma.style.create({
      data: { name: `sensual-${suffix}`, genre: "BACHATA" },
    });
    ids.style1Id = style1.id;
    ids.style2Id = style2.id;

    // ─── personas ───
    const mkPerson = (tag: string) =>
      prisma.person.create({
        data: {
          name: `Gamif ${tag} ${suffix}`,
          email: `gamif-${tag}-${suffix}@test.cl`,
          roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
        },
      });

    const [me, topLeader, lowLeader, topFollower, empty] = await Promise.all([
      mkPerson("me"),
      mkPerson("topleader"),
      mkPerson("lowleader"),
      mkPerson("topfollower"),
      mkPerson("empty"),
    ]);
    ids.meId = me.id;
    ids.topLeaderId = topLeader.id;
    ids.lowLeaderId = lowLeader.id;
    ids.topFollowerId = topFollower.id;
    ids.emptyId = empty.id;
    ids.meSession = await auth.issueSession(me.id);
    ids.emptySession = await auth.issueSession(empty.id);

    const extras = await Promise.all(
      ["e1", "e2", "e3", "e4", "e5", "e6"].map(mkPerson),
    );
    ids.extraIds = extras.map((p) => p.id);

    // ─── badges catálogo — global compartido (también lo siembra el seed) ───
    await prisma.badge.createMany({
      skipDuplicates: true,
      data: [
        { key: "primera_bachata", name: "Primera bachata", category: "MILESTONE" },
        {
          key: "bailarin_constante",
          name: "Bailarín constante",
          category: "MILESTONE",
          rarity: "SCARCE",
        },
      ],
    });

    // ─── misiones (3 templates) ───
    const tplDiverso = await prisma.missionTemplate.create({
      data: {
        key: "baila_diverso",
        name: "Baila diverso",
        description: "Baila con N parejas distintas",
      },
    });
    const tplMadrugador = await prisma.missionTemplate.create({
      data: {
        key: "madrugador",
        name: "Madrugador",
        description: "Check-in antes de la hora límite",
      },
    });
    const tplExplorer = await prisma.missionTemplate.create({
      data: {
        key: "estilo_explorer",
        name: "Explorador de estilos",
        description: "Sesiones en ≥2 estilos",
      },
    });
    ids.templateIds = [tplDiverso.id, tplMadrugador.id, tplExplorer.id];

    const [mDiverso, mMadrugador, mExplorer] = await Promise.all([
      prisma.mission.create({
        data: {
          eventId: eventLive.id,
          templateId: tplDiverso.id,
          config: { partners: 3 },
        },
      }),
      prisma.mission.create({
        data: {
          eventId: eventLive.id,
          templateId: tplMadrugador.id,
          config: { before: "23:00" },
        },
      }),
      prisma.mission.create({
        data: {
          eventId: eventLive.id,
          templateId: tplExplorer.id,
          config: { styles: 2 },
        },
      }),
    ]);
    ids.diversoMissionId = mDiverso.id;
    ids.madrugadorMissionId = mMadrugador.id;
    ids.explorerMissionId = mExplorer.id;

    // ─── sesiones CONFIRMED en el evento LIVE ───
    // topLeader: 6 como inviter → count real 6 (≥5 visible)
    for (let i = 0; i < 6; i++) {
      await confirmed({
        eventId: eventLive.id,
        inviterId: topLeader.id,
        inviteeId: extras[i].id,
        at: yesterdayAt(22, i),
        styleId: style1.id,
      });
    }
    // topFollower: 6 como invitee (invitada por extras)
    for (let i = 0; i < 6; i++) {
      await confirmed({
        eventId: eventLive.id,
        inviterId: extras[i].id,
        inviteeId: topFollower.id,
        at: yesterdayAt(22, 10 + i),
        styleId: style1.id,
      });
    }
    // lowLeader: 2 como inviter → "<5"
    await confirmed({
      eventId: eventLive.id,
      inviterId: lowLeader.id,
      inviteeId: extras[0].id,
      at: yesterdayAt(22, 20),
    });
    await confirmed({
      eventId: eventLive.id,
      inviterId: lowLeader.id,
      inviteeId: extras[1].id,
      at: yesterdayAt(22, 25),
    });

    // "me": 3 parejas distintas + 2 estilos (misiones diverso/explorer)
    await confirmed({
      eventId: eventLive.id,
      inviterId: me.id,
      inviteeId: extras[0].id,
      at: yesterdayAt(22, 30),
      styleId: style1.id,
    });
    await confirmed({
      eventId: eventLive.id,
      inviterId: me.id,
      inviteeId: extras[1].id,
      at: yesterdayAt(22, 40),
      styleId: style2.id,
    });
    await confirmed({
      eventId: eventLive.id,
      inviterId: extras[2].id,
      inviteeId: me.id,
      at: yesterdayAt(22, 50),
      styleId: style2.id,
    });

    // prime-time: 4 sesiones CONFIRMED dentro de la ventana 23:30→00:00
    // (threshold = 4 → unlocked al llegar exacto al umbral)
    const inWindow = [35, 40, 45, 50];
    for (let i = 0; i < 4; i++) {
      await confirmed({
        eventId: eventLive.id,
        inviterId: extras[i].id,
        inviteeId: extras[(i + 1) % 6].id,
        at: yesterdayAt(23, inWindow[i]),
      });
    }
    // fuera de ventana: antes (22:59) y después (00:30) — no cuentan
    await confirmed({
      eventId: eventLive.id,
      inviterId: extras[4].id,
      inviteeId: extras[5].id,
      at: yesterdayAt(22, 59),
    });
    await confirmed({
      eventId: eventLive.id,
      inviterId: extras[5].id,
      inviteeId: extras[4].id,
      at: new Date(new Date().setHours(0, 30, 0, 0)),
    });

    // sesiones DECLINED/INVITED no cuentan para nada
    await prisma.danceSession.create({
      data: {
        eventId: eventLive.id,
        inviterId: extras[0].id,
        inviteeId: extras[1].id,
        status: "DECLINED",
        scannedAt: yesterdayAt(23, 45),
      },
    });

    // evento PUBLISHED con sesiones — leaderboard debe quedar oculto
    await confirmed({
      eventId: eventDraft.id,
      inviterId: topLeader.id,
      inviteeId: extras[0].id,
      at: new Date(),
    });

    // ─── actividad de "me" para streak/badges/madrugador ───
    // check-in temprano ayer 22:15 (< 23:00) → madrugador
    await prisma.checkin.create({
      data: {
        eventId: eventLive.id,
        personId: me.id,
        inAt: yesterdayAt(22, 15),
      },
    });
    // streak: semana actual (checkin de hoy) + semana -1 + semana -2 activas,
    // semana -3 muerta, semanas -5/-4 activas → current 3, best 3
    await prisma.checkin.create({
      data: { eventId: eventDraft.id, personId: me.id, inAt: new Date() },
    });
    await prisma.checkin.create({
      data: {
        eventId: eventDraft.id,
        personId: me.id,
        inAt: new Date(Date.now() - WEEK),
      },
    });
    await prisma.checkin.create({
      data: {
        eventId: eventDraft.id,
        personId: me.id,
        inAt: new Date(Date.now() - 2 * WEEK),
      },
    });
    // semana -3 sin actividad (corte)
    await prisma.checkin.create({
      data: {
        eventId: eventDraft.id,
        personId: me.id,
        inAt: new Date(Date.now() - 4 * WEEK),
      },
    });
    await confirmed({
      eventId: eventDraft.id,
      inviterId: me.id,
      inviteeId: extras[0].id,
      at: new Date(Date.now() - 5 * WEEK),
    });

    // "me" acumula ≥10 sesiones CONFIRMED históricas → bailarin_constante
    // (3 en eventLive + 1 semana -5 + 6 extra en eventDraft, todas semana -6)
    for (let i = 0; i < 6; i++) {
      await confirmed({
        eventId: eventDraft.id,
        inviterId: extras[i].id,
        inviteeId: me.id,
        at: new Date(Date.now() - 6 * WEEK),
      });
    }
  });

  afterAll(async () => {
    const personIds = [
      ids.meId,
      ids.topLeaderId,
      ids.lowLeaderId,
      ids.topFollowerId,
      ids.emptyId,
      ...ids.extraIds,
    ];
    await prisma.missionProgress.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.mission.deleteMany({
      where: { eventId: { in: [ids.eventLiveId, ids.eventDraftId] } },
    });
    await prisma.missionTemplate.deleteMany({
      where: { id: { in: ids.templateIds } },
    });
    await prisma.personBadge.deleteMany({
      where: { personId: { in: personIds } },
    });
    // El catálogo Badge es global (seed + otros specs) — no se borra.
    await prisma.danceSession.deleteMany({
      where: { eventId: { in: [ids.eventLiveId, ids.eventDraftId] } },
    });
    await prisma.checkin.deleteMany({
      where: { eventId: { in: [ids.eventLiveId, ids.eventDraftId] } },
    });
    await prisma.event.deleteMany({
      where: { id: { in: [ids.eventLiveId, ids.eventDraftId] } },
    });
    await prisma.style.deleteMany({
      where: { id: { in: [ids.style1Id, ids.style2Id] } },
    });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await app.close();
  });

  // ─── leaderboard ───

  describe("GET /api/events/:eventId/leaderboard", () => {
    it("público: sin sesión responde 200", async () => {
      const res = await get(`/api/events/${ids.eventLiveId}/leaderboard`);
      expect(res.status).toBe(200);
    });

    it("evento LIVE → leaders/followers por rol con counts", async () => {
      const res = await get(`/api/events/${ids.eventLiveId}/leaderboard`);
      const body = await res.json();

      const topL = body.leaders.find(
        (e: { personId: string }) => e.personId === ids.topLeaderId,
      );
      expect(topL.count).toBe(6); // ≥5 → count real
      expect(topL.name).toContain("Gamif topleader");

      const lowL = body.leaders.find(
        (e: { personId: string }) => e.personId === ids.lowLeaderId,
      );
      expect(lowL.count).toBe("<5"); // k-anonymity

      const topF = body.followers.find(
        (e: { personId: string }) => e.personId === ids.topFollowerId,
      );
      expect(topF.count).toBe(6);

      // orden desc: topLeader primero
      expect(body.leaders[0].personId).toBe(ids.topLeaderId);
    });

    it("evento PUBLISHED → oculto (listas vacías, no spoilea)", async () => {
      const res = await get(`/api/events/${ids.eventDraftId}/leaderboard`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ leaders: [], followers: [] });
    });

    it("evento inexistente → 404", async () => {
      const res = await get("/api/events/no-existe/leaderboard");
      expect(res.status).toBe(404);
    });
  });

  // ─── prime time ───

  describe("GET /api/events/:eventId/prime-time", () => {
    it("público: sin sesión responde 200", async () => {
      const res = await get(`/api/events/${ids.eventLiveId}/prime-time`);
      expect(res.status).toBe(200);
    });

    it("threshold=ceil(capacity*20%), current solo en ventana, unlocked al umbral", async () => {
      const res = await get(`/api/events/${ids.eventLiveId}/prime-time`);
      const body = await res.json();
      expect(body.threshold).toBe(4); // capacity 20 → ceil(4)
      expect(body.current).toBe(4); // 4 en 23:30–00:00; 22:59 y 00:30 fuera
      expect(body.unlocked).toBe(true);
      expect(new Date(body.window.end).getTime()).toBeGreaterThan(
        new Date(body.window.start).getTime(),
      );
    });

    it("evento inexistente → 404", async () => {
      const res = await get("/api/events/no-existe/prime-time");
      expect(res.status).toBe(404);
    });
  });

  // ─── misiones ───

  describe("GET /api/events/:eventId/missions", () => {
    it("sin sesión → 401", async () => {
      const res = await get(`/api/events/${ids.eventLiveId}/missions`);
      expect(res.status).toBe(401);
    });

    it("devuelve las 3 misiones con progreso recalculado del usuario", async () => {
      const res = await get(
        `/api/events/${ids.eventLiveId}/missions`,
        ids.meSession,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list).toHaveLength(3);

      const diverso = list.find(
        (m: { key: string }) => m.key === "baila_diverso",
      );
      expect(diverso.progress).toBe(3); // extras[0], extras[1], extras[2]
      expect(diverso.target).toBe(3);
      expect(diverso.completed).toBe(true);

      const madrugador = list.find(
        (m: { key: string }) => m.key === "madrugador",
      );
      expect(madrugador.completed).toBe(true); // check-in 22:15 < 23:00

      const explorer = list.find(
        (m: { key: string }) => m.key === "estilo_explorer",
      );
      expect(explorer.progress).toBe(2); // style1 + style2
      expect(explorer.completed).toBe(true);
    });

    it("persiste MissionProgress al recalcular lazy", async () => {
      const row = await prisma.missionProgress.findUnique({
        where: {
          missionId_personId: {
            missionId: ids.diversoMissionId,
            personId: ids.meId,
          },
        },
      });
      expect(row?.progress).toBe(3);
      expect(row?.completedAt).toBeTruthy();
    });

    it("usuario sin actividad → progreso 0", async () => {
      const res = await get(
        `/api/events/${ids.eventLiveId}/missions`,
        ids.emptySession,
      );
      const list = await res.json();
      for (const m of list) {
        expect(m.progress).toBe(0);
        expect(m.completed).toBe(false);
      }
    });
  });

  describe("POST /api/gamification/progress", () => {
    it("sin sesión → 401", async () => {
      const res = await post("/api/gamification/progress", {
        missionId: ids.diversoMissionId,
      });
      expect(res.status).toBe(401);
    });

    it("recalcula progreso propio → 200", async () => {
      const res = await post(
        "/api/gamification/progress",
        { missionId: ids.explorerMissionId },
        ids.meSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.missionId).toBe(ids.explorerMissionId);
      expect(body.personId).toBe(ids.meId);
      expect(body.progress).toBe(2);
      expect(body.completedAt).toBeTruthy();
    });

    it("recalcular para otra persona sin rol staff → 403", async () => {
      const res = await post(
        "/api/gamification/progress",
        { missionId: ids.diversoMissionId, personId: ids.emptyId },
        ids.meSession,
      );
      expect(res.status).toBe(403);
    });

    it("misión inexistente → 404", async () => {
      const res = await post(
        "/api/gamification/progress",
        { missionId: "no-existe" },
        ids.meSession,
      );
      expect(res.status).toBe(404);
    });
  });

  // ─── streak ───

  describe("GET /api/gamification/me/streak", () => {
    it("sin sesión → 401", async () => {
      const res = await get("/api/gamification/me/streak");
      expect(res.status).toBe(401);
    });

    it("semanas consecutivas con actividad → current/best", async () => {
      const res = await get("/api/gamification/me/streak", ids.meSession);
      expect(res.status).toBe(200);
      const body = await res.json();
      // actividad: semanas -6,-5,-4 (racha 3) | corte -3 | -2,-1,0 (racha 3)
      expect(body.currentWeeks).toBe(3);
      expect(body.bestWeeks).toBe(3);
    });

    it("sin actividad → 0/0", async () => {
      const res = await get("/api/gamification/me/streak", ids.emptySession);
      expect(await res.json()).toEqual({ currentWeeks: 0, bestWeeks: 0 });
    });
  });

  // ─── badges ───

  describe("GET /api/gamification/me/badges", () => {
    it("sin sesión → 401", async () => {
      const res = await get("/api/gamification/me/badges");
      expect(res.status).toBe(401);
    });

    it("award lazy: primera sesión + ≥10 → ambos badges", async () => {
      const res = await get("/api/gamification/me/badges", ids.meSession);
      expect(res.status).toBe(200);
      const list = await res.json();
      const keys = list.map((b: { badge: { key: string } }) => b.badge.key);
      expect(keys).toContain("primera_bachata");
      expect(keys).toContain("bailarin_constante");
    });

    it("idempotente: segunda consulta no duplica", async () => {
      const res = await get("/api/gamification/me/badges", ids.meSession);
      const list = await res.json();
      expect(list).toHaveLength(2);
      const count = await prisma.personBadge.count({
        where: { personId: ids.meId },
      });
      expect(count).toBe(2);
    });

    it("sin sesiones → sin badges", async () => {
      const res = await get("/api/gamification/me/badges", ids.emptySession);
      expect(await res.json()).toEqual([]);
    });
  });
});

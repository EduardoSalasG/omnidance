import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { CrmModule } from "../src/crm/crm.module";
import { PaymentsModule } from "../src/payments/payments.module";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { PrismaService } from "../src/prisma.service";

const DAY_MS = 86_400_000;

describe("gap-closure: CRM transversal e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let sessionProducer: string;
  let sessionProducer2: string;
  let sessionAcademyOwner: string;
  let sessionDancer: string;
  let sessionAdmin: string;
  let sessionT1: string;
  let sessionT2: string;

  const ids = {
    producerId: "",
    producer2Id: "",
    academyOwnerId: "",
    academyId: "",
    dancerId: "",
    adminId: "",
    // universo del productor
    coreId: "",
    inactiveId: "",
    newId: "",
    bringerId: "",
    // transfer de tickets
    t1Id: "",
    t2Id: "",
    venueId: "",
    eventIds: [] as string[],
    ticketId: "",
  };

  const allPeople = () => [
    ids.producerId,
    ids.producer2Id,
    ids.academyOwnerId,
    ids.dancerId,
    ids.adminId,
    ids.coreId,
    ids.inactiveId,
    ids.newId,
    ids.bringerId,
    ids.t1Id,
    ids.t2Id,
  ];
  const actorIds = () => [ids.producerId, ids.producer2Id, ids.academyId];

  const req = (
    method: string,
    path: string,
    body?: unknown,
    session?: string,
  ) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(session ? { cookie: `omnidance_session=${session}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  const crmQuery = () => `actorType=PRODUCER&actorId=${ids.producerId}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CrmModule, PaymentsModule, AuthModule],
      providers: [PrismaService],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    // ─── fixtures ───
    const suffix = Date.now().toString(36);
    const mkPerson = (name: string, role: string, email?: string) =>
      prisma.person.create({
        data: {
          name,
          ...(email ? { email } : {}),
          roles: { create: [{ role, status: "APPROVED" }] },
        },
      });

    const [producer, producer2, academyOwner, dancer, admin, core, inactive, newcomer, bringer, t1, t2] =
      await Promise.all([
        mkPerson("CRM Producer", "PRODUCER"),
        mkPerson("CRM Producer 2", "PRODUCER"),
        mkPerson("CRM Academy Owner", "ACADEMY_OWNER"),
        mkPerson("CRM Dancer", "DANCER"),
        mkPerson("CRM Admin", "ADMIN"),
        mkPerson("CRM Core", "DANCER"),
        mkPerson("CRM Inactive", "DANCER"),
        mkPerson("CRM New", "DANCER"),
        mkPerson("CRM Bringer", "DANCER"),
        mkPerson("CRM T1", "DANCER", `crm-t1-${suffix}@test.cl`),
        mkPerson("CRM T2", "DANCER", `crm-t2-${suffix}@test.cl`),
      ]);
    ids.producerId = producer.id;
    ids.producer2Id = producer2.id;
    ids.academyOwnerId = academyOwner.id;
    ids.dancerId = dancer.id;
    ids.adminId = admin.id;
    ids.coreId = core.id;
    ids.inactiveId = inactive.id;
    ids.newId = newcomer.id;
    ids.bringerId = bringer.id;
    ids.t1Id = t1.id;
    ids.t2Id = t2.id;

    [
      sessionProducer,
      sessionProducer2,
      sessionAcademyOwner,
      sessionDancer,
      sessionAdmin,
      sessionT1,
      sessionT2,
    ] = await Promise.all([
      auth.issueSession(producer.id),
      auth.issueSession(producer2.id),
      auth.issueSession(academyOwner.id),
      auth.issueSession(dancer.id),
      auth.issueSession(admin.id),
      auth.issueSession(t1.id),
      auth.issueSession(t2.id),
    ]);

    const venue = await prisma.venue.create({
      data: { name: `CRM Venue ${suffix}` },
    });
    ids.venueId = venue.id;

    const now = Date.now();
    const mkEvent = (name: string, startsAt: Date) =>
      prisma.event.create({
        data: {
          venueId: venue.id,
          producerId: producer.id,
          name: `${name} ${suffix}`,
          status: "PUBLISHED",
          startsAt,
          endsAt: new Date(startsAt.getTime() + 4 * 3600 * 1000),
        },
      });
    const ePast = await mkEvent(
      "CRM Evento Pasado",
      new Date(now - 70 * DAY_MS),
    );
    const eRecent = await mkEvent(
      "CRM Evento Reciente",
      new Date(now - 15 * DAY_MS),
    );
    const eFuture = await mkEvent(
      "CRM Evento Futuro",
      new Date(now + 10 * DAY_MS),
    );
    ids.eventIds = [ePast.id, eRecent.id, eFuture.id];

    // checkins (voided NO cuenta como asistencia)
    const checkins = [
      // core: 3 asistencias (60d, 40d, 10d) + 1 anulado → CORE
      { eventId: ePast.id, personId: core.id, inAt: new Date(now - 60 * DAY_MS) },
      { eventId: ePast.id, personId: core.id, inAt: new Date(now - 40 * DAY_MS) },
      { eventId: eRecent.id, personId: core.id, inAt: new Date(now - 10 * DAY_MS) },
      { eventId: eRecent.id, personId: core.id, inAt: new Date(now - 10 * DAY_MS), voidedAt: new Date() },
      // inactive: última actividad hace 50d → AT_RISK
      { eventId: ePast.id, personId: inactive.id, inAt: new Date(now - 50 * DAY_MS) },
      // newcomer: primera actividad hace 5d → NEW
      { eventId: eRecent.id, personId: newcomer.id, inAt: new Date(now - 5 * DAY_MS) },
      // bringer: 40d + 10d + 2 referrals → BRINGS_PEOPLE
      { eventId: ePast.id, personId: bringer.id, inAt: new Date(now - 40 * DAY_MS) },
      { eventId: eRecent.id, personId: bringer.id, inAt: new Date(now - 10 * DAY_MS) },
    ];
    for (const c of checkins) {
      await prisma.checkin.create({ data: c });
    }

    // payments PAID atribuibles al productor (PENDING no cuenta)
    const payments = [
      { personId: core.id, eventId: ePast.id, amount: 5000 },
      { personId: newcomer.id, eventId: eRecent.id, amount: 2000 },
      { personId: inactive.id, eventId: ePast.id, amount: 999999, status: "PENDING" as const },
    ];
    for (const [i, p] of payments.entries()) {
      await prisma.payment.create({
        data: {
          orderType: "TICKET",
          refId: `crm-ref-${suffix}-${i}`,
          personId: p.personId,
          eventId: p.eventId,
          amount: p.amount,
          fee: 0,
          net: p.amount,
          status: "status" in p ? p.status : "PAID",
        },
      });
    }

    // referrals del bringer (≥2 → BRINGS_PEOPLE)
    await prisma.referral.create({
      data: { referrerId: bringer.id, referredId: core.id, source: "INVITE" },
    });
    await prisma.referral.create({
      data: { referrerId: bringer.id, referredId: newcomer.id, source: "INVITE" },
    });

    // ticket de T1 para el flujo transfer → referral
    const ticket = await prisma.ticket.create({
      data: {
        eventId: ePast.id,
        ownerId: t1.id,
        buyerId: t1.id,
        listPrice: 5000,
        serviceFee: 500,
      },
    });
    ids.ticketId = ticket.id;

    // academia del owner + enrollment de newcomer
    const academy = await prisma.academy.create({
      data: { name: `CRM Academy ${suffix}`, ownerId: academyOwner.id },
    });
    ids.academyId = academy.id;
    await prisma.enrollment.create({
      data: { academyId: academy.id, personId: newcomer.id },
    });
  });

  afterAll(async () => {
    const people = allPeople();
    await prisma.notification.deleteMany({
      where: { personId: { in: people } },
    });
    await prisma.actorTag.deleteMany({
      where: { actorId: { in: actorIds() } },
    });
    await prisma.relationshipScore.deleteMany({
      where: { actorId: { in: actorIds() } },
    });
    await prisma.campaign.deleteMany({
      where: { actorId: { in: actorIds() } },
    });
    await prisma.crmTrigger.deleteMany({
      where: { actorId: { in: actorIds() } },
    });
    await prisma.referral.deleteMany({
      where: {
        OR: [{ referrerId: { in: people } }, { referredId: { in: people } }],
      },
    });
    await prisma.discountCode.deleteMany({
      where: { createdById: { in: actorIds() } },
    });
    await prisma.payment.deleteMany({
      where: { eventId: { in: ids.eventIds } },
    });
    await prisma.ticket.deleteMany({
      where: { eventId: { in: ids.eventIds } },
    });
    await prisma.checkin.deleteMany({
      where: { eventId: { in: ids.eventIds } },
    });
    await prisma.enrollment.deleteMany({
      where: { academyId: ids.academyId },
    });
    await prisma.event.deleteMany({ where: { id: { in: ids.eventIds } } });
    await prisma.academy.delete({ where: { id: ids.academyId } });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: { personId: { in: people } },
    });
    await prisma.person.deleteMany({ where: { id: { in: people } } });
    await app.close();
  });

  // ═══════════════════ AUTH / AUTORIZACIÓN ═══════════════════
  describe("autorización", () => {
    it("sin sesión → 401", async () => {
      const res = await req("GET", `/api/crm/people?${crmQuery()}`);
      expect(res.status).toBe(401);
    });

    it("DANCER sin permiso crm.manage → 403 (guard)", async () => {
      const res = await req(
        "GET",
        `/api/crm/people?${crmQuery()}`,
        undefined,
        sessionDancer,
      );
      expect(res.status).toBe(403);
    });

    it("otro PRODUCER con crm.manage pero sin acceso al actor → 403", async () => {
      const res = await req(
        "GET",
        `/api/crm/people?${crmQuery()}`,
        undefined,
        sessionProducer2,
      );
      expect(res.status).toBe(403);
    });

    it("academyOwner tampoco accede al CRM del productor → 403", async () => {
      const res = await req(
        "GET",
        `/api/crm/people?${crmQuery()}`,
        undefined,
        sessionAcademyOwner,
      );
      expect(res.status).toBe(403);
    });

    it("ADMIN (admin.access) accede al actor ajeno → 200", async () => {
      const res = await req(
        "GET",
        `/api/crm/people?${crmQuery()}`,
        undefined,
        sessionAdmin,
      );
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════ TAGS ═══════════════════
  describe("POST /api/crm/people/tags + DELETE /api/crm/tags/:id", () => {
    let tagId: string;

    it("crea tag VIP → 201", async () => {
      const res = await req(
        "POST",
        "/api/crm/people/tags",
        {
          actorType: "PRODUCER",
          actorId: ids.producerId,
          personId: ids.coreId,
          tag: "VIP",
          note: "siempre viene",
        },
        sessionProducer,
      );
      expect(res.status).toBe(201);
      const tag = await res.json();
      tagId = tag.id;
      expect(tag.tag).toBe("VIP");
      expect(tag.note).toBe("siempre viene");
    });

    it("duplicado exacto → 200 con el existente, sin duplicar", async () => {
      const res = await req(
        "POST",
        "/api/crm/people/tags",
        {
          actorType: "PRODUCER",
          actorId: ids.producerId,
          personId: ids.coreId,
          tag: "VIP",
        },
        sessionProducer,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).id).toBe(tagId);
      const count = await prisma.actorTag.count({
        where: { actorId: ids.producerId, personId: ids.coreId, tag: "VIP" },
      });
      expect(count).toBe(1);
    });

    it("DELETE por actor ajeno → 403", async () => {
      const res = await req(
        "DELETE",
        `/api/crm/tags/${tagId}`,
        undefined,
        sessionProducer2,
      );
      expect(res.status).toBe(403);
    });

    it("DELETE por el actor dueño → 200; repetir → 404", async () => {
      const res = await req(
        "DELETE",
        `/api/crm/tags/${tagId}`,
        undefined,
        sessionProducer,
      );
      expect(res.status).toBe(200);

      const again = await req(
        "DELETE",
        `/api/crm/tags/${tagId}`,
        undefined,
        sessionProducer,
      );
      expect(again.status).toBe(404);
    });
  });

  // ═══════════════════ SCORES ═══════════════════
  describe("POST /api/crm/scores/recompute + GET /api/crm/people", () => {
    it("recompute → updated:4 y scores/segmentos correctos", async () => {
      const res = await req(
        "POST",
        "/api/crm/scores/recompute",
        { actorType: "PRODUCER", actorId: ids.producerId },
        sessionProducer,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).updated).toBe(4);

      const scores = await prisma.relationshipScore.findMany({
        where: { actorType: "PRODUCER", actorId: ids.producerId },
      });
      const byPerson = new Map(scores.map((s) => [s.personId, s]));

      // core: 3 checkins (el voided no cuenta) + $5000 → 30+5 = 35, CORE
      const sCore = byPerson.get(ids.coreId)!;
      expect(sCore.score).toBeCloseTo(35);
      expect(sCore.segment).toBe("CORE");

      // inactive: 1 checkin hace 50d (pago PENDING no cuenta) → 10, AT_RISK
      const sInactive = byPerson.get(ids.inactiveId)!;
      expect(sInactive.score).toBeCloseTo(10);
      expect(sInactive.segment).toBe("AT_RISK");

      // newcomer: 1 checkin + $2000 hace 5d → 10+2 = 12, NEW
      const sNew = byPerson.get(ids.newId)!;
      expect(sNew.score).toBeCloseTo(12);
      expect(sNew.segment).toBe("NEW");

      // bringer: 2 checkins + 2 referrals → 20+30 = 50, BRINGS_PEOPLE
      const sBringer = byPerson.get(ids.bringerId)!;
      expect(sBringer.score).toBeCloseTo(50);
      expect(sBringer.segment).toBe("BRINGS_PEOPLE");
    });

    it("GET /people → orden score desc, join person{id,name,photoUrl}", async () => {
      const res = await req(
        "GET",
        `/api/crm/people?${crmQuery()}`,
        undefined,
        sessionProducer,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list).toHaveLength(4);
      expect(list.map((r: { personId: string }) => r.personId)).toEqual([
        ids.bringerId,
        ids.coreId,
        ids.newId,
        ids.inactiveId,
      ]);
      expect(list[1].person).toMatchObject({ id: ids.coreId, name: "CRM Core" });
      expect(list[1].person).toHaveProperty("photoUrl");
      expect(list[1]).toHaveProperty("tags");
    });
  });

  // ═══════════════════ CAMPAIGNS ═══════════════════
  describe("campañas", () => {
    it("NOTIFY: crea DRAFT → send → notificaciones + SENT + result.sent", async () => {
      const create = await req(
        "POST",
        "/api/crm/campaigns",
        {
          actorType: "PRODUCER",
          actorId: ids.producerId,
          name: "Reactivación",
          segment: { personIds: [ids.newId] },
          action: { type: "NOTIFY", title: "Te esperamos", body: "Nuevo evento" },
        },
        sessionProducer,
      );
      expect(create.status).toBe(201);
      const campaign = await create.json();
      expect(campaign.status).toBe("DRAFT");

      const send = await req(
        "POST",
        `/api/crm/campaigns/${campaign.id}/send`,
        {},
        sessionProducer,
      );
      expect(send.status).toBe(200);
      const sent = await send.json();
      expect(sent.status).toBe("SENT");
      expect(sent.result.sent).toBe(1);
      expect(sent.result).toHaveProperty("at");

      const notif = await prisma.notification.findFirst({
        where: { personId: ids.newId, type: "crm.campaign" },
      });
      expect(notif).toBeTruthy();
      expect(notif!.title).toBe("Te esperamos");
      expect((notif!.data as { campaignId: string }).campaignId).toBe(
        campaign.id,
      );

      // re-send → 409 (solo DRAFT→SENT)
      const resend = await req(
        "POST",
        `/api/crm/campaigns/${campaign.id}/send`,
        {},
        sessionProducer,
      );
      expect(resend.status).toBe(409);
    });

    it("DISCOUNT_CODE: crea DiscountCode CAMPAIGN + notify con el código", async () => {
      const create = await req(
        "POST",
        "/api/crm/campaigns",
        {
          actorType: "PRODUCER",
          actorId: ids.producerId,
          name: "Winback 20%",
          segment: { segment: "AT_RISK" },
          action: { type: "DISCOUNT_CODE", percentOff: 20, maxUses: 10 },
        },
        sessionProducer,
      );
      expect(create.status).toBe(201);
      const campaign = await create.json();

      const send = await req(
        "POST",
        `/api/crm/campaigns/${campaign.id}/send`,
        {},
        sessionProducer,
      );
      expect(send.status).toBe(200);
      const sent = await send.json();
      expect(sent.status).toBe("SENT");
      expect(sent.result.sent).toBe(1);
      expect(sent.result.code).toBeTruthy();

      const code = await prisma.discountCode.findUnique({
        where: { code: sent.result.code },
      });
      expect(code).toBeTruthy();
      expect(code!.type).toBe("CAMPAIGN");
      expect(code!.createdById).toBe(ids.producerId);
      expect(code!.percentOff).toBe(20);
      expect(code!.maxUses).toBe(10);

      const notif = await prisma.notification.findFirst({
        where: { personId: ids.inactiveId, type: "crm.campaign" },
      });
      expect(notif).toBeTruthy();
      expect((notif!.data as { code: string }).code).toBe(sent.result.code);
    });

    it("segment por tags resuelve personas taggeadas", async () => {
      await req(
        "POST",
        "/api/crm/people/tags",
        {
          actorType: "PRODUCER",
          actorId: ids.producerId,
          personId: ids.bringerId,
          tag: "PROMO",
        },
        sessionProducer,
      );
      const create = await req(
        "POST",
        "/api/crm/campaigns",
        {
          actorType: "PRODUCER",
          actorId: ids.producerId,
          name: "Solo PROMO",
          segment: { tags: ["PROMO"] },
          action: { type: "NOTIFY", title: "Promo VIP" },
        },
        sessionProducer,
      );
      const campaign = await create.json();
      const send = await req(
        "POST",
        `/api/crm/campaigns/${campaign.id}/send`,
        {},
        sessionProducer,
      );
      expect((await send.json()).result.sent).toBe(1);
      const notif = await prisma.notification.findFirst({
        where: { personId: ids.bringerId, type: "crm.campaign" },
      });
      expect(notif!.title).toBe("Promo VIP");
    });

    it("GET /crm/campaigns lista las del actor", async () => {
      const res = await req(
        "GET",
        `/api/crm/campaigns?${crmQuery()}`,
        undefined,
        sessionProducer,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list).toHaveLength(3);
      expect(list[0].actorId).toBe(ids.producerId);
    });

    it("send de campaña ajena → 403", async () => {
      const campaign = await prisma.campaign.findFirst({
        where: { actorId: ids.producerId, status: "SENT" },
      });
      const res = await req(
        "POST",
        `/api/crm/campaigns/${campaign!.id}/send`,
        {},
        sessionProducer2,
      );
      expect(res.status).toBe(403);
    });
  });

  // ═══════════════════ TRIGGERS ═══════════════════
  describe("triggers", () => {
    let triggerId: string;

    it("POST /crm/triggers crea WINBACK activo", async () => {
      const res = await req(
        "POST",
        "/api/crm/triggers",
        {
          actorType: "PRODUCER",
          actorId: ids.producerId,
          key: "WINBACK",
        },
        sessionProducer,
      );
      expect(res.status).toBe(201);
      const trigger = await res.json();
      triggerId = trigger.id;
      expect(trigger.key).toBe("WINBACK");
      expect(trigger.active).toBe(true);
    });

    it("key inválida → 400", async () => {
      const res = await req(
        "POST",
        "/api/crm/triggers",
        {
          actorType: "PRODUCER",
          actorId: ids.producerId,
          key: "NO_EXISTE",
        },
        sessionProducer,
      );
      expect(res.status).toBe(400);
    });

    it("GET /crm/triggers lista los del actor", async () => {
      const res = await req(
        "GET",
        `/api/crm/triggers?${crmQuery()}`,
        undefined,
        sessionProducer,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list.some((t: { id: string }) => t.id === triggerId)).toBe(true);
    });

    it("evaluate WINBACK notifica al inactivo (crm.winback)", async () => {
      const res = await req(
        "POST",
        "/api/crm/triggers/evaluate",
        { actorType: "PRODUCER", actorId: ids.producerId },
        sessionProducer,
      );
      expect(res.status).toBe(200);
      const out = await res.json();
      expect(out.WINBACK.evaluated).toBe(4);
      expect(out.WINBACK.notified).toBe(1);

      const notif = await prisma.notification.findFirst({
        where: { personId: ids.inactiveId, type: "crm.winback" },
      });
      expect(notif).toBeTruthy();

      // segunda evaluación: cooldown evita re-notificar
      const res2 = await req(
        "POST",
        "/api/crm/triggers/evaluate",
        { actorType: "PRODUCER", actorId: ids.producerId },
        sessionProducer,
      );
      expect((await res2.json()).WINBACK.notified).toBe(0);
    });

    it("PATCH /crm/triggers/:id desactiva → evaluate no lo corre", async () => {
      const res = await req(
        "PATCH",
        `/api/crm/triggers/${triggerId}`,
        { active: false },
        sessionProducer,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).active).toBe(false);

      const evalRes = await req(
        "POST",
        "/api/crm/triggers/evaluate",
        { actorType: "PRODUCER", actorId: ids.producerId },
        sessionProducer,
      );
      expect((await evalRes.json()).WINBACK).toBeUndefined();

      // actor ajeno no puede tocar el trigger
      const forbidden = await req(
        "PATCH",
        `/api/crm/triggers/${triggerId}`,
        { active: true },
        sessionProducer2,
      );
      expect(forbidden.status).toBe(403);
    });
  });

  // ═══════════════════ ACADEMY ═══════════════════
  describe("actor ACADEMY", () => {
    it("owner accede, recompute marca NEW al enrollee reciente", async () => {
      const q = `actorType=ACADEMY&actorId=${ids.academyId}`;
      const res = await req(
        "POST",
        "/api/crm/scores/recompute",
        { actorType: "ACADEMY", actorId: ids.academyId },
        sessionAcademyOwner,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).updated).toBe(1);

      const list = await (
        await req("GET", `/api/crm/people?${q}`, undefined, sessionAcademyOwner)
      ).json();
      expect(list).toHaveLength(1);
      expect(list[0].personId).toBe(ids.newId);
      expect(list[0].segment).toBe("NEW");

      // el productor no es owner de la academia → 403
      const forbidden = await req(
        "GET",
        `/api/crm/people?${q}`,
        undefined,
        sessionProducer,
      );
      expect(forbidden.status).toBe(403);
    });
  });

  // ═══════════════════ REFERRAL EN TRANSFER ═══════════════════
  describe("POST /api/tickets/:id/transfer → Referral GIFT_TICKET", () => {
    const t2Email = () => prisma.person.findUniqueOrThrow({ where: { id: ids.t2Id }, select: { email: true } }).then((p) => p.email!);
    const t1Email = () => prisma.person.findUniqueOrThrow({ where: { id: ids.t1Id }, select: { email: true } }).then((p) => p.email!);

    it("transfer crea Referral(referrer=ex-owner, referred=target)", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketId}/transfer`,
        { toEmail: await t2Email() },
        sessionT1,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).ownerId).toBe(ids.t2Id);

      const referral = await prisma.referral.findFirst({
        where: {
          referrerId: ids.t1Id,
          referredId: ids.t2Id,
          source: "GIFT_TICKET",
        },
      });
      expect(referral).toBeTruthy();
    });

    it("transfer repetido al mismo target no duplica el referral", async () => {
      // devolver el ticket a T1 y volver a transferirlo a T2
      const back = await req(
        "POST",
        `/api/tickets/${ids.ticketId}/transfer`,
        { toEmail: await t1Email() },
        sessionT2,
      );
      expect(back.status).toBe(200);

      const again = await req(
        "POST",
        `/api/tickets/${ids.ticketId}/transfer`,
        { toEmail: await t2Email() },
        sessionT1,
      );
      expect(again.status).toBe(200);

      const count = await prisma.referral.count({
        where: {
          referrerId: ids.t1Id,
          referredId: ids.t2Id,
          source: "GIFT_TICKET",
        },
      });
      expect(count).toBe(1);
      // la dirección inversa sí es un referral distinto
      const reverse = await prisma.referral.count({
        where: {
          referrerId: ids.t2Id,
          referredId: ids.t1Id,
          source: "GIFT_TICKET",
        },
      });
      expect(reverse).toBe(1);
    });
  });
});

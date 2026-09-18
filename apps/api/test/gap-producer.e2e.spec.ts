import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { EventsModule } from "../src/events/events.module";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { PrismaService } from "../src/prisma.service";

// Suite del CRUD del productor sobre /api/events: create (events.manage),
// update/publish/cancel (owner o admin), y staff assignments.
describe("spec-gap-closure: producer events CRUD e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  const suffix = Date.now().toString(36);
  const future = (h: number) =>
    new Date(Date.now() + h * 3600 * 1000).toISOString();

  const sessions = {
    producer: "",
    producer2: "",
    admin: "",
    dancer: "",
    staff: "",
    dj: "",
  };
  const ids = {
    producerId: "",
    producer2Id: "",
    adminId: "",
    dancerId: "",
    staffId: "",
    djId: "",
    venueId: "",
    styleId: "",
    seriesId: "", // serie del producer
    series2Id: "", // serie del producer2
  };
  // Eventos creados por la suite (vía API o prisma) — cleanup por producerId.
  let createdEventId = ""; // evento principal DRAFT del producer

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

  const mkPerson = async (name: string, role = "DANCER") => {
    const p = await prisma.person.create({
      data: { name, roles: { create: [{ role, status: "APPROVED" }] } },
    });
    return { id: p.id, session: await auth.issueSession(p.id) };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventsModule, AuthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    const [prod, prod2, admin, dancer, staff, dj] = await Promise.all([
      mkPerson(`GP Productor ${suffix}`, "PRODUCER"),
      mkPerson(`GP Productor2 ${suffix}`, "PRODUCER"),
      mkPerson(`GP Admin ${suffix}`, "ADMIN"),
      mkPerson(`GP Bailarín ${suffix}`),
      mkPerson(`GP Staff ${suffix}`, "STAFF"),
      mkPerson(`GP DJ ${suffix}`, "DJ"),
    ]);
    ids.producerId = prod.id;
    sessions.producer = prod.session;
    ids.producer2Id = prod2.id;
    sessions.producer2 = prod2.session;
    ids.adminId = admin.id;
    sessions.admin = admin.session;
    ids.dancerId = dancer.id;
    sessions.dancer = dancer.session;
    ids.staffId = staff.id;
    sessions.staff = staff.session;
    ids.djId = dj.id;
    sessions.dj = dj.session;

    const venue = await prisma.venue.create({
      data: { name: `GP Venue ${suffix}` },
    });
    ids.venueId = venue.id;
    const style = await prisma.style.create({
      data: { name: `GP Style ${suffix}`, genre: "SALSA" },
    });
    ids.styleId = style.id;
    const [series, series2] = await Promise.all([
      prisma.eventSeries.create({
        data: {
          name: `GP Serie ${suffix}`,
          producerId: prod.id,
          venueId: venue.id,
        },
      }),
      prisma.eventSeries.create({
        data: {
          name: `GP Serie Ajena ${suffix}`,
          producerId: prod2.id,
          venueId: venue.id,
        },
      }),
    ]);
    ids.seriesId = series.id;
    ids.series2Id = series2.id;
  });

  afterAll(async () => {
    const peopleIds = [
      ids.producerId,
      ids.producer2Id,
      ids.adminId,
      ids.dancerId,
      ids.staffId,
      ids.djId,
    ];
    const events = await prisma.event.findMany({
      where: {
        producerId: {
          in: [ids.producerId, ids.producer2Id, ids.adminId],
        },
      },
      select: { id: true },
    });
    const eventIds = events.map((e) => e.id);
    // FK-safe: notifications → hijos de evento → events → series → venue/personas
    await prisma.notification.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await prisma.staffAssignment.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.scheduleBlock.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.eventDj.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.eventSeries.deleteMany({
      where: { id: { in: [ids.seriesId, ids.series2Id] } },
    });
    await prisma.style.deleteMany({ where: { id: ids.styleId } });
    await prisma.venue.deleteMany({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: peopleIds } } });
    await app.close();
  });

  // ═══════════════════════ POST /api/events ═══════════════════════
  describe("POST /api/events", () => {
    it("sin sesión → 401", async () => {
      const res = await req("POST", "/api/events", { name: "x" });
      expect(res.status).toBe(401);
    });

    it("bailarín sin events.manage → 403", async () => {
      const res = await req(
        "POST",
        "/api/events",
        { name: "x", startsAt: future(24), endsAt: future(28) },
        sessions.dancer,
      );
      expect(res.status).toBe(403);
    });

    it("sin name → 400", async () => {
      const res = await req(
        "POST",
        "/api/events",
        { startsAt: future(24), endsAt: future(28) },
        sessions.producer,
      );
      expect(res.status).toBe(400);
    });

    it("type fuera del enum → 400", async () => {
      const res = await req(
        "POST",
        "/api/events",
        {
          name: `GP Bad type ${suffix}`,
          type: "PRACTICE", // el enum real es PRACTICA
          startsAt: future(24),
          endsAt: future(28),
        },
        sessions.producer,
      );
      expect(res.status).toBe(400);
    });

    it("serie inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/events",
        {
          name: `GP Serie fantasma ${suffix}`,
          seriesId: "serie-no-existe",
          startsAt: future(24),
          endsAt: future(28),
        },
        sessions.producer,
      );
      expect(res.status).toBe(404);
    });

    it("serie de otro productor → 403", async () => {
      const res = await req(
        "POST",
        "/api/events",
        {
          name: `GP Serie ajena ${suffix}`,
          seriesId: ids.series2Id,
          startsAt: future(24),
          endsAt: future(28),
        },
        sessions.producer,
      );
      expect(res.status).toBe(403);
    });

    it("producer crea DRAFT mínimo con producerId propio → 201", async () => {
      const res = await req(
        "POST",
        "/api/events",
        {
          name: `GP Social ${suffix}`,
          type: "SOCIAL",
          startsAt: future(24),
          endsAt: future(28),
          capacity: 120,
          presalePrice: 8000,
          doorPrice: 10000,
        },
        sessions.producer,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("DRAFT");
      expect(body.producerId).toBe(ids.producerId);
      expect(body.type).toBe("SOCIAL");
      createdEventId = body.id;
    });

    it("con serie propia + scheduleBlocks + djIds → crea hijos en la misma tx", async () => {
      const res = await req(
        "POST",
        "/api/events",
        {
          name: `GP Congreso ${suffix}`,
          type: "CONGRESS",
          seriesId: ids.seriesId,
          venueId: ids.venueId,
          startsAt: future(48),
          endsAt: future(52),
          scheduleBlocks: [
            { startsAt: future(48), endsAt: future(49), styleId: ids.styleId },
            { startsAt: future(49), endsAt: future(50), djId: ids.djId },
          ],
          djIds: [ids.djId, ids.djId], // duplicado → dedupe por @@unique
        },
        sessions.producer,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.seriesId).toBe(ids.seriesId);
      const blocks = await prisma.scheduleBlock.findMany({
        where: { eventId: body.id },
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0].styleId).toBe(ids.styleId);
      const djs = await prisma.eventDj.findMany({
        where: { eventId: body.id },
      });
      expect(djs).toHaveLength(1);
      expect(djs[0].personId).toBe(ids.djId);
    });
  });

  // ═══════════════════════ PATCH /api/events/:id ═══════════════════════
  describe("PATCH /api/events/:id", () => {
    it("evento inexistente → 404", async () => {
      const res = await req(
        "PATCH",
        "/api/events/evt-fantasma",
        { name: "x" },
        sessions.producer,
      );
      expect(res.status).toBe(404);
    });

    it("otro productor (no owner, no admin) → 403", async () => {
      const res = await req(
        "PATCH",
        `/api/events/${createdEventId}`,
        { name: "hackeado" },
        sessions.producer2,
      );
      expect(res.status).toBe(403);
    });

    it("owner edita campos escalares → 200", async () => {
      const res = await req(
        "PATCH",
        `/api/events/${createdEventId}`,
        { name: `GP Social Editado ${suffix}`, capacity: 150, doorCap: 60 },
        sessions.producer,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe(`GP Social Editado ${suffix}`);
      expect(body.capacity).toBe(150);
      expect(body.doorCap).toBe(60);
    });

    it("scheduleBlocks/djIds reemplazan los actuales", async () => {
      const res = await req(
        "PATCH",
        `/api/events/${createdEventId}`,
        {
          scheduleBlocks: [
            { startsAt: future(25), endsAt: future(26), styleId: ids.styleId },
          ],
          djIds: [ids.djId],
        },
        sessions.producer,
      );
      expect(res.status).toBe(200);
      const blocks = await prisma.scheduleBlock.findMany({
        where: { eventId: createdEventId },
      });
      expect(blocks).toHaveLength(1);
      expect(blocks[0].styleId).toBe(ids.styleId);
      const djs = await prisma.eventDj.findMany({
        where: { eventId: createdEventId },
      });
      expect(djs).toHaveLength(1);
      expect(djs[0].personId).toBe(ids.djId);
    });

    it("admin edita evento ajeno → 200", async () => {
      const res = await req(
        "PATCH",
        `/api/events/${createdEventId}`,
        { capacity: 200 },
        sessions.admin,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).capacity).toBe(200);
    });

    it("serie de otro productor → 403", async () => {
      const res = await req(
        "PATCH",
        `/api/events/${createdEventId}`,
        { seriesId: ids.series2Id },
        sessions.producer,
      );
      expect(res.status).toBe(403);
    });
  });

  // ═══════════════════════ publish / cancel ═══════════════════════
  describe("POST /api/events/:id/publish + cancel", () => {
    it("publicar sin sesión → 401", async () => {
      const res = await req("POST", `/api/events/${createdEventId}/publish`);
      expect(res.status).toBe(401);
    });

    it("otro productor intenta publicar → 403", async () => {
      const res = await req(
        "POST",
        `/api/events/${createdEventId}/publish`,
        undefined,
        sessions.producer2,
      );
      expect(res.status).toBe(403);
    });

    it("owner publica desde DRAFT → PUBLISHED", async () => {
      const res = await req(
        "POST",
        `/api/events/${createdEventId}/publish`,
        undefined,
        sessions.producer,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("PUBLISHED");
    });

    it("re-publicar (ya PUBLISHED) → 409", async () => {
      const res = await req(
        "POST",
        `/api/events/${createdEventId}/publish`,
        undefined,
        sessions.producer,
      );
      expect(res.status).toBe(409);
    });

    it("PATCH sobre PUBLISHED sigue permitido", async () => {
      const res = await req(
        "PATCH",
        `/api/events/${createdEventId}`,
        { presaleCap: 80 },
        sessions.producer,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).presaleCap).toBe(80);
    });

    it("owner cancela desde PUBLISHED → CANCELLED", async () => {
      const res = await req(
        "POST",
        `/api/events/${createdEventId}/cancel`,
        undefined,
        sessions.producer,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("CANCELLED");
    });

    it("cancelar de nuevo → 409", async () => {
      const res = await req(
        "POST",
        `/api/events/${createdEventId}/cancel`,
        undefined,
        sessions.producer,
      );
      expect(res.status).toBe(409);
    });

    it("PATCH sobre CANCELLED → 409", async () => {
      const res = await req(
        "PATCH",
        `/api/events/${createdEventId}`,
        { name: "tarde" },
        sessions.producer,
      );
      expect(res.status).toBe(409);
    });
  });

  // ═══════════════════════ staff ═══════════════════════
  describe("POST/GET /api/events/:id/staff", () => {
    let staffEventId: string;

    beforeAll(async () => {
      const res = await req(
        "POST",
        "/api/events",
        {
          name: `GP Staff Event ${suffix}`,
          startsAt: future(72),
          endsAt: future(76),
        },
        sessions.producer,
      );
      staffEventId = (await res.json()).id;
    });

    it("asignar sin sesión → 401", async () => {
      const res = await req("POST", `/api/events/${staffEventId}/staff`, {
        personId: ids.staffId,
      });
      expect(res.status).toBe(401);
    });

    it("otro productor intenta asignar → 403", async () => {
      const res = await req(
        "POST",
        `/api/events/${staffEventId}/staff`,
        { personId: ids.staffId },
        sessions.producer2,
      );
      expect(res.status).toBe(403);
    });

    it("persona inexistente → 404", async () => {
      const res = await req(
        "POST",
        `/api/events/${staffEventId}/staff`,
        { personId: "persona-fantasma" },
        sessions.producer,
      );
      expect(res.status).toBe(404);
    });

    it("rol inválido → 400", async () => {
      const res = await req(
        "POST",
        `/api/events/${staffEventId}/staff`,
        { personId: ids.staffId, role: "GERENTE" },
        sessions.producer,
      );
      expect(res.status).toBe(400);
    });

    it("owner asigna staff con rol default DOOR → 201", async () => {
      const res = await req(
        "POST",
        `/api/events/${staffEventId}/staff`,
        { personId: ids.staffId },
        sessions.producer,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.personId).toBe(ids.staffId);
      expect(body.role).toBe("DOOR");
    });

    it("re-asignar hace upsert (cambia rol, no duplica)", async () => {
      const res = await req(
        "POST",
        `/api/events/${staffEventId}/staff`,
        { personId: ids.staffId, role: "DOOR_SALES" },
        sessions.admin,
      );
      expect(res.status).toBe(201);
      const rows = await prisma.staffAssignment.findMany({
        where: { eventId: staffEventId, personId: ids.staffId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].role).toBe("DOOR_SALES");
    });

    it("GET staff: bailarín ajeno → 403", async () => {
      const res = await req(
        "GET",
        `/api/events/${staffEventId}/staff`,
        undefined,
        sessions.dancer,
      );
      expect(res.status).toBe(403);
    });

    it("GET staff: owner ve la lista con person {id,name,email}", async () => {
      const res = await req(
        "GET",
        `/api/events/${staffEventId}/staff`,
        undefined,
        sessions.producer,
      );
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list).toHaveLength(1);
      expect(list[0].role).toBe("DOOR_SALES");
      expect(list[0].person.id).toBe(ids.staffId);
      expect(list[0].person.name).toContain("GP Staff");
      expect(list[0].person).toHaveProperty("email");
    });

    it("GET staff: el staff asignado también puede listar", async () => {
      const res = await req(
        "GET",
        `/api/events/${staffEventId}/staff`,
        undefined,
        sessions.staff,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toHaveLength(1);
    });
  });

  // ═══════════════ serviceFeeClp (override admin-only) ═══════════════
  describe("serviceFeeClp (override admin del cargo por servicio)", () => {
    let adminEventId = "";
    let producerEventId = "";

    beforeAll(async () => {
      // evento propio del producer (sin fee) para probar el PATCH no-admin
      const res = await req(
        "POST",
        "/api/events",
        {
          name: `GP Fee Owner ${suffix}`,
          startsAt: future(96),
          endsAt: future(100),
          presalePrice: 10000,
        },
        sessions.producer,
      );
      producerEventId = (await res.json()).id;
    });

    it("POST con serviceFeeClp sin admin.access → 403", async () => {
      const res = await req(
        "POST",
        "/api/events",
        {
          name: `GP Fee NoAdmin ${suffix}`,
          startsAt: future(96),
          endsAt: future(100),
          serviceFeeClp: 900,
        },
        sessions.producer,
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain(
        "solo admin puede fijar la comisión del evento",
      );
    });

    it("POST con serviceFeeClp por admin → 201 y persiste el campo", async () => {
      const res = await req(
        "POST",
        "/api/events",
        {
          name: `GP Fee Admin ${suffix}`,
          startsAt: future(96),
          endsAt: future(100),
          presalePrice: 10000,
          serviceFeeClp: 900,
        },
        sessions.admin,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.serviceFeeClp).toBe(900);
      adminEventId = body.id;
    });

    it("GET /events/:id expone serviceFeeClp", async () => {
      const res = await req("GET", `/api/events/${adminEventId}`);
      expect(res.status).toBe(200);
      expect((await res.json()).serviceFeeClp).toBe(900);
    });

    it("PATCH serviceFeeClp por el owner sin admin → 403", async () => {
      const res = await req(
        "PATCH",
        `/api/events/${producerEventId}`,
        { serviceFeeClp: 700 },
        sessions.producer,
      );
      expect(res.status).toBe(403);
      // el campo quedó intacto
      const event = await prisma.event.findUniqueOrThrow({
        where: { id: producerEventId },
        select: { serviceFeeClp: true },
      });
      expect(event.serviceFeeClp).toBeNull();
    });

    it("PATCH serviceFeeClp negativo → 400", async () => {
      const res = await req(
        "PATCH",
        `/api/events/${adminEventId}`,
        { serviceFeeClp: -5 },
        sessions.admin,
      );
      expect(res.status).toBe(400);
    });

    it("admin publica y edita serviceFeeClp en PUBLISHED → 200", async () => {
      const pub = await req(
        "POST",
        `/api/events/${adminEventId}/publish`,
        undefined,
        sessions.admin,
      );
      expect(pub.status).toBe(200);

      const res = await req(
        "PATCH",
        `/api/events/${adminEventId}`,
        { serviceFeeClp: 1200 },
        sessions.admin,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).serviceFeeClp).toBe(1200);
    });

    it("GET /events lista el serviceFeeClp del evento PUBLISHED", async () => {
      const res = await req("GET", "/api/events");
      expect(res.status).toBe(200);
      const list = await res.json();
      const mine = list.find(
        (e: { id: string }) => e.id === adminEventId,
      );
      expect(mine).toBeTruthy();
      expect(mine.serviceFeeClp).toBe(1200);
    });

    it("admin limpia el override con null → serviceFeeClp null", async () => {
      const res = await req(
        "PATCH",
        `/api/events/${adminEventId}`,
        { serviceFeeClp: null },
        sessions.admin,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).serviceFeeClp).toBeNull();
    });
  });
});

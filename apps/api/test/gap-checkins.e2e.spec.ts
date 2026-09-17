import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { CheckinsModule } from "../src/checkins/checkins.module";
import { PrismaService } from "../src/prisma.service";
import { QrModule } from "../src/qr/qr.module";
import { QrService } from "../src/qr/domain/qr.service";

const phone = () => `010${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

describe("gap-checkins e2e (out / void / door-sale)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );
  const qr = new QrService(process.env.QR_SECRET ?? "dev-qr-secret-change-me");

  let adminSession: string;
  let staffSession: string; // STAFF sin asignación al evento
  let assignedSession: string; // STAFF con StaffAssignment
  let dancerSession: string;
  let attendeeSession: string;
  let adminId: string;
  let assignedStaffId: string;

  const ids = {
    venueId: "",
    eventId: "",
    capEventId: "",
    attendeeId: "",
    staffPersonId: "",
    assignedPersonId: "",
    dancerId: "",
    lightPersonIds: [] as string[],
    checkinIds: [] as string[],
  };

  const post = (path: string, body: unknown, session?: string) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(session ? { cookie: `omnidance_session=${session}` } : {}),
      },
      body: JSON.stringify(body),
    });

  const mkCheckin = (data: {
    eventId: string;
    personId: string;
    passId?: string;
    staffId?: string;
    method?: string;
  }) =>
    prisma.checkin.create({
      data: {
        eventId: data.eventId,
        personId: data.personId,
        passId: data.passId ?? null,
        staffId: data.staffId ?? null,
        method: data.method ?? "SCAN",
        syncedAt: new Date(),
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CheckinsModule, AuthModule, QrModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    // params deterministas para los cargos de puerta
    await prisma.platformParam.upsert({
      where: { key: "service_fee.door_cash_clp" },
      update: { value: 0 },
      create: { key: "service_fee.door_cash_clp", value: 0 },
    });
    await prisma.platformParam.upsert({
      where: { key: "service_fee.door_app_clp" },
      update: { value: 700 },
      create: { key: "service_fee.door_app_clp", value: 700 },
    });

    // ─── personas ───
    const admin = await prisma.person.findFirstOrThrow({
      where: { email: "admin@omnidance.dev" },
    });
    adminId = admin.id;
    adminSession = await auth.issueSession(admin.id);

    const staff = await prisma.person.create({
      data: {
        name: "Staff Sin Asignación",
        roles: { create: [{ role: "STAFF", status: "APPROVED" }] },
      },
    });
    ids.staffPersonId = staff.id;
    staffSession = await auth.issueSession(staff.id);

    const assigned = await prisma.person.create({
      data: {
        name: "Staff Puerta Asignado",
        roles: { create: [{ role: "STAFF", status: "APPROVED" }] },
      },
    });
    ids.assignedPersonId = assigned.id;
    assignedStaffId = assigned.id;
    assignedSession = await auth.issueSession(assigned.id);

    const dancer = await prisma.person.create({
      data: {
        name: "Dancer Sin Permisos",
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    ids.dancerId = dancer.id;
    dancerSession = await auth.issueSession(dancer.id);

    const attendee = await prisma.person.create({ data: { name: "Asistente Gap" } });
    ids.attendeeId = attendee.id;
    attendeeSession = await auth.issueSession(attendee.id);

    // ─── eventos ───
    const venue = await prisma.venue.create({ data: { name: "Venue Gap Test" } });
    ids.venueId = venue.id;

    const event = await prisma.event.create({
      data: {
        venueId: venue.id,
        name: "Evento Gap Checkins",
        status: "PUBLISHED",
        doorPrice: 12000,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 4 * 3600 * 1000),
      },
    });
    ids.eventId = event.id;

    await prisma.staffAssignment.create({
      data: { eventId: event.id, personId: assigned.id, role: "DOOR_SALES" },
    });

    const capEvent = await prisma.event.create({
      data: {
        venueId: venue.id,
        name: "Evento Cap 1",
        status: "PUBLISHED",
        doorPrice: 5000,
        doorCap: 1,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 4 * 3600 * 1000),
      },
    });
    ids.capEventId = capEvent.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { targetId: { in: ids.checkinIds } },
    });
    await prisma.checkin.deleteMany({
      where: { eventId: { in: [ids.eventId, ids.capEventId] } },
    });
    await prisma.ticket.deleteMany({
      where: { eventId: { in: [ids.eventId, ids.capEventId] } },
    });
    await prisma.staffAssignment.deleteMany({
      where: { eventId: { in: [ids.eventId, ids.capEventId] } },
    });
    await prisma.event.deleteMany({
      where: { id: { in: [ids.eventId, ids.capEventId] } },
    });
    await prisma.venue.delete({ where: { id: ids.venueId } });
    await prisma.personRole.deleteMany({
      where: {
        personId: {
          in: [
            ids.staffPersonId,
            ids.assignedPersonId,
            ids.dancerId,
            ...ids.lightPersonIds,
          ],
        },
      },
    });
    await prisma.person.deleteMany({
      where: {
        id: {
          in: [
            ids.attendeeId,
            ids.staffPersonId,
            ids.assignedPersonId,
            ids.dancerId,
            ...ids.lightPersonIds,
          ],
        },
      },
    });
    await app.close();
  });

  describe("POST /api/checkins/:id/out", () => {
    it("owner cierra su propio check-in → 200 con outAt", async () => {
      const checkin = await mkCheckin({
        eventId: ids.eventId,
        personId: ids.attendeeId,
      });
      ids.checkinIds.push(checkin.id);

      const res = await post(`/api/checkins/${checkin.id}/out`, {}, attendeeSession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(checkin.id);
      expect(body.outAt).toBeTruthy();
    });

    it("idempotente: segundo out → 200 sin cambiar outAt", async () => {
      const checkin = await prisma.checkin.findUniqueOrThrow({
        where: { id: ids.checkinIds[0] },
      });
      const res = await post(`/api/checkins/${checkin.id}/out`, {}, attendeeSession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.outAt).toBe(checkin.outAt?.toISOString());
    });

    it("staff (admin) cierra check-in ajeno → 200", async () => {
      const checkin = await mkCheckin({
        eventId: ids.eventId,
        personId: ids.attendeeId,
        method: "MANUAL",
      });
      ids.checkinIds.push(checkin.id);

      const res = await post(`/api/checkins/${checkin.id}/out`, {}, adminSession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.outAt).toBeTruthy();
    });

    it("staff con checkins.write sin asignación también puede (permiso global)", async () => {
      const checkin = await mkCheckin({
        eventId: ids.eventId,
        personId: ids.attendeeId,
      });
      ids.checkinIds.push(checkin.id);

      const res = await post(`/api/checkins/${checkin.id}/out`, {}, staffSession);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.outAt).toBeTruthy();
    });

    it("tercero sin permiso ni ownership → 403", async () => {
      const checkin = await mkCheckin({
        eventId: ids.eventId,
        personId: ids.attendeeId,
      });
      ids.checkinIds.push(checkin.id);

      const res = await post(`/api/checkins/${checkin.id}/out`, {}, dancerSession);
      expect(res.status).toBe(403);
    });

    it("check-in inexistente → 404", async () => {
      const res = await post("/api/checkins/chk-ghost/out", {}, adminSession);
      expect(res.status).toBe(404);
    });

    it("sin sesión → 401", async () => {
      const res = await post(`/api/checkins/${ids.checkinIds[0]}/out`, {});
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/checkins/:id/void", () => {
    it("admin anula → voidedAt+reason, ticket USED vuelve ACTIVE, audit CHECKIN_VOID", async () => {
      const ticket = await prisma.ticket.create({
        data: {
          eventId: ids.eventId,
          ownerId: ids.attendeeId,
          buyerId: ids.attendeeId,
          listPrice: 12000,
          serviceFee: 0,
          status: "USED",
        },
      });
      const checkin = await mkCheckin({
        eventId: ids.eventId,
        personId: ids.attendeeId,
        passId: ticket.id,
        staffId: adminId,
      });
      ids.checkinIds.push(checkin.id);

      const res = await post(
        `/api/checkins/${checkin.id}/void`,
        { reason: "escaneo duplicado" },
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.voidedAt).toBeTruthy();
      expect(body.voidReason).toBe("escaneo duplicado");

      const t = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(t.status).toBe("ACTIVE");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "CHECKIN_VOID", targetId: checkin.id },
      });
      expect(audit).toBeTruthy();
      expect(audit!.actorId).toBe(adminId);
      const payload = audit!.payload as Record<string, unknown>;
      expect(payload.checkinId).toBe(checkin.id);
      expect(payload.eventId).toBe(ids.eventId);
      expect(payload.reason).toBe("escaneo duplicado");
      expect(payload).toHaveProperty("prevOutAt");
    });

    it("ya anulado → 409", async () => {
      const res = await post(
        `/api/checkins/${ids.checkinIds[ids.checkinIds.length - 1]}/void`,
        { reason: "otra vez" },
        adminSession,
      );
      expect(res.status).toBe(409);
    });

    it("staff asignado al evento anula → 200", async () => {
      const checkin = await mkCheckin({
        eventId: ids.eventId,
        personId: ids.attendeeId,
      });
      ids.checkinIds.push(checkin.id);

      const res = await post(
        `/api/checkins/${checkin.id}/void`,
        { reason: "cortesía retirada" },
        assignedSession,
      );
      expect(res.status).toBe(200);
    });

    it("staff con permiso pero sin asignación → 403", async () => {
      const checkin = await mkCheckin({
        eventId: ids.eventId,
        personId: ids.attendeeId,
      });
      ids.checkinIds.push(checkin.id);

      const res = await post(
        `/api/checkins/${checkin.id}/void`,
        { reason: "intento" },
        staffSession,
      );
      expect(res.status).toBe(403);
    });

    it("sin rol de staff → 403 (guard)", async () => {
      const res = await post(
        `/api/checkins/${ids.checkinIds[0]}/void`,
        { reason: "x" },
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("check-in inexistente → 404", async () => {
      const res = await post(
        "/api/checkins/chk-ghost/void",
        { reason: "x" },
        adminSession,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/checkins/door-sale", () => {
    it("CASH con phone nuevo → cuenta ligera + ticket USED fee 0 + checkin MANUAL + qrToken", async () => {
      const res = await post(
        "/api/checkins/door-sale",
        {
          eventId: ids.eventId,
          channel: "CASH",
          name: "Puerta Cash",
          phone: phone(),
        },
        adminSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.lightPersonIds.push(body.person.id);
      ids.checkinIds.push(body.checkin.id);

      expect(body.person.name).toBe("Puerta Cash");
      expect(body.ticket.status).toBe("USED");
      expect(body.ticket.serviceFee).toBe(0);
      expect(body.ticket.listPrice).toBe(12000);
      expect(body.ticket.ownerId).toBe(body.person.id);
      expect(body.checkin.method).toBe("MANUAL");
      expect(body.checkin.staffId).toBe(adminId);
      expect(body.checkin.passId).toBe(body.ticket.id);
      expect(body.qrToken).toBeTruthy();

      const { personId } = await qr.verify(body.qrToken);
      expect(personId).toBe(body.person.id);

      const person = await prisma.person.findUniqueOrThrow({
        where: { id: body.person.id },
        include: { roles: true },
      });
      expect(person.isLightAccount).toBe(true);
      expect(person.roles.some((r) => r.role === "DANCER" && r.status === "APPROVED")).toBe(true);
    });

    it("APP cobra service_fee.door_app_clp = 700", async () => {
      const res = await post(
        "/api/checkins/door-sale",
        {
          eventId: ids.eventId,
          channel: "APP",
          name: "Puerta App",
          phone: phone(),
        },
        adminSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.lightPersonIds.push(body.person.id);
      ids.checkinIds.push(body.checkin.id);
      expect(body.ticket.serviceFee).toBe(700);
    });

    it("phone ya registrado → reutiliza la Person (no duplica)", async () => {
      const existing = await prisma.person.findUniqueOrThrow({
        where: { id: ids.attendeeId },
      });
      const withPhone = await prisma.person.create({
        data: { name: "Ya Tenía Cuenta", phone: phone() },
      });
      ids.lightPersonIds.push(withPhone.id);

      const res = await post(
        "/api/checkins/door-sale",
        {
          eventId: ids.eventId,
          channel: "CASH",
          name: "Nombre Ignorado",
          phone: withPhone.phone,
        },
        adminSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.checkinIds.push(body.checkin.id);
      expect(body.person.id).toBe(withPhone.id);
      expect(body.person.name).toBe("Ya Tenía Cuenta");
      expect(existing.id).not.toBe(body.person.id);
    });

    it("staff asignado al evento → 201", async () => {
      const res = await post(
        "/api/checkins/door-sale",
        {
          eventId: ids.eventId,
          channel: "CASH",
          name: "Venta Staff",
          phone: phone(),
        },
        assignedSession,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      ids.lightPersonIds.push(body.person.id);
      ids.checkinIds.push(body.checkin.id);
      expect(body.checkin.staffId).toBe(assignedStaffId);
    });

    it("staff con permiso pero sin asignación → 403", async () => {
      const res = await post(
        "/api/checkins/door-sale",
        {
          eventId: ids.eventId,
          channel: "CASH",
          name: "No Entra",
          phone: phone(),
        },
        staffSession,
      );
      expect(res.status).toBe(403);
    });

    it("sin rol staff/admin → 403", async () => {
      const res = await post(
        "/api/checkins/door-sale",
        {
          eventId: ids.eventId,
          channel: "CASH",
          name: "Dancer Intenta",
          phone: phone(),
        },
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("doorCap agotado → 409", async () => {
      const first = await post(
        "/api/checkins/door-sale",
        {
          eventId: ids.capEventId,
          channel: "CASH",
          name: "Primero",
          phone: phone(),
        },
        adminSession,
      );
      expect(first.status).toBe(201);
      const b1 = await first.json();
      ids.lightPersonIds.push(b1.person.id);
      ids.checkinIds.push(b1.checkin.id);

      const second = await post(
        "/api/checkins/door-sale",
        {
          eventId: ids.capEventId,
          channel: "CASH",
          name: "Segundo",
          phone: phone(),
        },
        adminSession,
      );
      expect(second.status).toBe(409);
      const body = await second.json();
      expect(body.error).toBe("DOOR_CAP_REACHED");
    });

    it("evento inexistente → 404", async () => {
      const res = await post(
        "/api/checkins/door-sale",
        {
          eventId: "evt-ghost",
          channel: "CASH",
          name: "X",
          phone: phone(),
        },
        adminSession,
      );
      expect(res.status).toBe(404);
    });

    it("sin sesión → 401", async () => {
      const res = await post("/api/checkins/door-sale", {
        eventId: ids.eventId,
        channel: "CASH",
        name: "X",
        phone: phone(),
      });
      expect(res.status).toBe(401);
    });
  });
});

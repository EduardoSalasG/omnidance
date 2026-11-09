import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { AdminModule } from "../src/admin/admin.module";
import { PrismaService } from "../src/prisma.service";
import { deletePeople } from "./helpers";

describe("admin role assignment e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let adminSession: string;
  let dancerSession: string;

  const ids = { dancerId: "" };
  const createdPersonIds: string[] = [];

  const req = (method: string, path: string, body?: unknown, session?: string) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(session ? { cookie: `omnidance_session=${session}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const get = (path: string, session?: string) =>
    req("GET", path, undefined, session);
  const post = (path: string, body: unknown, session?: string) =>
    req("POST", path, body, session);
  const del = (path: string, session?: string) =>
    req("DELETE", path, undefined, session);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AdminModule, AuthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    const admin = await prisma.person.findFirstOrThrow({
      where: { email: "admin@omnidance.dev" },
    });
    adminSession = await auth.issueSession(admin.id);

    const dancer = await prisma.person.create({
      data: {
        name: "Bailarín Target Test",
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    ids.dancerId = dancer.id;
    createdPersonIds.push(dancer.id);
    dancerSession = await auth.issueSession(dancer.id);
  });

  afterAll(async () => {
    await prisma.personRole.deleteMany({
      where: { personId: { in: createdPersonIds } },
    });
    await deletePeople(prisma, createdPersonIds);
    await app.close();
  });

  describe("auto-solicitud de roles eliminada", () => {
    it("POST /api/roles/request → 404 (endpoint removido)", async () => {
      const res = await post(
        "/api/roles/request",
        { role: "INSTRUCTOR" },
        dancerSession,
      );
      expect(res.status).toBe(404);
    });

    it("GET /api/roles/catalog → 404 (endpoint removido)", async () => {
      const res = await get("/api/roles/catalog", dancerSession);
      expect(res.status).toBe(404);
    });

    it("GET /api/admin/role-requests → 404 (cola removida)", async () => {
      const res = await get("/api/admin/role-requests", adminSession);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/admin/users/:personId/roles", () => {
    it("sin sesión → 401", async () => {
      const res = await post(`/api/admin/users/${ids.dancerId}/roles`, {
        role: "INSTRUCTOR",
        status: "APPROVED",
      });
      expect(res.status).toBe(401);
    });

    it("sin rol ADMIN → 403", async () => {
      const res = await post(
        `/api/admin/users/${ids.dancerId}/roles`,
        { role: "INSTRUCTOR", status: "APPROVED" },
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("admin asigna rol directamente → status elegido", async () => {
      const res = await post(
        `/api/admin/users/${ids.dancerId}/roles`,
        { role: "INSTRUCTOR", status: "APPROVED" },
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role).toBe("INSTRUCTOR");
      expect(body.status).toBe("APPROVED");
      const role = await prisma.personRole.findUniqueOrThrow({
        where: {
          personId_role: { personId: ids.dancerId, role: "INSTRUCTOR" },
        },
      });
      expect(role.status).toBe("APPROVED");
    });

    it("re-asignación actualiza el status (upsert)", async () => {
      const res = await post(
        `/api/admin/users/${ids.dancerId}/roles`,
        { role: "INSTRUCTOR", status: "PENDING" },
        adminSession,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("PENDING");
    });

    it("rol fuera del catálogo → 400", async () => {
      const res = await post(
        `/api/admin/users/${ids.dancerId}/roles`,
        { role: "SUPERVILLAIN", status: "APPROVED" },
        adminSession,
      );
      expect(res.status).toBe(400);
    });

    it("status inválido → 400", async () => {
      const res = await post(
        `/api/admin/users/${ids.dancerId}/roles`,
        { role: "DJ", status: "MAYBE" },
        adminSession,
      );
      expect(res.status).toBe(400);
    });

    it("persona inexistente → 404", async () => {
      const res = await post(
        "/api/admin/users/persona-fantasma/roles",
        { role: "DJ", status: "APPROVED" },
        adminSession,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/admin/users/:personId/roles/:role", () => {
    it("sin rol ADMIN → 403", async () => {
      const res = await del(
        `/api/admin/users/${ids.dancerId}/roles/INSTRUCTOR`,
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("admin revoca el rol → ok y fila eliminada", async () => {
      const res = await del(
        `/api/admin/users/${ids.dancerId}/roles/INSTRUCTOR`,
        adminSession,
      );
      expect(res.status).toBe(200);
      const role = await prisma.personRole.findUnique({
        where: {
          personId_role: { personId: ids.dancerId, role: "INSTRUCTOR" },
        },
      });
      expect(role).toBeNull();
    });

    it("rol que la persona no tiene → 404", async () => {
      const res = await del(
        `/api/admin/users/${ids.dancerId}/roles/DJ`,
        adminSession,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/admin/users/:personId (cascada)", () => {
    it("sin sesión → 401", async () => {
      const res = await del(`/api/admin/users/${ids.dancerId}`);
      expect(res.status).toBe(401);
    });

    it("sin rol ADMIN → 403", async () => {
      const res = await del(
        `/api/admin/users/${ids.dancerId}`,
        dancerSession,
      );
      expect(res.status).toBe(403);
    });

    it("borrarse a sí mismo → 400", async () => {
      const admin = await prisma.person.findFirstOrThrow({
        where: { email: "admin@omnidance.dev" },
      });
      const res = await del(`/api/admin/users/${admin.id}`, adminSession);
      expect(res.status).toBe(400);
    });

    it("persona inexistente → 404", async () => {
      const res = await del(
        "/api/admin/users/persona-fantasma",
        adminSession,
      );
      expect(res.status).toBe(404);
    });

    it("admin borra → baja lógica: fila y grafo intactos, auth bloqueada, reactivable", async () => {
      const style = await prisma.style.findFirstOrThrow();
      // Email único por corrida - con soft delete el anterior queda
      // persistido (esa es la feature) y rompería la unique.
      const victimEmail = `victima-cascade-${Date.now()}@omnidance.dev`;
      const victim = await prisma.person.create({
        data: {
          name: "Victima Cascade",
          email: victimEmail,
          roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
          styleRoles: {
            create: [{ styleId: style.id, role: "LEADER" }],
          },
        },
      });
      const res = await del(`/api/admin/users/${victim.id}`, adminSession);
      expect(res.status).toBe(200);

      // Soft delete: la fila sigue con deletedAt y el grafo intacto.
      const kept = await prisma.person.findUnique({
        where: { id: victim.id },
      });
      expect(kept?.deletedAt).toBeInstanceOf(Date);
      expect(
        await prisma.personStyleRole.count({
          where: { personId: victim.id },
        }),
      ).toBe(1);
      expect(
        await prisma.personRole.count({ where: { personId: victim.id } }),
      ).toBe(1);

      // El email NO se libera (la persona existe) - el admin reactiva.
      const reused = await post(
        "/api/auth/register",
        {
          email: victimEmail,
          password: "secreto123",
          name: "Reciclada",
          consent: true,
        },
      );
      expect(reused.status).toBe(409);

      // Reactivar: deletedAt null, datos intactos.
      const re = await post(
        `/api/admin/users/${victim.id}/reactivate`,
        {},
        adminSession,
      );
      expect(re.status).toBe(200);
      const back = await prisma.person.findUnique({
        where: { id: victim.id },
      });
      expect(back?.deletedAt).toBeNull();
      createdPersonIds.push(victim.id);
    });
  });

  describe("notificaciones de aprobación/rechazo de rol", () => {
    it("approve → notificación role.approved al actor", async () => {
      const suffix = Date.now();
      const producer = await prisma.person.create({
        data: {
          name: "Productor Notify",
          email: `notify-${suffix}@omnidance.dev`,
          phone: `+5690000${String(suffix).slice(-4)}`,
          verifiedAt: new Date(),
          roles: {
            create: [{ role: "PRODUCER", status: "PENDING" }],
          },
        },
      });
      createdPersonIds.push(producer.id);
      // actorData: el productor necesita un evento para el checklist.
      const event = await prisma.event.create({
        data: {
          name: "Evento Notify",
          producerId: producer.id,
          startsAt: new Date(Date.now() + 86400e3),
          endsAt: new Date(Date.now() + 86400e3 + 7200e3),
        },
      });
      const role = await prisma.personRole.findFirstOrThrow({
        where: { personId: producer.id, role: "PRODUCER" },
      });
      const res = await post(
        `/api/admin/validation-queue/${role.id}/approve`,
        {},
        adminSession,
      );
      expect(res.status).toBe(200);
      const notif = await prisma.notification.findFirst({
        where: { personId: producer.id, type: "role.approved" },
      });
      expect(notif).not.toBeNull();
      await prisma.notification.deleteMany({
        where: { personId: producer.id },
      });
      await prisma.event.delete({ where: { id: event.id } });
    });

    it("reject → notificación role.rejected al actor", async () => {
      const producer = await prisma.person.create({
        data: {
          name: "Rechazado Notify",
          roles: {
            create: [{ role: "PRODUCER", status: "PENDING" }],
          },
        },
      });
      createdPersonIds.push(producer.id);
      const role = await prisma.personRole.findFirstOrThrow({
        where: { personId: producer.id, role: "PRODUCER" },
      });
      const res = await post(
        `/api/admin/validation-queue/${role.id}/reject`,
        {},
        adminSession,
      );
      expect(res.status).toBe(200);
      const notif = await prisma.notification.findFirst({
        where: { personId: producer.id, type: "role.rejected" },
      });
      expect(notif).not.toBeNull();
    });
  });

  describe("trial del productor al aprobar el rol (spec platform-trials)", () => {
    const mkProducerPending = async (tag: string, over = {}) => {
      const suffix = `${tag}${Date.now()}`;
      const person = await prisma.person.create({
        data: {
          name: `Prod Trial ${tag}`,
          email: `trial-${suffix}@omnidance.dev`,
          phone: `+5699${suffix.slice(-7)}`,
          verifiedAt: new Date(),
          roles: { create: [{ role: "PRODUCER", status: "PENDING" }] },
          ...over,
        },
      });
      createdPersonIds.push(person.id);
      // actorData del checklist: el productor necesita un evento.
      const event = await prisma.event.create({
        data: {
          name: `Evento Trial ${tag}`,
          producerId: person.id,
          startsAt: new Date(Date.now() + 86400e3),
          endsAt: new Date(Date.now() + 86400e3 + 7200e3),
        },
      });
      return { person, event };
    };
    const cleanup = async (personId: string, eventId: string) => {
      await prisma.activityEvent.deleteMany({ where: { personId } });
      await prisma.notification.deleteMany({ where: { personId } });
      await prisma.platformSubscription.deleteMany({
        where: { producerId: personId },
      });
      await prisma.event.delete({ where: { id: eventId } });
    };

    it("approve → proTrialEndsAt ≈ +15d y ActivityEvent trial.started", async () => {
      const { person, event } = await mkProducerPending("qa");
      const role = await prisma.personRole.findFirstOrThrow({
        where: { personId: person.id, role: "PRODUCER" },
      });
      const res = await post(
        `/api/admin/validation-queue/${role.id}/approve`,
        {},
        adminSession,
      );
      expect(res.status).toBe(200);
      const after = await prisma.person.findUniqueOrThrow({
        where: { id: person.id },
      });
      expect(after.proTrialEndsAt).not.toBeNull();
      const ms = after.proTrialEndsAt!.getTime() - Date.now();
      expect(ms).toBeGreaterThan(13 * 86400e3);
      expect(ms).toBeLessThan(17 * 86400e3);
      const act = await prisma.activityEvent.findFirst({
        where: { personId: person.id, type: "trial.started" },
      });
      expect(act).not.toBeNull();
      await cleanup(person.id, event.id);
    });

    it("approve con trial vigente no lo reinicia", async () => {
      const future = new Date(Date.now() + 30 * 86400e3);
      const { person, event } = await mkProducerPending("qb", {
        proTrialEndsAt: future,
      });
      const role = await prisma.personRole.findFirstOrThrow({
        where: { personId: person.id, role: "PRODUCER" },
      });
      const res = await post(
        `/api/admin/validation-queue/${role.id}/approve`,
        {},
        adminSession,
      );
      expect(res.status).toBe(200);
      const after = await prisma.person.findUniqueOrThrow({
        where: { id: person.id },
      });
      expect(after.proTrialEndsAt?.getTime()).toBe(future.getTime());
      await cleanup(person.id, event.id);
    });

    it("approve con suscripción Pro viva no otorga trial", async () => {
      const { person, event } = await mkProducerPending("qc");
      await prisma.platformSubscription.create({
        data: {
          kind: "PRODUCER",
          producerId: person.id,
          personId: person.id,
          tierCode: "PRO_STARTER",
          billingCycle: "MONTHLY",
          status: "ACTIVE",
        },
      });
      const role = await prisma.personRole.findFirstOrThrow({
        where: { personId: person.id, role: "PRODUCER" },
      });
      const res = await post(
        `/api/admin/validation-queue/${role.id}/approve`,
        {},
        adminSession,
      );
      expect(res.status).toBe(200);
      const after = await prisma.person.findUniqueOrThrow({
        where: { id: person.id },
      });
      expect(after.proTrialEndsAt).toBeNull();
      await cleanup(person.id, event.id);
    });

    it("grant directo (POST users/:id/roles) también otorga el trial", async () => {
      const { person, event } = await mkProducerPending("qd");
      const res = await post(
        `/api/admin/users/${person.id}/roles`,
        { role: "PRODUCER", status: "APPROVED" },
        adminSession,
      );
      expect(res.status).toBe(200);
      const after = await prisma.person.findUniqueOrThrow({
        where: { id: person.id },
      });
      expect(after.proTrialEndsAt).not.toBeNull();
      const ms = after.proTrialEndsAt!.getTime() - Date.now();
      expect(ms).toBeGreaterThan(13 * 86400e3);
      await cleanup(person.id, event.id);
    });
  });
});

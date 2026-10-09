import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { SocialModule } from "../src/social/social.module";
import { PaymentsModule } from "../src/payments/payments.module";
import { PrismaService } from "../src/prisma.service";
// Controller montado directo en el test module para cubrir el contrato HTTP.
import { VenuesController } from "../src/social/infrastructure/venues.controller";
import { deletePeople } from "./helpers";

describe("social endpoints e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(
    process.env.JWT_SECRET ?? "dev-secret-change-me",
  );

  let sessionA: string;
  let sessionB: string;
  let sessionC: string;

  const ids = {
    personAId: "",
    personBId: "",
    personCId: "",
    venueActiveId: "",
    venueInactiveId: "",
    eventId: "",
    ticketActiveId: "",
    ticketUsedId: "",
  };

  const EMAIL_C = "se-recipient@test.local";
  const EMAIL_B = "se-owner@test.local";

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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SocialModule, PaymentsModule, AuthModule],
      controllers: [VenuesController],
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
    const a = await prisma.person.create({
      data: {
        name: "SE Persona A",
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    ids.personAId = a.id;
    sessionA = await auth.issueSession(a.id);

    const b = await prisma.person.create({
      data: {
        name: "SE Persona B",
        email: EMAIL_B,
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    ids.personBId = b.id;
    sessionB = await auth.issueSession(b.id);

    const c = await prisma.person.create({
      data: {
        name: "SE Persona C",
        email: EMAIL_C,
        roles: { create: [{ role: "DANCER", status: "APPROVED" }] },
      },
    });
    ids.personCId = c.id;
    sessionC = await auth.issueSession(c.id);

    const venueActive = await prisma.venue.create({
      data: { name: "SE Venue Activo", address: "Calle 1", capacity: 100 },
    });
    ids.venueActiveId = venueActive.id;
    const venueInactive = await prisma.venue.create({
      data: { name: "SE Venue Inactivo", active: false },
    });
    ids.venueInactiveId = venueInactive.id;

    const event = await prisma.event.create({
      data: {
        venueId: venueActive.id,
        name: "SE Evento",
        status: "PUBLISHED",
        startsAt: new Date(Date.now() + 24 * 3600 * 1000),
        endsAt: new Date(Date.now() + 30 * 3600 * 1000),
      },
    });
    ids.eventId = event.id;

    // Tickets de B: uno ACTIVE, uno USED
    const tActive = await prisma.ticket.create({
      data: {
        eventId: event.id,
        ownerId: b.id,
        buyerId: a.id, // comprador ≠ dueño - no debe cambiar al transferir
        listPrice: 5000,
        serviceFee: 500,
      },
    });
    ids.ticketActiveId = tActive.id;
    const tUsed = await prisma.ticket.create({
      data: {
        eventId: event.id,
        ownerId: b.id,
        buyerId: b.id,
        listPrice: 5000,
        serviceFee: 500,
        status: "USED",
      },
    });
    ids.ticketUsedId = tUsed.id;
  });

  afterAll(async () => {
    const peopleIds = [ids.personAId, ids.personBId, ids.personCId];
    await prisma.ticket.deleteMany({ where: { eventId: ids.eventId } });
    await prisma.event.delete({ where: { id: ids.eventId } });
    await prisma.venue.deleteMany({
      where: { id: { in: [ids.venueActiveId, ids.venueInactiveId] } },
    });
    await prisma.personRole.deleteMany({
      where: { personId: { in: peopleIds } },
    });
    await deletePeople(prisma, peopleIds);
    await app.close();
  });

  // ═══════════════════════ GET /api/venues ═══════════════════════
  describe("GET /api/venues", () => {
    it("público: lista activos ordenados por name, sin inactivos", async () => {
      const res = await fetch(`${baseUrl}/api/venues`);
      expect(res.status).toBe(200);
      const venues = await res.json();
      expect(Array.isArray(venues)).toBe(true);

      const found = venues.find((v: { id: string }) => v.id === ids.venueActiveId);
      expect(found).toMatchObject({
        name: "SE Venue Activo",
        address: "Calle 1",
        capacity: 100,
      });
      expect(
        venues.some((v: { id: string }) => v.id === ids.venueInactiveId),
      ).toBe(false);

      const names = venues.map((v: { name: string }) => v.name);
      expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
      // shape contract: datos públicos del local - alimentan selects,
      // el mapa de /eventos y el perfil público /locales/:id.
      for (const v of venues) {
        expect(Object.keys(v).sort()).toEqual(
          [
            "address",
            "capacity",
            "hours",
            "id",
            "lat",
            "lng",
            "logoUrl",
            "name",
          ].sort(),
        );
      }
    });
  });

  // ═══════════════════════ TICKET TRANSFER ═══════════════════════
  describe("POST /api/tickets/:id/transfer", () => {
    it("sin sesión → 401", async () => {
      const res = await req("POST", `/api/tickets/${ids.ticketActiveId}/transfer`, {
        toEmail: EMAIL_C,
      });
      expect(res.status).toBe(401);
    });

    it("ticket inexistente → 404", async () => {
      const res = await req(
        "POST",
        "/api/tickets/tkt-fantasma/transfer",
        { toEmail: EMAIL_C },
        sessionB,
      );
      expect(res.status).toBe(404);
    });

    it("no dueño → 403", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketActiveId}/transfer`,
        { toEmail: EMAIL_C },
        sessionA,
      );
      expect(res.status).toBe(403);
    });

    it("ticket no ACTIVE → 409", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketUsedId}/transfer`,
        { toEmail: EMAIL_C },
        sessionB,
      );
      expect(res.status).toBe(409);
    });

    it("email inexistente → 400", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketActiveId}/transfer`,
        { toEmail: "nadie@test.local" },
        sessionB,
      );
      expect(res.status).toBe(400);
    });

    it("mismo dueño → 400", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketActiveId}/transfer`,
        { toEmail: EMAIL_B },
        sessionB,
      );
      expect(res.status).toBe(400);
    });

    it("toEmail inválido → 400", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketActiveId}/transfer`,
        { toEmail: "no-es-email" },
        sessionB,
      );
      expect(res.status).toBe(400);
    });

    it("transfiere: ownerId→destinatario, giftedFromId→ex-dueño, buyerId intacto", async () => {
      const res = await req(
        "POST",
        `/api/tickets/${ids.ticketActiveId}/transfer`,
        { toEmail: EMAIL_C },
        sessionB,
      );
      expect(res.status).toBe(200);
      const ticket = await res.json();
      expect(ticket.ownerId).toBe(ids.personCId);
      expect(ticket.giftedFromId).toBe(ids.personBId);
      expect(ticket.buyerId).toBe(ids.personAId);
      expect(ticket.status).toBe("ACTIVE");

      // el ticket ahora aparece en /tickets/mine del destinatario
      const mine = await (
        await fetch(`${baseUrl}/api/tickets/mine`, {
          headers: { cookie: `omnidance_session=${sessionC}` },
        })
      ).json();
      expect(mine.some((t: { id: string }) => t.id === ids.ticketActiveId)).toBe(
        true,
      );
    });
  });
});

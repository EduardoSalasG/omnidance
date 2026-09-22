import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { SocialModule } from "../src/social/social.module";
import { AuthService } from "../src/auth/domain/auth.service";
import { PrismaService } from "../src/prisma.service";

/**
 * venue-routes-wiring — regresión de orden de controllers.
 *
 * `VenuesController` (público) y `VenueConsoleController` comparten el
 * prefijo "venues". Si el público se registra primero, su `@Get(":id")`
 * captura `/venues/mine` y la consola del venue devuelve 404
 * "Local no encontrado". Este spec monta el SocialModule REAL (no los
 * controllers sueltos) para cubrir el wiring completo.
 */
describe("venue routes wiring e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const auth = new AuthService(process.env.JWT_SECRET ?? "dev-secret-change-me");

  const suffix = Date.now().toString(36);
  let session = "";
  let personId = "";
  let venueId = "";

  const get = (path: string, cookie?: string) =>
    fetch(`${baseUrl}${path}`, {
      headers: cookie ? { cookie: `omnidance_session=${cookie}` } : {},
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SocialModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;

    const person = await prisma.person.create({
      data: {
        name: `Wiring Venue ${suffix}`,
        roles: { create: [{ role: "VENUE_MANAGER", status: "APPROVED" }] },
      },
    });
    personId = person.id;
    session = await auth.issueSession(person.id);
    const venue = await prisma.venue.create({
      data: {
        name: `Wiring Club ${suffix}`,
        address: "Test 123",
        ownerId: person.id,
      },
    });
    venueId = venue.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.venue.deleteMany({ where: { id: venueId } });
    await prisma.personRole.deleteMany({ where: { personId } });
    await prisma.person.deleteMany({ where: { id: personId } });
    await app.close();
  }, 30_000);

  it("GET /venues/mine resuelve a la consola (no al :id público)", async () => {
    const res = await get("/api/venues/mine", session);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.map((v: { id: string }) => v.id)).toContain(venueId);
  });

  it("GET /venues/mine sin sesión → 401 (SessionGuard de la consola)", async () => {
    const res = await get("/api/venues/mine");
    expect(res.status).toBe(401);
  });

  it("GET /venues/:id público sigue resolviendo el detalle", async () => {
    const res = await get(`/api/venues/${venueId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(venueId);
    expect(body.name).toContain("Wiring Club");
  });

  it("GET /venues/:id/dashboard del venue propio → 200 con tables+flow", async () => {
    const res = await get(`/api/venues/${venueId}/dashboard`, session);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("tables");
    expect(body).toHaveProperty("flow");
  });
});

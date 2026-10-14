import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { Request } from "express";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller
import { ProducerController } from "./producer.controller";
import type { PrismaService } from "../../prisma.service";
import type { ParamsService } from "../../params/params.service";

// GET /producer/dashboard (spec events/producer-console): agrega KPIs
// + tops + cola de comprobantes SOLO de los eventos del productor -
// gate productor APPROVED o admin.access (permiso desde DB).

const req = (id: string, roles: string[] = []) =>
  ({ person: { id, roles } }) as unknown as Request;

function mk(over: {
  producer?: boolean;
  admin?: boolean;
  events?: { id: string; status: string; endsAt: Date }[];
  sold?: number;
  grossMonth?: number | null;
  revenueBy?: { eventId: string | null; _sum: { amount: number | null } }[];
  checkinsBy?: { eventId: string | null; _count: { _all: number } }[];
  claimsCount?: number;
  claimsAmount?: number | null;
  claims?: {
    id: string;
    methodLabel: string;
    createdAt: Date;
    person: { name: string };
    payment: { amount: number };
  }[];
  topEvents?: { id: string; name: string; startsAt: Date }[];
  existingPerson?: {
    id: string;
    name: string | null;
    email: string | null;
    photoUrl: string | null;
  } | null;
}) {
  const prisma = {
    personRole: {
      findUnique: vi.fn(async () =>
        over.producer ? { status: "APPROVED" } : null,
      ),
      upsert: vi.fn(async () => ({})),
    },
    role: {
      findMany: vi.fn(async () =>
        over.admin
          ? [
              {
                key: "ADMIN",
                isSuperuser: false,
                permissions: [{ permissionKey: "admin.access" }],
              },
            ]
          : [],
      ),
    },
    event: {
      findMany: vi.fn(async (args?: { select?: unknown }) =>
        // 2da llamada (topEvents) trae name/startsAt; la 1ra solo
        // id/status/endsAt - el fake devuelve lo que le pasen.
        args?.select && "name" in (args.select as object)
          ? (over.topEvents ?? [])
          : (over.events ?? []),
      ),
    },
    ticket: { count: vi.fn(async () => over.sold ?? 0) },
    payment: {
      aggregate: vi.fn(async (args?: { where?: { ticketClaims?: unknown } }) =>
        // aggregate se usa dos veces: grossMonth (where.eventId) y el
        // monto de la cola (where.ticketClaims.some).
        ({
          _sum: {
            amount: args?.where?.ticketClaims
              ? (over.claimsAmount ?? null)
              : (over.grossMonth ?? null),
          },
        }),
      ),
      groupBy: vi.fn(async () => over.revenueBy ?? []),
    },
    checkin: { groupBy: vi.fn(async () => over.checkinsBy ?? []) },
    ticketClaim: {
      count: vi.fn(async () => over.claimsCount ?? 0),
      findMany: vi.fn(async () => over.claims ?? []),
    },
    // Colaboradores: findUnique resuelve persona existente; create arma
    // el stub; $transaction ejecuta los upserts en paralelo.
    person: {
      findUnique: vi.fn(async () => over.existingPerson ?? null),
      create: vi.fn(
        async (args: { data: { email: string; name: string } }) => ({
          id: "stub-1",
          name: args.data.name,
          email: args.data.email,
          photoUrl: null,
        }),
      ),
      findMany: vi.fn(async () => []),
    },
    producerStaff: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => ({ id: "ps-1" })),
      deleteMany: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  const params = {} as ParamsService;
  const auth = {
    createMagicToken: vi.fn(async () => "invite-token"),
  } as never;
  const mailer = { send: vi.fn(async () => undefined) } as never;
  return {
    ctl: new ProducerController(prisma, params, auth, mailer),
    prisma,
    mailer: mailer as { send: ReturnType<typeof vi.fn> },
  };
}

describe("ProducerController.dashboard", () => {
  const future = new Date(Date.now() + 86400_000);
  const past = new Date(Date.now() - 86400_000);

  it("sin eventos → todo en cero", async () => {
    const { ctl } = mk({ producer: true, events: [] });
    const res = await ctl.dashboard(req("prod-1"));
    expect(res.kpis).toEqual({
      upcoming: 0,
      sold: 0,
      grossMonth: 0,
      pendingClaims: 0,
    });
    expect(res.topRevenue).toEqual([]);
    expect(res.topAttendance).toEqual([]);
    expect(res.pendingClaims).toEqual({ count: 0, amount: 0, items: [] });
  });

  it("upcoming solo cuenta PUBLISHED/LIVE a futuro; tops y cola mapean", async () => {
    const now = new Date();
    const { ctl } = mk({
      producer: true,
      events: [
        { id: "e1", status: "PUBLISHED", endsAt: future },
        { id: "e2", status: "LIVE", endsAt: future },
        { id: "e3", status: "ENDED", endsAt: past }, // pasado: no upcoming
        { id: "e4", status: "DRAFT", endsAt: future }, // draft: no upcoming
      ],
      sold: 42,
      grossMonth: 1_500_000,
      revenueBy: [
        { eventId: "e2", _sum: { amount: 900_000 } },
        { eventId: "e1", _sum: { amount: 600_000 } },
      ],
      checkinsBy: [{ eventId: "e3", _count: { _all: 120 } }],
      claimsCount: 3,
      claimsAmount: 45_000,
      claims: [
        {
          id: "clm-1",
          methodLabel: "Transferencia",
          createdAt: now,
          person: { name: "Bailarín Uno" },
          payment: { amount: 15_000 },
        },
      ],
      topEvents: [
        { id: "e1", name: "Social Miércoles", startsAt: future },
        { id: "e2", name: "Social Viernes", startsAt: future },
        { id: "e3", name: "Social Pasado", startsAt: past },
      ],
    });
    const res = await ctl.dashboard(req("prod-1"));
    expect(res.kpis.upcoming).toBe(2); // e1 + e2
    expect(res.kpis.sold).toBe(42);
    expect(res.kpis.grossMonth).toBe(1_500_000);
    expect(res.kpis.pendingClaims).toBe(3);
    expect(res.topRevenue.map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(res.topRevenue[0]).toMatchObject({
      name: "Social Viernes",
      grossClp: 900_000,
    });
    expect(res.topAttendance).toEqual([
      expect.objectContaining({ id: "e3", checkins: 120 }),
    ]);
    expect(res.pendingClaims.count).toBe(3);
    expect(res.pendingClaims.amount).toBe(45_000);
    expect(res.pendingClaims.items[0]).toMatchObject({
      personName: "Bailarín Uno",
      methodLabel: "Transferencia",
      amount: 15_000,
    });
  });

  it("groupBy con eventId null se excluye de los tops", async () => {
    const { ctl } = mk({
      producer: true,
      events: [{ id: "e1", status: "PUBLISHED", endsAt: future }],
      revenueBy: [
        { eventId: null, _sum: { amount: 10_000 } },
        { eventId: "e1", _sum: { amount: 5_000 } },
      ],
      topEvents: [{ id: "e1", name: "Único", startsAt: future }],
    });
    const res = await ctl.dashboard(req("prod-1"));
    expect(res.topRevenue.map((e) => e.id)).toEqual(["e1"]);
  });

  it("sin rol productor ni admin → 403", async () => {
    const { ctl } = mk({ producer: false, admin: false });
    await expect(ctl.dashboard(req("per-x"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("admin sin ser productor también entra", async () => {
    const { ctl } = mk({ producer: false, admin: true, events: [] });
    const res = await ctl.dashboard(req("adm-1", ["ADMIN"]));
    expect(res.kpis.upcoming).toBe(0);
  });
});

// POST /producer/staff: alta por personId o por correo (stub + invitación
// si no existe). Todo colaborador gana el rol DANCER.
describe("ProducerController.addStaff", () => {
  const existing = {
    id: "per-9",
    name: "Ya Registrado",
    email: "ya@omnidance.dev",
    photoUrl: null,
  };

  it("personId de persona existente → en nómina, sin email de invitación", async () => {
    const { ctl, mailer } = mk({ producer: true, existingPerson: existing });
    const res = await ctl.addStaff({ personId: "per-9" }, req("prod-1"));
    expect(res.invited).toBe(false);
    expect(res.person).toMatchObject({ id: "per-9", name: "Ya Registrado" });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("correo nuevo → crea stub, rol DANCER y manda invitación", async () => {
    const { ctl, mailer, prisma } = mk({ producer: true });
    const res = await ctl.addStaff(
      { email: "Nueva@Correo.CL", name: "Nueva Colab" },
      req("prod-1"),
    );
    expect(res.invited).toBe(true);
    // stub normaliza el correo y toma el nombre dado
    const personCreate = (prisma as never as { person: { create: ReturnType<typeof vi.fn> } }).person.create;
    expect(personCreate).toHaveBeenCalledWith({
      data: { email: "nueva@correo.cl", name: "Nueva Colab" },
      select: { id: true, name: true, email: true, photoUrl: true },
    });
    // DANCER se crea APPROVED; un rol existente conserva su estado
    const roleUpsert = (prisma as never as { personRole: { upsert: ReturnType<typeof vi.fn> } }).personRole.upsert;
    expect(roleUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { personId: "stub-1", role: "DANCER", status: "APPROVED" },
      }),
    );
    expect(mailer.send).toHaveBeenCalledWith(
      "nueva@correo.cl",
      expect.stringContaining("colaborador"),
      expect.stringContaining("invite-token"),
    );
  });

  it("correo de persona existente → se reusa, no invita", async () => {
    const { ctl, mailer } = mk({ producer: true, existingPerson: existing });
    const res = await ctl.addStaff({ email: "YA@omnidance.dev" }, req("prod-1"));
    expect(res.invited).toBe(false);
    expect(res.person.id).toBe("per-9");
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("agregarse a sí mismo → 400", async () => {
    const { ctl } = mk({
      producer: true,
      existingPerson: { ...existing, id: "prod-1" },
    });
    await expect(
      ctl.addStaff({ personId: "prod-1" }, req("prod-1")),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("sin personId ni email → 400", async () => {
    const { ctl } = mk({ producer: true });
    await expect(ctl.addStaff({}, req("prod-1"))).rejects.toMatchObject({
      status: 400,
    });
  });
});

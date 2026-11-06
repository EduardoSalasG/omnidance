import { describe, expect, it, vi } from "vitest";
// Orden de import: auth.controller antes del controller bajo test -
// resuelve el ciclo de decoradores (mismo patrón que
// classes.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { AcademiesController } from "./academies.controller";

// spec academies/console-lists (change academy-students-ux): buscador
// de persona del alta de enrollment y método de pago + contacto en la
// ficha del alumno.

type Person = { id: string; roles: string[] };

const reqAs = (p: Person) => ({ person: p }) as never;

const OWNER = { id: "owner-1", roles: ["ACADEMY_OWNER"] };

const makeCtrl = (prisma: unknown, access: unknown) =>
  new AcademiesController(
    prisma as never,
    access as never,
    {} as never,
    {} as never,
    {} as never,
  );

const okAccess = () => ({
  requireCapability: vi.fn().mockResolvedValue({ academy: {}, ctx: {} }),
  requireManage: vi.fn().mockResolvedValue({ academy: {}, ctx: {} }),
});

describe("AcademiesController.studentCandidates", () => {
  it("q de menos de 2 chars no consulta y devuelve []", async () => {
    const prisma = { person: { findMany: vi.fn() } };
    const ctrl = makeCtrl(prisma, okAccess());

    const res = await ctrl.studentCandidates("acad-1", reqAs(OWNER), "m");

    expect(res).toEqual([]);
    expect(prisma.person.findMany).not.toHaveBeenCalled();
  });

  it("busca por nombre O email contains insensitive, sin borradas, top 10", async () => {
    const people = [
      { id: "p1", name: "María Paz", email: "maria@x.cl" },
      { id: "p2", name: "Mariano", email: "mariano@x.cl" },
    ];
    const prisma = {
      person: { findMany: vi.fn().mockResolvedValue(people) },
    };
    const ctrl = makeCtrl(prisma, okAccess());

    const res = await ctrl.studentCandidates("acad-1", reqAs(OWNER), "mar");

    expect(res).toEqual(people);
    expect(prisma.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: "mar", mode: "insensitive" } },
            { email: { contains: "mar", mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, email: true },
        take: 10,
      }),
    );
  });

  it("exige la capacidad students", async () => {
    const prisma = { person: { findMany: vi.fn() } };
    const access = okAccess();
    const ctrl = makeCtrl(prisma, access);

    await ctrl.studentCandidates("acad-1", reqAs(OWNER), "ma");

    expect(access.requireCapability).toHaveBeenCalledWith(
      "acad-1",
      OWNER,
      "students",
    );
  });
});

describe("AcademiesController.studentDetail", () => {
  function makeDetailPrisma() {
    return {
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: "p1",
          name: "María",
          email: "maria@x.cl",
          phone: "+56911112222",
        }),
      },
      enrollment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "enr-1",
            status: "ACTIVE",
            startedAt: new Date("2026-10-01"),
            endsAt: new Date("2026-10-31"),
            plan: { id: "plan-1", name: "Mensual", type: "MONTHLY", price: 30000 },
            levels: [],
          },
          {
            id: "enr-2",
            status: "ACTIVE",
            startedAt: new Date("2026-08-01"),
            endsAt: new Date("2026-08-31"),
            plan: { id: "plan-1", name: "Mensual", type: "MONTHLY", price: 30000 },
            levels: [],
          },
        ]),
      },
      paymentClaim: {
        findMany: vi.fn().mockResolvedValue([
          {
            enrollmentId: "enr-1",
            status: "APPROVED",
            methodLabel: "Transferencia",
          },
        ]),
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([
          {
            refId: "mem_plan-1_abc123",
            methodLabel: null,
            gatewayMedia: "Webpay",
          },
        ]),
      },
      attendance: { findMany: vi.fn().mockResolvedValue([]) },
      classBooking: { findMany: vi.fn().mockResolvedValue([]) },
      relationshipScore: { findUnique: vi.fn().mockResolvedValue(null) },
    };
  }

  it("expone email/phone de la persona y método por enrollment (claim > pasarela)", async () => {
    const prisma = makeDetailPrisma();
    const access = {
      ...okAccess(),
      requireCapability: vi.fn().mockResolvedValue({}),
    };
    const ctrl = makeCtrl(prisma, access);

    const res = await ctrl.studentDetail("acad-1", "p1", reqAs(OWNER));

    expect(res.person).toMatchObject({
      id: "p1",
      email: "maria@x.cl",
      phone: "+56911112222",
    });
    // enr-1: claim APPROVED "Transferencia"; enr-2: sin claim →
    // fallback al pago PAID del plan (gatewayMedia "Webpay").
    expect(res.enrollments[0]).toMatchObject({
      id: "enr-1",
      method: "Transferencia",
    });
    expect(res.enrollments[1]).toMatchObject({
      id: "enr-2",
      method: "Webpay",
    });
  });

  it("enrollment sin claim ni pago queda con method null", async () => {
    const prisma = makeDetailPrisma();
    prisma.paymentClaim.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);
    const ctrl = makeCtrl(prisma, okAccess());

    const res = await ctrl.studentDetail("acad-1", "p1", reqAs(OWNER));

    expect(res.enrollments[0].method).toBeNull();
    expect(res.enrollments[1].method).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
// Orden de import: auth.controller antes del controller bajo test -
// resuelve el ciclo de decoradores (mismo patrón que
// classes.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { AcademyInvitesController } from "./academy-invites.controller";
import { AcademyInvitesService } from "./academy-invites.service";

// spec academies/student-invites: invitación de registro de la academia
// a personas SIN enrollment (cap `students`) - magic link con next a la
// ficha pública, push a cuentas existentes, dedup por pendiente y
// listado con pendientes primero.

type Person = { id: string; roles: string[] };

const reqAs = (p: Person) => ({ person: p }) as never;

const OWNER = { id: "owner-1", roles: ["ACADEMY_OWNER"] };
const DANCER = { id: "p-1", roles: ["DANCER"] };

function makeDeps() {
  const prisma = {
    academyInvite: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(async () => ({})),
      create: vi.fn(async ({ data }: { data: object }) => ({
        id: "inv-1",
        consumedAt: null,
        createdAt: new Date("2026-11-09"),
        ...data,
      })),
      findMany: vi.fn().mockResolvedValue([]),
    },
    person: { findUnique: vi.fn().mockResolvedValue(null) },
    referral: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async () => ({})),
    },
    activityEvent: { create: vi.fn() },
  };
  const access = {
    requireCapabilityWrite: vi
      .fn()
      .mockResolvedValue({ academy: { id: "acad-1", name: "Estudio X" }, ctx: {} }),
    requireCapability: vi.fn().mockResolvedValue({ academy: {}, ctx: {} }),
  };
  const auth = {
    createMagicToken: vi.fn(async () => "tok"),
    createOtp: vi.fn(async () => "123456"),
  };
  const mailer = { send: vi.fn(async () => {}) };
  const notifications = { notifySafe: vi.fn(async () => {}) };
  const invites = new AcademyInvitesService(
    prisma as never,
    auth as never,
    mailer as never,
    notifications as never,
  );
  const ctrl = new AcademyInvitesController(
    prisma as never,
    access as never,
    invites,
  );
  return { ctrl, prisma, access, auth, mailer, notifications };
}

const DTO = { email: "Nueva@Mail.com", name: "Juana", lastName: "Pérez" };

describe("AcademyInvitesController.invite", () => {
  it("crea la invitación, emite invite.sent y envía correo con next a la ficha", async () => {
    const { ctrl, prisma, access, auth, mailer } = makeDeps();
    prisma.academyInvite.findFirst.mockResolvedValue(null);

    const res = await ctrl.invite("acad-1", reqAs(OWNER), DTO as never);

    expect(access.requireCapabilityWrite).toHaveBeenCalledWith(
      "acad-1",
      OWNER,
      "students",
    );
    expect(prisma.academyInvite.create).toHaveBeenCalledWith({
      data: {
        academyId: "acad-1",
        email: "nueva@mail.com",
        name: "Juana Pérez",
        invitedById: OWNER.id,
      },
    });
    expect(auth.createMagicToken).toHaveBeenCalledWith(
      "nueva@mail.com",
      false,
      "7d",
      { next: "/academias/acad-1" },
    );
    expect(mailer.send).toHaveBeenCalledWith(
      "nueva@mail.com",
      "Estudio X te invitó a Omnidance",
      expect.stringContaining("/api/auth/verify?token=tok"),
    );
    expect(res.invite?.id).toBe("inv-1");
    expect(res.resent).toBe(false);
  });

  it("invitación duplicada pendiente: reenvía el correo sin crear una segunda fila", async () => {
    const { ctrl, prisma, mailer } = makeDeps();
    prisma.academyInvite.findFirst.mockResolvedValue({
      id: "inv-9",
      consumedAt: null,
    });

    const res = await ctrl.invite("acad-1", reqAs(OWNER), DTO as never);

    expect(prisma.academyInvite.create).not.toHaveBeenCalled();
    expect(mailer.send).toHaveBeenCalled();
    expect(res.resent).toBe(true);
  });

  it("cuenta existente: además del correo recibe push 'la academia te invitó'", async () => {
    const { ctrl, prisma, notifications } = makeDeps();
    prisma.academyInvite.findFirst.mockResolvedValue(null);
    prisma.person.findUnique.mockResolvedValue({ id: "p-7", deletedAt: null });

    await ctrl.invite("acad-1", reqAs(OWNER), DTO as never);

    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "p-7",
      expect.objectContaining({
        category: "TRANSACTIONAL",
        type: "academy.invite",
      }),
    );
  });

  it("sin cuenta existente no hay push", async () => {
    const { ctrl, prisma, notifications } = makeDeps();
    prisma.academyInvite.findFirst.mockResolvedValue(null);

    await ctrl.invite("acad-1", reqAs(OWNER), DTO as never);

    expect(notifications.notifySafe).not.toHaveBeenCalled();
  });
});

// spec academies/student-invites (consumo por push): la cuenta
// existente consume su invitación pendiente desde la notificación,
// mismo efecto que el verify del magic link - consumedAt + personId,
// Referral INVITE (dedup) e invite.registered. Idempotente y 404 si
// el email no calza (no filtra invites ajenas).
describe("AcademyInvitesController.consume", () => {
  const PENDING = {
    id: "inv-1",
    academyId: "acad-1",
    email: "inv@x.cl",
    invitedById: "owner-1",
    consumedAt: null,
  };

  it("consume la invitación propia: consumedAt + personId, Referral y evento", async () => {
    const { ctrl, prisma } = makeDeps();
    prisma.academyInvite.findUnique.mockResolvedValue(PENDING);
    prisma.person.findUnique.mockResolvedValue({ email: "inv@x.cl" });
    prisma.academyInvite.findMany.mockResolvedValue([PENDING]);

    const res = await ctrl.consume("inv-1", reqAs(DANCER));

    expect(res.consumed).toBe(true);
    expect(prisma.academyInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1" },
        data: expect.objectContaining({ personId: "p-1" }),
      }),
    );
    expect(prisma.referral.create).toHaveBeenCalledWith({
      data: {
        referrerId: "owner-1",
        referredId: "p-1",
        source: "INVITE",
      },
    });
    expect(prisma.activityEvent.create).toHaveBeenCalled();
  });

  it("ya consumida → consumed:false sin re-escribir ni duplicar referral", async () => {
    const { ctrl, prisma } = makeDeps();
    prisma.academyInvite.findUnique.mockResolvedValue({
      ...PENDING,
      consumedAt: new Date("2026-11-09"),
      personId: "p-1",
    });
    prisma.person.findUnique.mockResolvedValue({ email: "inv@x.cl" });

    const res = await ctrl.consume("inv-1", reqAs(DANCER));

    expect(res.consumed).toBe(false);
    expect(prisma.academyInvite.update).not.toHaveBeenCalled();
    expect(prisma.referral.create).not.toHaveBeenCalled();
  });

  it("invite de otro email → 404 y no consume", async () => {
    const { ctrl, prisma } = makeDeps();
    prisma.academyInvite.findUnique.mockResolvedValue(PENDING);
    prisma.person.findUnique.mockResolvedValue({ email: "otra@x.cl" });

    await expect(ctrl.consume("inv-1", reqAs(DANCER))).rejects.toThrow(
      /404|Not Found/i,
    );
    expect(prisma.academyInvite.update).not.toHaveBeenCalled();
  });

  it("invite inexistente → 404", async () => {
    const { ctrl, prisma } = makeDeps();
    prisma.academyInvite.findUnique.mockResolvedValue(null);
    prisma.person.findUnique.mockResolvedValue({ email: "inv@x.cl" });

    await expect(ctrl.consume("inv-x", reqAs(DANCER))).rejects.toThrow(
      /404|Not Found/i,
    );
  });
});

describe("AcademyInvitesController.list", () => {
  it("exige la capacidad students y ordena pendientes primero", async () => {
    const { ctrl, prisma, access } = makeDeps();
    const items = [
      { id: "i1", email: "a@x.cl", name: "A", consumedAt: null, createdAt: new Date("2026-11-08") },
      { id: "i2", email: "b@x.cl", name: "B", consumedAt: new Date("2026-11-05"), createdAt: new Date("2026-11-01") },
    ];
    prisma.academyInvite.findMany.mockResolvedValue(items);

    const res = await ctrl.list("acad-1", reqAs(OWNER));

    expect(access.requireCapability).toHaveBeenCalledWith(
      "acad-1",
      OWNER,
      "students",
    );
    expect(prisma.academyInvite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { academyId: "acad-1" },
        orderBy: [
          { consumedAt: { sort: "desc", nulls: "first" } },
          { createdAt: "desc" },
        ],
      }),
    );
    expect(res.items).toEqual(items);
  });
});

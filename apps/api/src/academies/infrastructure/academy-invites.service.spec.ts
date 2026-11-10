import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Academy } from "@prisma/client";
import type { PrismaService } from "../../prisma.service";
import type { AuthService } from "../../auth/domain/auth.service";
import type { Mailer } from "../../auth/domain/ports";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import { AcademyInvitesService } from "./academy-invites.service";

// AcademyInvitesService.sendInvite (change academy-import-invites):
// la lógica del invite individual extraída para reuso en bulk - dedup
// por pendiente, mail magic-link con next a la ficha, push a cuenta
// existente; dryRun clasifica sin escribir ni enviar.

class FakePrisma {
  invites: Record<string, unknown>[] = [];
  persons: { id: string; deletedAt: Date | null }[] = [];
  pendingInvite: Record<string, unknown> | null = null;

  academyInvite = {
    findFirst: async () => this.pendingInvite,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.invites.push(data);
      return { id: `inv-${this.invites.length}`, ...data };
    },
  };

  person = {
    findUnique: async ({ where }: { where: { email: string } }) =>
      this.persons.length ? this.persons[0] : null,
  };

  activityEvent = {
    findFirst: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => data,
  };
}

const academy = { id: "ac-1", name: "Academia X" } as Academy;

describe("AcademyInvitesService.sendInvite", () => {
  let prisma: FakePrisma;
  let mailer: { send: ReturnType<typeof vi.fn> };
  let auth: { createMagicToken: ReturnType<typeof vi.fn> };
  let notifications: { notifySafe: ReturnType<typeof vi.fn> };
  let svc: AcademyInvitesService;

  beforeEach(() => {
    prisma = new FakePrisma();
    mailer = { send: vi.fn(async () => {}) };
    auth = {
      createMagicToken: vi.fn(async (_e, _r, _ttl, opts) => {
        expect(opts?.next).toBe("/academias/ac-1");
        return "tok";
      }),
    };
    notifications = { notifySafe: vi.fn(async () => {}) };
    svc = new AcademyInvitesService(
      prisma as unknown as PrismaService,
      auth as unknown as AuthService,
      mailer as unknown as Mailer,
      notifications as unknown as NotificationsService,
    );
  });

  it("crea invite pendiente + mail con next a la ficha", async () => {
    const res = await svc.sendInvite(academy, {
      email: "nuevo@correo.cl",
      name: "Nuevo",
      invitedById: "staff-1",
    });
    expect(res.resent).toBe(false);
    expect(res.sent).toBe(true);
    expect(prisma.invites[0]).toMatchObject({
      academyId: "ac-1",
      email: "nuevo@correo.cl",
      invitedById: "staff-1",
    });
    expect(auth.createMagicToken).toHaveBeenCalledWith(
      "nuevo@correo.cl",
      false,
      "7d",
      { next: "/academias/ac-1" },
    );
    expect(mailer.send).toHaveBeenCalled();
  });

  it("pendiente existente → reenvía sin duplicar fila", async () => {
    prisma.pendingInvite = { id: "inv-9", email: "x@correo.cl" };
    const res = await svc.sendInvite(academy, {
      email: "x@correo.cl",
      name: "X",
      invitedById: "staff-1",
    });
    expect(res.resent).toBe(true);
    expect(prisma.invites).toHaveLength(0);
    expect(mailer.send).toHaveBeenCalled();
  });

  it("cuenta existente → además push 'te invitó'", async () => {
    prisma.persons = [{ id: "per-1", deletedAt: null }];
    const res = await svc.sendInvite(academy, {
      email: "cuenta@correo.cl",
      name: "Cuenta",
      invitedById: "staff-1",
    });
    expect(res.personExists).toBe(true);
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "per-1",
      expect.objectContaining({ type: "academy.invite" }),
    );
  });

  it("sin cuenta → personExists false, sin push", async () => {
    const res = await svc.sendInvite(academy, {
      email: "nuevo@correo.cl",
      name: "Nuevo",
      invitedById: "staff-1",
    });
    expect(res.personExists).toBe(false);
    expect(notifications.notifySafe).not.toHaveBeenCalled();
  });

  it("dryRun clasifica sin escribir ni enviar", async () => {
    const res = await svc.sendInvite(academy, {
      email: "nuevo@correo.cl",
      name: "Nuevo",
      invitedById: "staff-1",
      dryRun: true,
    });
    expect(res.resent).toBe(false);
    expect(prisma.invites).toHaveLength(0);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(notifications.notifySafe).not.toHaveBeenCalled();
  });

  it("dryRun con pendiente → resent", async () => {
    prisma.pendingInvite = { id: "inv-9", email: "x@correo.cl" };
    const res = await svc.sendInvite(academy, {
      email: "x@correo.cl",
      name: "X",
      invitedById: "staff-1",
      dryRun: true,
    });
    expect(res.resent).toBe(true);
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

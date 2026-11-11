import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaService } from "../../prisma.service";
// Ciclo session.guard ⇄ auth.controller: el controller entra primero.
import "../../auth/infrastructure/auth.controller";
import { AdminUserSessionsController } from "./user-sessions.controller";

// AdminUserSessionsController - revocación administrativa (spec
// auth-sessions): lista sesiones de cualquier persona con flag de
// revocada, mata una por id y todas por persona (revoke-all).

interface FakeSession {
  id: string;
  personId: string;
  jti: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

class FakePrisma {
  people = new Set(["p-1", "p-2"]);
  sessions: FakeSession[] = [];

  person = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.people.has(where.id) ? { id: where.id } : null,
  };

  authSession = {
    findMany: async ({ where }: { where: { personId: string } }) =>
      this.sessions.filter((s) => s.personId === where.personId),
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; personId?: string; revokedAt: null };
      data: { revokedAt: Date };
    }) => {
      let count = 0;
      for (const s of this.sessions) {
        if (s.revokedAt) continue;
        if (where.id && s.id !== where.id) continue;
        if (where.personId && s.personId !== where.personId) continue;
        s.revokedAt = data.revokedAt;
        count++;
      }
      return { count };
    },
  };
}

const mkSession = (over: Partial<FakeSession> & { id: string }): FakeSession => ({
  personId: "p-1",
  jti: `jti-${over.id}`,
  userAgent: null,
  ip: null,
  createdAt: new Date(),
  lastSeenAt: new Date(),
  revokedAt: null,
  ...over,
});

describe("AdminUserSessionsController (spec auth-sessions)", () => {
  let prisma: FakePrisma;
  let ctrl: AdminUserSessionsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new AdminUserSessionsController(
      prisma as unknown as PrismaService,
    );
  });

  it("GET lista sesiones de la persona con flag revoked y device parseado", async () => {
    prisma.sessions = [
      mkSession({
        id: "s-1",
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/124.0",
        ip: "1.2.3.4",
      }),
      mkSession({ id: "s-2", revokedAt: new Date() }),
    ];
    const out = await ctrl.list("p-1");
    expect(out.sessions).toHaveLength(2);
    expect(out.sessions[0]).toMatchObject({
      id: "s-1",
      revoked: false,
      ip: "1.2.3.4",
    });
    expect(out.sessions[0].device).toBe("Windows · Chrome");
    expect(out.sessions[1].revoked).toBe(true);
  });

  it("GET persona inexistente → 404", async () => {
    await expect(ctrl.list("nadie")).rejects.toThrow(
      "usuario no encontrado",
    );
  });

  it("DELETE revoca por id; ya revocada o inexistente → 404", async () => {
    prisma.sessions = [mkSession({ id: "s-1" })];
    await expect(ctrl.revoke("s-1")).resolves.toEqual({ ok: true });
    expect(prisma.sessions[0].revokedAt).toBeInstanceOf(Date);
    await expect(ctrl.revoke("s-1")).rejects.toThrow(
      "sesión no encontrada",
    );
    await expect(ctrl.revoke("s-x")).rejects.toThrow(
      "sesión no encontrada",
    );
  });

  it("revoke-all mata todas las activas de la persona (no las ajenas)", async () => {
    prisma.sessions = [
      mkSession({ id: "s-1" }),
      mkSession({ id: "s-2" }),
      mkSession({ id: "s-ajena", personId: "p-2" }),
    ];
    const out = await ctrl.revokeAll("p-1");
    expect(out).toEqual({ ok: true, revoked: 2 });
    expect(prisma.sessions[0].revokedAt).toBeInstanceOf(Date);
    expect(prisma.sessions[1].revokedAt).toBeInstanceOf(Date);
    expect(prisma.sessions[2].revokedAt).toBeNull();
  });
});

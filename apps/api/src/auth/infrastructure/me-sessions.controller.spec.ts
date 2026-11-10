import { describe, it, expect, beforeEach } from "vitest";
import type { Request } from "express";
import type { AuthSession } from "@prisma/client";
// Ciclo session.guard ⇄ auth.controller: el controller entra primero.
import "./auth.controller";
import type { AuthRepo } from "../domain/ports";
import { MeSessionsController } from "./me-sessions.controller";

// MeSessionsController - gestión de sesiones del usuario (spec
// auth-sessions): lista solo activas con `current` por jti, revoca
// propia (ownership) y "cerrar otras" preserva la sesión actual.

const mkSession = (
  over: Partial<AuthSession> & { id: string; jti: string },
): AuthSession => ({
  personId: "p-1",
  userAgent: null,
  ip: null,
  createdAt: new Date(),
  lastSeenAt: new Date(),
  revokedAt: null,
  ...over,
});

class FakeRepo {
  sessions: AuthSession[] = [];

  async listAuthSessions(personId: string) {
    return this.sessions.filter((s) => s.personId === personId);
  }

  async revokeAuthSession(id: string, personId?: string) {
    let n = 0;
    for (const s of this.sessions) {
      if (s.id === id && !s.revokedAt && (!personId || s.personId === personId)) {
        s.revokedAt = new Date();
        n++;
      }
    }
    return n;
  }

  async revokeOtherAuthSessions(personId: string, exceptJti?: string) {
    let n = 0;
    for (const s of this.sessions) {
      if (s.personId === personId && !s.revokedAt && s.jti !== exceptJti) {
        s.revokedAt = new Date();
        n++;
      }
    }
    return n;
  }
}

const reqAs = (personId: string, jti?: string) =>
  ({ person: { id: personId, jti } }) as unknown as Request;

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1";

describe("MeSessionsController (spec auth-sessions)", () => {
  let repo: FakeRepo;
  let ctrl: MeSessionsController;

  beforeEach(() => {
    repo = new FakeRepo();
    ctrl = new MeSessionsController(repo as unknown as AuthRepo);
  });

  it("GET lista solo activas, marca current por jti y parsea el UA", async () => {
    repo.sessions = [
      mkSession({ id: "s-1", jti: "jti-actual", userAgent: IPHONE }),
      mkSession({ id: "s-2", jti: "jti-otro" }),
      mkSession({ id: "s-3", jti: "jti-muerto", revokedAt: new Date() }),
    ];
    const out = await ctrl.list(reqAs("p-1", "jti-actual"));
    expect(out.sessions).toHaveLength(2);
    const current = out.sessions.find((s) => s.id === "s-1")!;
    expect(current.current).toBe(true);
    expect(current.device).toBe("iPhone · Safari");
    const other = out.sessions.find((s) => s.id === "s-2")!;
    expect(other.current).toBe(false);
    expect(other.device).toBe("Dispositivo desconocido");
  });

  it("GET sin jti en el token (legado) no marca ninguna como current", async () => {
    repo.sessions = [mkSession({ id: "s-1", jti: "jti-x" })];
    const out = await ctrl.list(reqAs("p-1"));
    expect(out.sessions[0].current).toBe(false);
  });

  it("DELETE revoca la sesión propia", async () => {
    repo.sessions = [mkSession({ id: "s-1", jti: "jti-1" })];
    const out = await ctrl.revoke(reqAs("p-1", "jti-otra"), "s-1");
    expect(out).toEqual({ ok: true });
    expect(repo.sessions[0].revokedAt).toBeInstanceOf(Date);
  });

  it("DELETE de sesión ajena → 404 y no revoca", async () => {
    repo.sessions = [
      mkSession({ id: "s-ajena", jti: "jti-ajena", personId: "p-2" }),
    ];
    await expect(
      ctrl.revoke(reqAs("p-1"), "s-ajena"),
    ).rejects.toThrow("sesión no encontrada");
    expect(repo.sessions[0].revokedAt).toBeNull();
  });

  it("revoke-others deja viva la sesión actual", async () => {
    repo.sessions = [
      mkSession({ id: "s-1", jti: "jti-actual" }),
      mkSession({ id: "s-2", jti: "jti-notebook" }),
      mkSession({ id: "s-3", jti: "jti-tablet" }),
    ];
    const out = await ctrl.revokeOthers(reqAs("p-1", "jti-actual"));
    expect(out).toEqual({ ok: true, revoked: 2 });
    expect(repo.sessions[0].revokedAt).toBeNull();
    expect(repo.sessions[1].revokedAt).toBeInstanceOf(Date);
    expect(repo.sessions[2].revokedAt).toBeInstanceOf(Date);
  });

  it("revoke-others con token legado (sin jti) revoca todas las filas", async () => {
    repo.sessions = [
      mkSession({ id: "s-1", jti: "jti-1" }),
      mkSession({ id: "s-2", jti: "jti-2" }),
    ];
    const out = await ctrl.revokeOthers(reqAs("p-1"));
    expect(out.revoked).toBe(2);
  });
});

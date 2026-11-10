import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { SignJWT } from "jose";
// Primero el controller: ciclo session.guard ⇄ auth.controller
// (SESSION_COOKIE) - si el guard entra primero, los @UseGuards del
// controller evalúan con SessionGuard aún undefined.
import "./auth.controller";
import { AuthService } from "../domain/auth.service";
import type { AuthRepo } from "../domain/ports";
import { SessionGuard } from "./session.guard";

// SessionGuard - revocación de sesiones persistidas (spec
// auth-sessions): un JWT con claim jti exige AuthSession viva; cache
// in-memory de 60s por jti y lastSeenAt con muestreo de 1 write/min.
// Tokens legados sin jti siguen válidos sin revocación.

const SECRET = "test-secret-at-least-32-chars-long!!";

interface FakeSessionRow {
  id: string;
  jti: string;
  personId: string;
  revokedAt: Date | null;
  lastSeenAt: Date;
}

class FakeRepo {
  sessions: FakeSessionRow[] = [];
  findCalls = 0;
  touchCalls = 0;
  person = {
    id: "p-1",
    deletedAt: null,
    isDemoAccount: false,
    roles: [] as { role: string; status: string }[],
  };

  async findById(id: string) {
    return id === this.person.id ? this.person : null;
  }

  async createAuthSession(data: {
    jti: string;
    personId: string;
    userAgent?: string;
    ip?: string;
  }) {
    this.sessions.push({
      id: `s-${this.sessions.length + 1}`,
      jti: data.jti,
      personId: data.personId,
      revokedAt: null,
      lastSeenAt: new Date(),
    });
  }

  async findAuthSessionByJti(jti: string) {
    this.findCalls++;
    const row = this.sessions.find((s) => s.jti === jti);
    return row
      ? { id: row.id, revokedAt: row.revokedAt, lastSeenAt: row.lastSeenAt }
      : null;
  }

  async touchAuthSession() {
    this.touchCalls++;
  }

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

  async revokeAllAuthSessions(personId: string) {
    let n = 0;
    for (const s of this.sessions) {
      if (s.personId === personId && !s.revokedAt) {
        s.revokedAt = new Date();
        n++;
      }
    }
    return n;
  }
}

const ctx = (req: Partial<Request>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

const bearerCtx = (token: string) =>
  ctx({ headers: { authorization: `Bearer ${token}` }, path: "/api/me" });

// Token legado: firma válida sin claim jti (pre-change).
async function legacySessionToken(personId: string): Promise<string> {
  const key = new TextEncoder().encode(SECRET);
  return new SignJWT({ purpose: "session" })
    .setSubject(personId)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);
}

describe("SessionGuard - AuthSession (spec auth-sessions)", () => {
  let repo: FakeRepo;
  let auth: AuthService;
  let guard: SessionGuard;

  beforeEach(() => {
    vi.useFakeTimers();
    repo = new FakeRepo();
    auth = new AuthService(SECRET, repo as unknown as AuthRepo);
    guard = new SessionGuard(auth, repo as unknown as AuthRepo);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const issue = async (personId = "p-1") => {
    const token = await auth.issueSession(personId, {
      userAgent: "spec-agent",
      ip: "1.2.3.4",
    });
    return token;
  };

  it("emisión crea fila con el jti del token firmado", async () => {
    const token = await issue();
    const { jti } = await auth.verifySession(token);
    expect(jti).toBeTruthy();
    expect(repo.sessions).toHaveLength(1);
    expect(repo.sessions[0].jti).toBe(jti);
    expect(repo.sessions[0].personId).toBe("p-1");
  });

  it("sesión viva pasa y expone req.person.jti", async () => {
    const token = await issue();
    const req = {
      headers: { authorization: `Bearer ${token}` },
      path: "/api/me",
    } as unknown as Request;
    await expect(
      guard.canActivate(ctx(req)),
    ).resolves.toBe(true);
    const { jti } = await auth.verifySession(token);
    expect(req.person!.jti).toBe(jti);
    expect(req.person!.id).toBe("p-1");
  });

  it("sesión revocada → 401", async () => {
    const token = await issue();
    const { jti } = await auth.verifySession(token);
    await repo.revokeAuthSession(repo.sessions[0].id);
    await expect(guard.canActivate(bearerCtx(token))).rejects.toThrow();
    expect(jti).toBeTruthy();
  });

  it("jti sin fila (token ajeno a la tabla) → 401", async () => {
    // Token válido pero cuya fila nunca existió (DB truncada, etc.).
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ purpose: "session", jti: "falso" })
      .setSubject("p-1")
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(key);
    await expect(guard.canActivate(bearerCtx(token))).rejects.toThrow();
  });

  it("token legado sin jti pasa sin check de sesión", async () => {
    const token = await legacySessionToken("p-1");
    const req = {
      headers: { authorization: `Bearer ${token}` },
      path: "/api/me",
    } as unknown as Request;
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(repo.findCalls).toBe(0);
    expect(req.person!.jti).toBeUndefined();
  });

  it("cache 60s: segundo request no vuelve a leer la fila", async () => {
    const token = await issue();
    await guard.canActivate(bearerCtx(token));
    await guard.canActivate(bearerCtx(token));
    expect(repo.findCalls).toBe(1);
    // Tras 61s re-consulta.
    vi.advanceTimersByTime(61_000);
    await guard.canActivate(bearerCtx(token));
    expect(repo.findCalls).toBe(2);
  });

  it("lastSeenAt con muestreo: 1 write/min por jti", async () => {
    const token = await issue();
    await guard.canActivate(bearerCtx(token));
    await guard.canActivate(bearerCtx(token));
    expect(repo.touchCalls).toBe(1);
    vi.advanceTimersByTime(61_000);
    await guard.canActivate(bearerCtx(token));
    expect(repo.touchCalls).toBe(2);
  });

  it("revocación dentro del TTL de cache: el próximo lookup la ve", async () => {
    const token = await issue();
    await guard.canActivate(bearerCtx(token)); // cache "viva"
    await repo.revokeAuthSession(repo.sessions[0].id);
    // Dentro del TTL sigue pasando (trade-off documentado: ≤60s).
    await guard.canActivate(bearerCtx(token));
    vi.advanceTimersByTime(61_000);
    await expect(guard.canActivate(bearerCtx(token))).rejects.toThrow();
  });

  it("repo sin métodos de sesión (fake legado) → JWT puro", async () => {
    // Método de clase: no se borra con delete - undefined sombra el
    // del prototipo y simula el fake legado sin el lookup.
    const legacyRepo = new FakeRepo() as unknown as AuthRepo;
    (legacyRepo as { findAuthSessionByJti?: unknown })
      .findAuthSessionByJti = undefined;
    const g = new SessionGuard(auth, legacyRepo);
    const token = await issue();
    await expect(g.canActivate(bearerCtx(token))).resolves.toBe(true);
  });
});

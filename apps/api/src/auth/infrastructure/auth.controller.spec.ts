import { describe, it, expect, beforeEach, vi } from "vitest";
import { ThrottlerException } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "../domain/auth.service";
import type { AuthOtpRecord, AuthRepo, Mailer } from "../domain/ports";
import type { ConsentService } from "../../legal/consent.service";

// AuthController - consentimiento legal (spec legal-consent +
// consent-por-jurisdiccion): el flag `consent:true` de
// magic-link/login/register se estampa en la Person al crear la sesión
// vía ConsentService (ConsentRecord auditable + snapshot). En magic
// link viaja como claim del token y se estampa en GET /auth/verify.
// Register acepta `country` (ISO-2 → Person.jurisdiction) y `scopes`
// granulares.

const SECRET = "test-secret-at-least-32-chars-long!!";

interface FakePerson {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  consentVersion: string | null;
  consentAcceptedAt: Date | null;
  verifiedAt: Date | null;
  jurisdiction: string | null;
  acquisitionSource: string | null;
  acquisitionDetail: unknown;
}

// No `implements AuthRepo`: los métodos devuelven FakePerson (shape
// reducido), no Person de Prisma - el cast en el constructor del
// controller cubre la diferencia.
class FakeRepo {
  people = new Map<string, FakePerson>();
  otps: AuthOtpRecord[] = [];
  // Admins APPROVED para el aviso de registro nuevo (spec
  // notifications/admin-alerts).
  adminIds: string[] = [];
  private seq = 0;

  async approvedAdminIds() {
    return this.adminIds;
  }

  async upsertByEmail(
    email: string,
    acquisition?: { source: string; detail: unknown },
  ): Promise<FakePerson> {
    const existing = this.people.get(email);
    if (existing) {
      // El link/OTP prueba posesión del correo (spec auth-email-verification).
      existing.verifiedAt = new Date();
      return existing;
    }
    const person: FakePerson = {
      id: `p-${++this.seq}`,
      email,
      name: email.split("@")[0],
      passwordHash: null,
      consentVersion: null,
      consentAcceptedAt: null,
      verifiedAt: new Date(),
      jurisdiction: null,
      acquisitionSource: acquisition?.source ?? null,
      acquisitionDetail: acquisition?.detail ?? null,
    };
    this.people.set(email, person);
    return person;
  }

  async findByEmail(email: string) {
    return this.people.get(email) ?? null;
  }

  async createWithPassword(
    email: string,
    name: string,
    passwordHash: string,
    jurisdiction?: string,
    acquisition?: { source: string; detail: unknown },
  ) {
    const person: FakePerson = {
      id: `p-${++this.seq}`,
      email,
      name,
      passwordHash,
      // Password no prueba posesión del correo - queda sin verificar.
      verifiedAt: null,
      consentVersion: null,
      consentAcceptedAt: null,
      jurisdiction: jurisdiction ?? null,
      acquisitionSource: acquisition?.source ?? null,
      acquisitionDetail: acquisition?.detail ?? null,
    };
    this.people.set(email, person);
    return person;
  }

  async setPassword(personId: string, passwordHash: string) {
    const p = [...this.people.values()].find((x) => x.id === personId);
    if (p) p.passwordHash = passwordHash;
  }

  async setJurisdiction(personId: string, jurisdiction: string) {
    const p = [...this.people.values()].find((x) => x.id === personId);
    if (p) p.jurisdiction = jurisdiction;
  }

  async findById(id: string) {
    const p = [...this.people.values()].find((x) => x.id === id);
    return p ? { ...p, roles: [] } : null;
  }

  // OTP (spec auth-email-otp): misma semántica que PrismaAuthRepo.
  async createOtp(data: {
    email: string;
    codeHash: string;
    consent: boolean;
    role?: string;
    next?: string;
    acquisition?: { source: string; detail: unknown };
    expiresAt: Date;
  }) {
    this.otps.push({
      id: `otp-${this.otps.length + 1}`,
      ...data,
      role: data.role ?? null,
      next: data.next ?? null,
      // Guarda el capture crudo como la fila real (spec
      // auth/acquisition-source); el verify lo re-normaliza.
      acquisition: data.acquisition?.detail ?? null,
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
    });
  }

  async consumeActives(email: string) {
    for (const o of this.otps) {
      if (o.email === email && !o.consumedAt) o.consumedAt = new Date();
    }
  }

  async findActiveOtp(email: string) {
    return (
      [...this.otps]
        .reverse()
        .find((o) => o.email === email && !o.consumedAt) ?? null
    );
  }

  async bumpAttempts(id: string) {
    const o = this.otps.find((x) => x.id === id);
    if (o) o.attempts++;
  }

  async consumeOtp(id: string) {
    const o = this.otps.find((x) => x.id === id);
    if (o) o.consumedAt = new Date();
  }

  // MagicTokenUse (spec api-hardening/auth): el set de hashes consumidos
  // replica la unique de la tabla - true = consumido por este llamado.
  consumedMagicTokens = new Set<string>();

  async consumeMagicToken(data: { tokenHash: string; email: string }) {
    if (this.consumedMagicTokens.has(data.tokenHash)) return false;
    this.consumedMagicTokens.add(data.tokenHash);
    return true;
  }

  // AuthSession (spec auth-sessions): una fila por JWT emitido.
  sessions: {
    id: string;
    jti: string;
    personId: string;
    userAgent: string | null;
    ip: string | null;
    createdAt: Date;
    lastSeenAt: Date;
    revokedAt: Date | null;
  }[] = [];

  async createAuthSession(data: {
    jti: string;
    personId: string;
    userAgent?: string;
    ip?: string;
  }) {
    this.sessions.push({
      id: `as-${this.sessions.length + 1}`,
      jti: data.jti,
      personId: data.personId,
      userAgent: data.userAgent ?? null,
      ip: data.ip ?? null,
      createdAt: new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    });
  }

  async findAuthSessionByJti(jti: string) {
    const s = this.sessions.find((x) => x.jti === jti);
    return s
      ? { id: s.id, revokedAt: s.revokedAt, lastSeenAt: s.lastSeenAt }
      : null;
  }

  async touchAuthSession(jti: string) {
    const s = this.sessions.find((x) => x.jti === jti && !x.revokedAt);
    if (s) s.lastSeenAt = new Date();
  }

  async listAuthSessions(personId: string) {
    return this.sessions.filter((s) => s.personId === personId);
  }

  async revokeAuthSession(id: string, personId?: string) {
    let n = 0;
    for (const s of this.sessions) {
      if (
        s.id === id &&
        !s.revokedAt &&
        (!personId || s.personId === personId)
      ) {
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

// Fake del ConsentService compartido (spec consent-por-jurisdiccion):
// estampa el snapshot de la Person como hace el real y registra las
// llamadas para assertions (personId + scopes declarados).
class FakeConsent {
  calls: { personId: string; scopes?: unknown }[] = [];
  constructor(private readonly repo: FakeRepo) {}

  async recordAcceptance(personId: string, scopes?: unknown) {
    this.calls.push({ personId, scopes });
    const p = [...this.repo.people.values()].find((x) => x.id === personId);
    if (p) {
      p.consentVersion = "cl-v1.0";
      p.consentAcceptedAt = new Date();
    }
    return {
      version: "cl-v1.0",
      acceptedAt: new Date(),
      jurisdiction: p?.jurisdiction ?? "CL",
    };
  }
}

const mkRes = () =>
  ({
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
  }) as unknown as Response;

const mkReq = () => ({ ip: "127.0.0.1" }) as unknown as Request;

describe("AuthController - consentimiento legal", () => {
  let auth: AuthService;
  let repo: FakeRepo;
  let consent: FakeConsent;
  let mailer: { send: ReturnType<typeof vi.fn> };
  let ctrl: AuthController;

  beforeEach(async () => {
    repo = new FakeRepo();
    // El repo se inyecta para los métodos OTP - JWT/password no lo usan.
    auth = new AuthService(SECRET, repo as unknown as AuthRepo);
    consent = new FakeConsent(repo);
    mailer = { send: vi.fn(async () => {}) };
    ctrl = new AuthController(
      auth,
      mailer as unknown as Mailer,
      repo as unknown as AuthRepo,
      consent as unknown as ConsentService,
    );
  });

  const stampedIds = () => consent.calls.map((c) => c.personId);

  it("register con consent:true estampa la Person creada", async () => {
    const res = mkRes();
    await ctrl.register(
      {
        email: "nueva@omnidance.dev",
        name: "Nueva",
        password: "clave-secreta-123",
        consent: true,
      },
      res,
    );
    const person = repo.people.get("nueva@omnidance.dev")!;
    expect(stampedIds()).toEqual([person.id]);
    expect(person.consentVersion).toBe("cl-v1.0");
    expect(person.consentAcceptedAt).toBeInstanceOf(Date);
  });

  it("register sin consent no estampa", async () => {
    await ctrl.register(
      {
        email: "sin@omnidance.dev",
        name: "Sin",
        password: "clave-secreta-123",
      },
      mkRes(),
    );
    expect(stampedIds()).toEqual([]);
    expect(repo.people.get("sin@omnidance.dev")!.consentVersion).toBeNull();
  });

  it("register con country EU → jurisdiction EU y scopes al record", async () => {
    await ctrl.register(
      {
        email: "euro@omnidance.dev",
        name: "Euro",
        password: "clave-secreta-123",
        consent: true,
        country: "ES",
        scopes: { essential: true, marketing: true },
      },
      mkRes(),
    );
    const person = repo.people.get("euro@omnidance.dev")!;
    expect(person.jurisdiction).toBe("EU");
    expect(consent.calls[0]).toMatchObject({
      personId: person.id,
      scopes: { essential: true, marketing: true },
    });
  });

  it("register sin country → jurisdiction CL", async () => {
    await ctrl.register(
      {
        email: "local@omnidance.dev",
        name: "Local",
        password: "clave-secreta-123",
      },
      mkRes(),
    );
    expect(repo.people.get("local@omnidance.dev")!.jurisdiction).toBe("CL");
  });

  it("register sobre cuenta existente con country actualiza su jurisdicción", async () => {
    const seeded = await repo.createWithPassword(
      "vieja@omnidance.cl",
      "Vieja",
      await auth.hashPassword("gatoperro123"),
    );
    await ctrl.register(
      {
        email: "vieja@omnidance.cl",
        name: "Vieja",
        password: "gatoperro123",
        country: "DE",
      },
      mkRes(),
    );
    expect(seeded.jurisdiction).toBe("EU");
  });

  it("login con consent:true estampa; sin consent no", async () => {
    const person = await repo.createWithPassword(
      "baila@omnidance.dev",
      "Baila",
      await auth.hashPassword("clave-secreta-123"),
    );
    await ctrl.login(
      { email: "baila@omnidance.dev", password: "clave-secreta-123" },
      mkReq(),
      mkRes(),
    );
    expect(stampedIds()).toEqual([]);
    await ctrl.login(
      {
        email: "baila@omnidance.dev",
        password: "clave-secreta-123",
        consent: true,
      },
      mkReq(),
      mkRes(),
    );
    expect(stampedIds()).toEqual([person.id]);
  });

  it("register sobre cuenta pre-sembrada con password correcto → reclama sesión", async () => {
    // Persona sembrada por email (piloto) - ya tiene passwordHash y
    // data asociada; el register con el password correcto equivale a
    // login: misma Person, sesión emitida.
    const seeded = await repo.createWithPassword(
      "monica@omnidance.cl",
      "Mónica Soto",
      await auth.hashPassword("gatoperro123"),
    );
    const res = mkRes();
    const out = await ctrl.register(
      {
        email: "monica@omnidance.cl",
        name: "Otro Nombre",
        password: "gatoperro123",
      },
      res,
    );
    expect(out).toEqual({ ok: true });
    expect(res.cookie).toHaveBeenCalled();
    // No se creó una Person nueva ni se pisó el nombre.
    expect(repo.people.size).toBe(1);
    expect(repo.people.get("monica@omnidance.cl")!.name).toBe("Mónica Soto");
    expect(repo.people.get("monica@omnidance.cl")!.id).toBe(seeded.id);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("register sobre cuenta sin password → magic link de reclamo + 409", async () => {
    // Cuenta sembrada sin password (magic-link only): no se puede
    // fijar contraseña sin verificar el correo - se envía link y 409.
    await repo.upsertByEmail("gabriel@omnidance.cl");
    await expect(
      ctrl.register(
        {
          email: "gabriel@omnidance.cl",
          name: "Gabriel",
          password: "lo-que-sea-123",
        },
        mkRes(),
      ),
    ).rejects.toThrow("Ya existe una cuenta con ese email");
    expect(mailer.send).toHaveBeenCalledTimes(1);
    // El link enviado reclama la misma Person al verificar.
    const html: string = mailer.send.mock.calls[0][2];
    const token = /token=([^"'\s]+)/.exec(html)![1];
    const res = mkRes();
    await ctrl.verify(token, mkReq(), res);
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining("/inicio"));
    expect(repo.people.size).toBe(1);
  });

  it("register con password incorrecto sobre cuenta existente → link + 409", async () => {
    await repo.createWithPassword(
      "maria@omnidance.cl",
      "María",
      await auth.hashPassword("la-correcta-123"),
    );
    const res = mkRes();
    await expect(
      ctrl.register(
        {
          email: "maria@omnidance.cl",
          name: "María",
          password: "la-incorrecta-123",
        },
        res,
      ),
    ).rejects.toThrow("Ya existe una cuenta con ese email");
    expect(res.cookie).not.toHaveBeenCalled();
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it("magic-link con consent:true → el token lo lleva y verify lo estampa", async () => {
    await ctrl.magicLink({ email: "link@omnidance.dev", consent: true });
    const html: string = mailer.send.mock.calls[0][2];
    const token = /token=([^"'\s]+)/.exec(html)![1];
    await ctrl.verify(token, mkReq(), mkRes());
    const person = repo.people.get("link@omnidance.dev")!;
    expect(stampedIds()).toEqual([person.id]);
    expect(person.consentVersion).toBe("cl-v1.0");
  });

  it("magic-link sin consent → verify no estampa", async () => {
    // Cuenta existente: el link sale sin consent (spec
    // login-consent-on-create) y verify no estampa nada.
    await repo.upsertByEmail("plain@omnidance.dev");
    await ctrl.magicLink({ email: "plain@omnidance.dev" });
    const html: string = mailer.send.mock.calls[0][2];
    const token = /token=([^"'\s]+)/.exec(html)![1];
    await ctrl.verify(token, mkReq(), mkRes());
    expect(stampedIds()).toEqual([]);
  });

  // spec login-consent-on-create: el consent solo se exige cuando el
  // magic link crearía la Person (email sin cuenta).
  it("magic-link email sin cuenta + consent:false → 400 consent_required sin mail ni OTP", async () => {
    await expect(
      ctrl.magicLink({ email: "nuevo@omnidance.dev" }),
    ).rejects.toThrow("consent_required");
    expect(mailer.send).not.toHaveBeenCalled();
    expect(repo.otps).toHaveLength(0);
  });

  it("magic-link email sin cuenta + consent:true → envía y estampa al verify", async () => {
    await ctrl.magicLink({ email: "nuevo@omnidance.dev", consent: true });
    const html: string = mailer.send.mock.calls[0][2];
    const token = /token=([^"'\s]+)/.exec(html)![1];
    await ctrl.verify(token, mkReq(), mkRes());
    const person = repo.people.get("nuevo@omnidance.dev")!;
    expect(stampedIds()).toEqual([person.id]);
  });

  it("magic-link cuenta existente + consent:false → envía igual (sin check en cada login)", async () => {
    await repo.upsertByEmail("socio@omnidance.dev");
    await ctrl.magicLink({ email: "socio@omnidance.dev" });
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });
});

describe("AuthController - OTP (spec auth-email-otp)", () => {
  let auth: AuthService;
  let repo: FakeRepo;
  let consent: FakeConsent;
  let mailer: { send: ReturnType<typeof vi.fn> };
  let ctrl: AuthController;

  beforeEach(() => {
    repo = new FakeRepo();
    auth = new AuthService(SECRET, repo as unknown as AuthRepo);
    consent = new FakeConsent(repo);
    mailer = { send: vi.fn(async () => {}) };
    ctrl = new AuthController(
      auth,
      mailer as unknown as Mailer,
      repo as unknown as AuthRepo,
      consent as unknown as ConsentService,
    );
  });

  // El correo lleva link + código; el código viaja dentro del span mono.
  const extractCode = (html: string) =>
    /letter-spacing:0\.4em;[^<]*>(\d{6})</.exec(html)![1];

  it("magic-link emite código en el correo y otp/verify crea sesión", async () => {
    await ctrl.magicLink({ email: "otp@omnidance.dev", consent: true });
    const html: string = mailer.send.mock.calls[0][2];
    const code = extractCode(html);
    const res = mkRes();
    const out = await ctrl.otpVerify(
      { email: "otp@omnidance.dev", code },
      res,
    );
    expect(out).toEqual({ ok: true, isNew: true });
    expect(res.cookie).toHaveBeenCalled();
    const person = repo.people.get("otp@omnidance.dev")!;
    expect(consent.calls.map((c) => c.personId)).toEqual([person.id]);
    // OTP consumido: reuso → 401.
    await expect(
      ctrl.otpVerify({ email: "otp@omnidance.dev", code }, mkRes()),
    ).rejects.toThrow("Código inválido o expirado");
  });

  it("otp/verify sobre cuenta existente → isNew:false, sin bienvenida", async () => {
    await repo.upsertByEmail("vieja@omnidance.dev");
    await ctrl.magicLink({ email: "vieja@omnidance.dev" });
    const code = extractCode(mailer.send.mock.calls[0][2]);
    const out = await ctrl.otpVerify(
      { email: "VIEJA@omnidance.dev", code },
      mkRes(),
    );
    expect(out.isNew).toBe(false);
    // Solo el mail del magic link; no welcome de alta.
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it("código incorrecto → 401 uniforme y suma intento", async () => {
    await repo.upsertByEmail("x@omnidance.dev");
    await ctrl.magicLink({ email: "x@omnidance.dev" });
    const real = extractCode(mailer.send.mock.calls[0][2]);
    const wrong = real === "000000" ? "111111" : "000000";
    await expect(
      ctrl.otpVerify({ email: "x@omnidance.dev", code: wrong }, mkRes()),
    ).rejects.toThrow("Código inválido o expirado");
    expect(repo.otps[0].attempts).toBe(1);
  });
});

// spec auth-email-verification: la cuenta con password nace sin
// verifiedAt - el correo de acceso (link+OTP) actúa como verificación.
describe("AuthController - verificación de correo", () => {
  let auth: AuthService;
  let repo: FakeRepo;
  let consent: FakeConsent;
  let mailer: { send: ReturnType<typeof vi.fn> };
  let ctrl: AuthController;

  beforeEach(() => {
    repo = new FakeRepo();
    auth = new AuthService(SECRET, repo as unknown as AuthRepo);
    consent = new FakeConsent(repo);
    mailer = { send: vi.fn(async () => {}) };
    ctrl = new AuthController(
      auth,
      mailer as unknown as Mailer,
      repo as unknown as AuthRepo,
      consent as unknown as ConsentService,
    );
  });

  const extractCode = (html: string) =>
    /letter-spacing:0\.4em;[^<]*>(\d{6})</.exec(html)![1];

  it("register envía bienvenida + correo de acceso (verificación)", async () => {
    await ctrl.register(
      {
        email: "nueva@omnidance.dev",
        name: "Nueva",
        password: "clave-secreta-123",
      },
      mkRes(),
    );
    // welcome + acceso (link+OTP); la cuenta sigue sin verificar hasta
    // que use una de las dos vías.
    expect(mailer.send).toHaveBeenCalledTimes(2);
    const person = repo.people.get("nueva@omnidance.dev")!;
    expect(person.verifiedAt).toBeNull();
    // El link del correo de acceso verifica el correo al clickearlo.
    const html: string = mailer.send.mock.calls[1][2];
    const token = /token=([^"'\s]+)/.exec(html)![1];
    await ctrl.verify(token, mkReq(), mkRes());
    expect(person.verifiedAt).toBeInstanceOf(Date);
  });

  it("resend-verification reenvía link+OTP cuando verifiedAt es null", async () => {
    const person = await repo.createWithPassword(
      "pendiente@omnidance.dev",
      "Pendiente",
      await auth.hashPassword("clave-secreta-123"),
    );
    const req = { person: { id: person.id } } as unknown as Request;
    const out = await ctrl.resendVerification(req);
    expect(out).toEqual({ ok: true });
    expect(mailer.send).toHaveBeenCalledTimes(1);
    // El OTP del correo verifica la cuenta.
    const code = extractCode(mailer.send.mock.calls[0][2]);
    await ctrl.otpVerify(
      { email: "pendiente@omnidance.dev", code },
      mkRes(),
    );
    expect(person.verifiedAt).toBeInstanceOf(Date);
  });

  it("resend-verification es idempotente si ya está verificado", async () => {
    const person = await repo.upsertByEmail("verificada@omnidance.dev");
    const req = { person: { id: person.id } } as unknown as Request;
    const out = await ctrl.resendVerification(req);
    expect(out).toEqual({ ok: true, alreadyVerified: true });
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

// spec notifications/admin-alerts (admin-notify-on-register): toda
// alta real avisa a los admins APPROVED por el centro in-app.
describe("AuthController - aviso a admins de registro nuevo", () => {
  let auth: AuthService;
  let repo: FakeRepo;
  let consent: FakeConsent;
  let mailer: { send: ReturnType<typeof vi.fn> };
  let notifications: { notifySafe: ReturnType<typeof vi.fn> };
  let ctrl: AuthController;

  beforeEach(() => {
    repo = new FakeRepo();
    repo.adminIds = ["adm-1", "adm-2"];
    auth = new AuthService(SECRET, repo as unknown as AuthRepo);
    consent = new FakeConsent(repo);
    mailer = { send: vi.fn(async () => {}) };
    notifications = { notifySafe: vi.fn(async () => {}) };
    ctrl = new AuthController(
      auth,
      mailer as unknown as Mailer,
      repo as unknown as AuthRepo,
      consent as unknown as ConsentService,
      notifications as never,
    );
  });

  const extractCode = (html: string) =>
    /letter-spacing:0\.4em;[^<]*>(\d{6})</.exec(html)![1];

  it("register nuevo notifica user.registered a cada admin APPROVED", async () => {
    await ctrl.register(
      {
        email: "nueva@omnidance.dev",
        name: "Nueva",
        password: "clave-secreta-123",
      },
      mkRes(),
    );
    expect(notifications.notifySafe).toHaveBeenCalledTimes(2);
    const [personId, input] = notifications.notifySafe.mock.calls[0] as [
      string,
      { category: string; type: string; body?: string },
    ];
    expect(personId).toBe("adm-1");
    expect(input).toMatchObject({
      category: "OPERATIONAL",
      type: "user.registered",
    });
    expect(input.body).toContain("nueva@omnidance.dev");
  });

  it("verify/otp de cuenta existente no notifica (login o claim)", async () => {
    await repo.upsertByEmail("vieja@omnidance.dev");
    await ctrl.magicLink({ email: "vieja@omnidance.dev" });
    const code = extractCode(mailer.send.mock.calls[0][2]);
    const out = await ctrl.otpVerify(
      { email: "vieja@omnidance.dev", code },
      mkRes(),
    );
    expect(out.isNew).toBe(false);
    expect(notifications.notifySafe).not.toHaveBeenCalled();
  });
});

// spec invite-academy-lens: cuando el verify consume una AcademyInvite
// pendiente, la respuesta deja la cookie de un solo uso
// `omnidance_lens=academy` que el chrome persiste como viewMode.
describe("AuthController - lente academy al consumir invite", () => {
  let auth: AuthService;
  let repo: FakeRepo;
  let mailer: { send: ReturnType<typeof vi.fn> };

  const mkPrisma = (pending: { id: string; invitedById: string }[]) => ({
    academyInvite: {
      findMany: vi.fn(async () => pending),
      update: vi.fn(async () => ({})),
    },
    referral: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
    },
    activityEvent: { create: vi.fn(async () => ({})) },
  });

  const ctrlWithPrisma = (prisma: unknown) =>
    new AuthController(
      auth,
      mailer as unknown as Mailer,
      repo as unknown as AuthRepo,
      new FakeConsent(repo) as unknown as ConsentService,
      undefined,
      prisma as never,
    );

  beforeEach(() => {
    repo = new FakeRepo();
    auth = new AuthService(SECRET, repo as unknown as AuthRepo);
    mailer = { send: vi.fn(async () => {}) };
  });

  it("verify con invite pendiente setea omnidance_lens=academy", async () => {
    const ctrl2 = ctrlWithPrisma(mkPrisma([{ id: "inv-1", invitedById: "p-owner" }]));
    await repo.upsertByEmail("invitado@omnidance.dev");
    const token = await auth.createMagicToken("invitado@omnidance.dev", false, "15m", {
      next: "/academias/acad-1",
    });
    const res = mkRes();
    await ctrl2.verify(token, mkReq(), res);
    expect(res.cookie).toHaveBeenCalledWith(
      "omnidance_lens",
      "academy",
      expect.objectContaining({ httpOnly: false }),
    );
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining("/academias/acad-1"),
    );
  });

  it("verify emite invite.registered con channel magic_link", async () => {
    const prisma = mkPrisma([{ id: "inv-1", invitedById: "p-owner" }]);
    const ctrl2 = ctrlWithPrisma(prisma);
    await repo.upsertByEmail("invitado@omnidance.dev");
    const token = await auth.createMagicToken("invitado@omnidance.dev", false, "15m", {
      next: "/academias/acad-1",
    });
    await ctrl2.verify(token, mkReq(), mkRes());
    expect(prisma.activityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "invite.registered",
          data: { channel: "magic_link" },
        }),
      }),
    );
  });

  it("verify sin invite consumido no setea la cookie de lente", async () => {
    const ctrl2 = ctrlWithPrisma(mkPrisma([]));
    await repo.upsertByEmail("normal@omnidance.dev");
    const token = await auth.createMagicToken("normal@omnidance.dev", false, "15m", {
      next: "/academias/acad-1",
    });
    const res = mkRes();
    await ctrl2.verify(token, mkReq(), res);
    const lensCalls = (res.cookie as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === "omnidance_lens",
    );
    expect(lensCalls).toHaveLength(0);
  });

  it("otp/verify con invite pendiente también setea la cookie", async () => {
    const ctrl2 = ctrlWithPrisma(mkPrisma([{ id: "inv-2", invitedById: "p-owner" }]));
    await repo.upsertByEmail("otp-inv@omnidance.dev");
    const code = await auth.createOtp("otp-inv@omnidance.dev", false, {
      next: "/academias/acad-1",
    });
    const res = mkRes();
    await ctrl2.otpVerify({ email: "otp-inv@omnidance.dev", code }, res);
    expect(res.cookie).toHaveBeenCalledWith(
      "omnidance_lens",
      "academy",
      expect.objectContaining({ httpOnly: false }),
    );
  });
});

// spec auth/acquisition-source (organic-acquisition-source): el alta
// orgánica registra la fuente capturada por la landing; la
// normalización la hace el servidor y solo se escribe en el alta.
describe("AuthController - fuente de adquisición orgánica", () => {
  let auth: AuthService;
  let repo: FakeRepo;
  let mailer: { send: ReturnType<typeof vi.fn> };
  let ctrl: AuthController;

  beforeEach(() => {
    repo = new FakeRepo();
    auth = new AuthService(SECRET, repo as unknown as AuthRepo);
    mailer = { send: vi.fn(async () => {}) };
    ctrl = new AuthController(
      auth,
      mailer as unknown as Mailer,
      repo as unknown as AuthRepo,
      new FakeConsent(repo) as unknown as ConsentService,
    );
  });

  const extractCode = (html: string) =>
    /letter-spacing:0\.4em;[^<]*>(\d{6})</.exec(html)![1];

  it("register con utm_source → acquisitionSource utm:<source> + detail", async () => {
    await ctrl.register(
      {
        email: "nueva@omnidance.dev",
        name: "Nueva",
        password: "clave-secreta-123",
        acquisition: {
          utmSource: "instagram",
          utmMedium: "social",
          landingPath: "/para-academias",
        },
      },
      mkRes(),
    );
    const person = repo.people.get("nueva@omnidance.dev")!;
    expect(person.acquisitionSource).toBe("utm:instagram");
    expect(person.acquisitionDetail).toMatchObject({
      utmSource: "instagram",
      utmMedium: "social",
      landingPath: "/para-academias",
    });
  });

  it("register con referrer externo (sin utm) → ref:<host>", async () => {
    await ctrl.register(
      {
        email: "ref@omnidance.dev",
        name: "Ref",
        password: "clave-secreta-123",
        acquisition: { referrer: "https://facebook.com/post/123" },
      },
      mkRes(),
    );
    expect(repo.people.get("ref@omnidance.dev")!.acquisitionSource).toBe(
      "ref:facebook.com",
    );
  });

  it("register con acquisition vacío → direct; sin campo → null", async () => {
    await ctrl.register(
      {
        email: "vacia@omnidance.dev",
        name: "Vacia",
        password: "clave-secreta-123",
        acquisition: {},
      },
      mkRes(),
    );
    expect(repo.people.get("vacia@omnidance.dev")!.acquisitionSource).toBe(
      "direct",
    );
    await ctrl.register(
      {
        email: "sin@omnidance.dev",
        name: "Sin",
        password: "clave-secreta-123",
      },
      mkRes(),
    );
    expect(repo.people.get("sin@omnidance.dev")!.acquisitionSource).toBeNull();
  });

  it("magic-link + verify de cuenta nueva → acquisition viaja en el claim", async () => {
    await ctrl.magicLink({
      email: "ml@omnidance.dev",
      consent: true,
      acquisition: { utmSource: "tiktok" },
    });
    const html: string = mailer.send.mock.calls[0][2];
    const token = /token=([^"'\s]+)/.exec(html)![1];
    await ctrl.verify(token, mkReq(), mkRes());
    const person = repo.people.get("ml@omnidance.dev")!;
    expect(person.acquisitionSource).toBe("utm:tiktok");
  });

  it("otp/verify de cuenta nueva → acquisition viaja en la fila del OTP", async () => {
    await ctrl.magicLink({
      email: "otp@omnidance.dev",
      consent: true,
      acquisition: { utmSource: "google", landingPath: "/" },
    });
    const code = extractCode(mailer.send.mock.calls[0][2]);
    const out = await ctrl.otpVerify(
      { email: "otp@omnidance.dev", code },
      mkRes(),
    );
    expect(out.isNew).toBe(true);
    expect(repo.people.get("otp@omnidance.dev")!.acquisitionSource).toBe(
      "utm:google",
    );
  });

  it("cuenta existente no pisa la fuente original", async () => {
    await ctrl.register(
      {
        email: "vieja@omnidance.dev",
        name: "Vieja",
        password: "clave-secreta-123",
        acquisition: { utmSource: "instagram" },
      },
      mkRes(),
    );
    // Segundo alta por magic link con otra fuente: no pisa.
    await ctrl.magicLink({
      email: "vieja@omnidance.dev",
      acquisition: { utmSource: "tiktok" },
    });
    // calls: welcome + verify del register + el magic link (último).
    const html: string = mailer.send.mock.calls.at(-1)![2];
    const token = /token=([^"'\s]+)/.exec(html)![1];
    await ctrl.verify(token, mkReq(), mkRes());
    expect(repo.people.get("vieja@omnidance.dev")!.acquisitionSource).toBe(
      "utm:instagram",
    );
  });
});

// spec api-hardening/auth: el magic link es single-use persistido
// (MagicTokenUse); el reuso solo pasa con sesión válida de la misma
// Person (grace de relogin/prefetch), si no → 401 uniforme.
describe("AuthController - magic token single-use", () => {
  let auth: AuthService;
  let repo: FakeRepo;
  let consent: FakeConsent;
  let mailer: { send: ReturnType<typeof vi.fn> };
  let ctrl: AuthController;

  beforeEach(() => {
    repo = new FakeRepo();
    auth = new AuthService(SECRET, repo as unknown as AuthRepo);
    consent = new FakeConsent(repo);
    mailer = { send: vi.fn(async () => {}) };
    ctrl = new AuthController(
      auth,
      mailer as unknown as Mailer,
      repo as unknown as AuthRepo,
      consent as unknown as ConsentService,
    );
  });

  const reqWithSession = async (personId: string) => {
    const session = await auth.issueSession(personId);
    return {
      ip: "127.0.0.1",
      headers: { cookie: `omnidance_session=${session}` },
    } as unknown as Request;
  };

  it("reuso sin sesión → 401 y no emite cookie", async () => {
    const token = await auth.createMagicToken("uno@omnidance.dev");
    const res1 = mkRes();
    await ctrl.verify(token, mkReq(), res1);
    expect(res1.redirect).toHaveBeenCalled();
    expect(repo.consumedMagicTokens.size).toBe(1);
    // Tercero con el mismo link, sin sesión → rechazado.
    await expect(
      ctrl.verify(token, mkReq(), mkRes()),
    ).rejects.toThrow("Link inválido o expirado");
  });

  it("reuso con sesión de OTRA Person → 401", async () => {
    const token = await auth.createMagicToken("dos@omnidance.dev");
    await ctrl.verify(token, mkReq(), mkRes());
    const otra = await repo.upsertByEmail("tercero@omnidance.dev");
    await expect(
      ctrl.verify(token, await reqWithSession(otra.id), mkRes()),
    ).rejects.toThrow("Link inválido o expirado");
  });

  it("reuso con sesión válida de la misma Person → grace (redirect, sin nueva cookie)", async () => {
    const token = await auth.createMagicToken(
      "tres@omnidance.dev",
      false,
      "15m",
      { next: "/academias/ac-9" },
    );
    await ctrl.verify(token, mkReq(), mkRes());
    const person = repo.people.get("tres@omnidance.dev")!;
    const res = mkRes();
    await ctrl.verify(token, await reqWithSession(person.id), res);
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining("/academias/ac-9"),
    );
    // El grace no re-emite la sesión - la request ya la traía.
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("next con %5c encoded se ignora → fallback /inicio", async () => {
    const token = await auth.createMagicToken(
      "cuatro@omnidance.dev",
      false,
      "15m",
      { next: "/%5cevil.com" },
    );
    await repo.upsertByEmail("cuatro@omnidance.dev");
    const res = mkRes();
    await ctrl.verify(token, mkReq(), res);
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining("/inicio"),
    );
    expect(res.redirect).not.toHaveBeenCalledWith(
      expect.stringContaining("evil.com"),
    );
  });
});

// spec api-hardening: cap por email destino (5/hora) además del por-IP -
// superado, 429 uniforme (ThrottlerException) y no sale el correo.
describe("AuthController - cap por email en envíos", () => {
  let auth: AuthService;
  let repo: FakeRepo;
  let mailer: { send: ReturnType<typeof vi.fn> };
  let ctrl: AuthController;

  beforeEach(() => {
    repo = new FakeRepo();
    auth = new AuthService(SECRET, repo as unknown as AuthRepo);
    mailer = { send: vi.fn(async () => {}) };
    ctrl = new AuthController(
      auth,
      mailer as unknown as Mailer,
      repo as unknown as AuthRepo,
      new FakeConsent(repo) as unknown as ConsentService,
    );
  });

  it("magic-link: el 6º envío a la misma víctima → 429 y no envía", async () => {
    for (let i = 0; i < 5; i++) {
      await ctrl.magicLink({ email: "cap@omnidance.dev", consent: true });
    }
    expect(mailer.send).toHaveBeenCalledTimes(5);
    await expect(
      ctrl.magicLink({ email: "cap@omnidance.dev", consent: true }),
    ).rejects.toBeInstanceOf(ThrottlerException);
    expect(mailer.send).toHaveBeenCalledTimes(5);
  });

  it("el cap es por email: otro destinatario no se afecta", async () => {
    for (let i = 0; i < 5; i++) {
      await ctrl.magicLink({ email: "lleno@omnidance.dev", consent: true });
    }
    await ctrl.magicLink({ email: "otro@omnidance.dev", consent: true });
    expect(mailer.send).toHaveBeenCalledTimes(6);
  });
});

// spec auth-sessions: toda emisión de sesión crea la fila AuthSession
// con el jti del JWT + userAgent/ip de la request.
describe("AuthController - AuthSession en emisión", () => {
  let auth: AuthService;
  let repo: FakeRepo;
  let mailer: { send: ReturnType<typeof vi.fn> };
  let ctrl: AuthController;

  beforeEach(() => {
    repo = new FakeRepo();
    auth = new AuthService(SECRET, repo as unknown as AuthRepo);
    mailer = { send: vi.fn(async () => {}) };
    ctrl = new AuthController(
      auth,
      mailer as unknown as Mailer,
      repo as unknown as AuthRepo,
      new FakeConsent(repo) as unknown as ConsentService,
    );
  });

  const UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1";
  const mkUaReq = () =>
    ({ ip: "9.9.9.9", headers: { "user-agent": UA } }) as unknown as Request;

  // El token emitido viaja en la cookie: lo verifica el service y el
  // jti resultante debe ser el de la fila AuthSession creada.
  const cookieToken = (res: Response) =>
    (res.cookie as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as
      string;

  it("login crea AuthSession con el jti del token + UA/ip de la request", async () => {
    const person = await repo.createWithPassword(
      "sess@omnidance.dev",
      "Sess",
      await auth.hashPassword("clave-secreta-123"),
    );
    const res = mkRes();
    await ctrl.login(
      { email: "sess@omnidance.dev", password: "clave-secreta-123" },
      mkUaReq(),
      res,
    );
    expect(repo.sessions).toHaveLength(1);
    const row = repo.sessions[0];
    const { personId, jti } = await auth.verifySession(cookieToken(res));
    expect(personId).toBe(person.id);
    expect(row.jti).toBe(jti);
    expect(row.personId).toBe(person.id);
    expect(row.userAgent).toBe(UA);
    expect(row.ip).toBe("9.9.9.9");
    expect(row.revokedAt).toBeNull();
  });

  it("verify (magic link) crea AuthSession", async () => {
    await ctrl.magicLink({ email: "magic@omnidance.dev", consent: true });
    const html: string = mailer.send.mock.calls[0][2];
    const token = /token=([^"'\s]+)/.exec(html)![1];
    const res = mkRes();
    await ctrl.verify(token, mkUaReq(), res);
    expect(repo.sessions).toHaveLength(1);
    // El verify responde redirect, no cookie legible por el spec:
    // la fila queda ligada a la Person creada.
    const person = repo.people.get("magic@omnidance.dev")!;
    expect(repo.sessions[0].personId).toBe(person.id);
    expect(repo.sessions[0].userAgent).toBe(UA);
  });

  it("otp/verify crea AuthSession", async () => {
    await ctrl.magicLink({ email: "otp2@omnidance.dev", consent: true });
    const html: string = mailer.send.mock.calls[0][2];
    const code = /letter-spacing:0\.4em;[^<]*>(\d{6})</.exec(html)![1];
    const res = mkRes();
    await ctrl.otpVerify(
      { email: "otp2@omnidance.dev", code },
      res,
      mkUaReq(),
    );
    expect(repo.sessions).toHaveLength(1);
    const { jti } = await auth.verifySession(cookieToken(res));
    expect(repo.sessions[0].jti).toBe(jti);
  });

  it("register crea AuthSession", async () => {
    const res = mkRes();
    await ctrl.register(
      {
        email: "reg@omnidance.dev",
        name: "Reg",
        password: "clave-secreta-123",
      },
      res,
      mkUaReq(),
    );
    expect(repo.sessions).toHaveLength(1);
    const person = repo.people.get("reg@omnidance.dev")!;
    expect(repo.sessions[0].personId).toBe(person.id);
  });
});

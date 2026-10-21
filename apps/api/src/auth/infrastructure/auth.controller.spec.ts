import { describe, it, expect, beforeEach, vi } from "vitest";
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
}

// No `implements AuthRepo`: los métodos devuelven FakePerson (shape
// reducido), no Person de Prisma - el cast en el constructor del
// controller cubre la diferencia.
class FakeRepo {
  people = new Map<string, FakePerson>();
  otps: AuthOtpRecord[] = [];
  private seq = 0;

  async upsertByEmail(email: string): Promise<FakePerson> {
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
    expiresAt: Date;
  }) {
    this.otps.push({
      id: `otp-${this.otps.length + 1}`,
      ...data,
      role: data.role ?? null,
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
    await ctrl.verify(token, res);
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
    await ctrl.verify(token, mkRes());
    const person = repo.people.get("link@omnidance.dev")!;
    expect(stampedIds()).toEqual([person.id]);
    expect(person.consentVersion).toBe("cl-v1.0");
  });

  it("magic-link sin consent → verify no estampa", async () => {
    await ctrl.magicLink({ email: "plain@omnidance.dev" });
    const html: string = mailer.send.mock.calls[0][2];
    const token = /token=([^"'\s]+)/.exec(html)![1];
    await ctrl.verify(token, mkRes());
    expect(stampedIds()).toEqual([]);
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
    await ctrl.verify(token, mkRes());
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

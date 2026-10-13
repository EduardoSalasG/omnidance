import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "../domain/auth.service";
import type { AuthOtpRecord, AuthRepo, Mailer } from "../domain/ports";

// AuthController - consentimiento legal (spec legal-consent): el flag
// `consent:true` de magic-link/login/register se estampa en la Person al
// crear la sesión. En magic link viaja como claim del token y se estampa
// en GET /auth/verify.

const SECRET = "test-secret-at-least-32-chars-long!!";

interface FakePerson {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  consentVersion: string | null;
  consentAcceptedAt: Date | null;
}

// No `implements AuthRepo`: los métodos devuelven FakePerson (shape
// reducido), no Person de Prisma - el cast en el constructor del
// controller cubre la diferencia.
class FakeRepo {
  people = new Map<string, FakePerson>();
  consentStamps: string[] = [];
  otps: AuthOtpRecord[] = [];
  private seq = 0;

  async upsertByEmail(email: string): Promise<FakePerson> {
    const existing = this.people.get(email);
    if (existing) return existing;
    const person: FakePerson = {
      id: `p-${++this.seq}`,
      email,
      name: email.split("@")[0],
      passwordHash: null,
      consentVersion: null,
      consentAcceptedAt: null,
    };
    this.people.set(email, person);
    return person;
  }

  async findByEmail(email: string) {
    return this.people.get(email) ?? null;
  }

  async createWithPassword(email: string, name: string, passwordHash: string) {
    const person: FakePerson = {
      id: `p-${++this.seq}`,
      email,
      name,
      passwordHash,
      consentVersion: null,
      consentAcceptedAt: null,
    };
    this.people.set(email, person);
    return person;
  }

  async setPassword(personId: string, passwordHash: string) {
    const p = [...this.people.values()].find((x) => x.id === personId);
    if (p) p.passwordHash = passwordHash;
  }

  async recordConsent(personId: string) {
    this.consentStamps.push(personId);
    const p = [...this.people.values()].find((x) => x.id === personId);
    if (p) {
      p.consentVersion = "2026-10";
      p.consentAcceptedAt = new Date();
    }
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
    expiresAt: Date;
  }) {
    this.otps.push({
      id: `otp-${this.otps.length + 1}`,
      ...data,
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
  let mailer: { send: ReturnType<typeof vi.fn> };
  let ctrl: AuthController;

  beforeEach(async () => {
    repo = new FakeRepo();
    // El repo se inyecta para los métodos OTP - JWT/password no lo usan.
    auth = new AuthService(SECRET, repo as unknown as AuthRepo);
    mailer = { send: vi.fn(async () => {}) };
    ctrl = new AuthController(
      auth,
      mailer as unknown as Mailer,
      repo as unknown as AuthRepo,
    );
  });

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
    expect(repo.consentStamps).toEqual([person.id]);
    expect(person.consentVersion).toBe("2026-10");
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
    expect(repo.consentStamps).toEqual([]);
    expect(repo.people.get("sin@omnidance.dev")!.consentVersion).toBeNull();
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
    expect(repo.consentStamps).toEqual([]);
    await ctrl.login(
      {
        email: "baila@omnidance.dev",
        password: "clave-secreta-123",
        consent: true,
      },
      mkReq(),
      mkRes(),
    );
    expect(repo.consentStamps).toEqual([person.id]);
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
    expect(repo.consentStamps).toEqual([person.id]);
    expect(person.consentVersion).toBe("2026-10");
  });

  it("magic-link sin consent → verify no estampa", async () => {
    await ctrl.magicLink({ email: "plain@omnidance.dev" });
    const html: string = mailer.send.mock.calls[0][2];
    const token = /token=([^"'\s]+)/.exec(html)![1];
    await ctrl.verify(token, mkRes());
    expect(repo.consentStamps).toEqual([]);
  });
});

describe("AuthController - OTP (spec auth-email-otp)", () => {
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
    expect(repo.consentStamps).toEqual([person.id]);
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

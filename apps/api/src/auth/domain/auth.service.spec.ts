import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import { AuthService } from "./auth.service";
import type { AuthOtpRecord, AuthRepo } from "./ports";

const SECRET = "test-secret-at-least-32-chars-long!!";

describe("AuthService", () => {
  const svc = new AuthService(SECRET);
  const secretKey = new TextEncoder().encode(SECRET);

  it("issueSession retorna JWT verificable con sub=personId, exp ~30d", async () => {
    const token = await svc.issueSession("person-123");
    const { payload } = await jwtVerify(token, secretKey);
    expect(payload.sub).toBe("person-123");
    expect(payload.purpose).toBe("session");
    const days = (payload.exp! - payload.iat!) / 86400;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it("createMagicToken produce token con purpose=magic y exp ~15min", async () => {
    const token = await svc.createMagicToken("a@b.cl");
    const { payload } = await jwtVerify(token, secretKey);
    expect(payload.purpose).toBe("magic");
    expect(payload.email).toBe("a@b.cl");
    const mins = (payload.exp! - payload.iat!) / 60;
    expect(mins).toBeGreaterThan(14);
    expect(mins).toBeLessThan(16);
  });

  it("createMagicToken con ttl explícito respeta la duración pedida", async () => {
    // Invitaciones (staff/alumnos importados): el link dura días.
    const token = await svc.createMagicToken("inv@b.cl", false, "7d");
    const { payload } = await jwtVerify(token, secretKey);
    const days = (payload.exp! - payload.iat!) / 86400;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(await svc.verifyMagicToken(token)).toEqual({
      email: "inv@b.cl",
      consent: false,
    });
  });

  it("verifyMagicToken rechaza un token de sesión", async () => {
    const session = await svc.issueSession("p1");
    await expect(svc.verifyMagicToken(session)).rejects.toThrow();
  });

  it("hashPassword/verifyPassword: round-trip válido y rechaza password incorrecto", async () => {
    const hash = await svc.hashPassword("clave-secreta-123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await svc.verifyPassword("clave-secreta-123", hash)).toBe(true);
    expect(await svc.verifyPassword("otra-clave", hash)).toBe(false);
  });

  it("verifyPassword tolera hashes malformados sin lanzar", async () => {
    expect(await svc.verifyPassword("x", "no-es-un-hash")).toBe(false);
    expect(await svc.verifyPassword("x", "scrypt$abc$8$1$zz$")).toBe(false);
    expect(await svc.verifyPassword("x", "")).toBe(false);
  });

  it("hashPassword produce salts distintos para el mismo password", async () => {
    const [a, b] = await Promise.all([
      svc.hashPassword("misma"),
      svc.hashPassword("misma"),
    ]);
    expect(a).not.toBe(b);
  });
});

// OTP de acceso por email (spec auth-email-otp): el service orquesta el
// repo - genera el código, persiste solo su hash y verifica con
// single-use real + contador de intentos.
class FakeOtpRepo {
  otps: AuthOtpRecord[] = [];
  private seq = 0;

  async createOtp(data: {
    email: string;
    codeHash: string;
    consent: boolean;
    expiresAt: Date;
  }) {
    this.otps.push({
      id: `otp-${++this.seq}`,
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

describe("AuthService OTP (auth-email-otp)", () => {
  const setup = () => {
    const repo = new FakeOtpRepo();
    const svc = new AuthService(SECRET, repo as unknown as AuthRepo);
    return { repo, svc };
  };

  it("createOtp devuelve 6 dígitos y persiste solo el hash (nunca en claro)", async () => {
    const { repo, svc } = setup();
    const code = await svc.createOtp("a@b.cl", false);
    expect(code).toMatch(/^\d{6}$/);
    const row = repo.otps.at(-1)!;
    expect(row.email).toBe("a@b.cl");
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(row.codeHash).not.toContain(code);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 11 * 60 * 1000,
    );
  });

  it("createOtp invalida los códigos activos previos del mismo email", async () => {
    const { repo, svc } = setup();
    const first = await svc.createOtp("a@b.cl", false);
    const second = await svc.createOtp("a@b.cl", false);
    expect(repo.otps[0].consumedAt).toBeInstanceOf(Date);
    await expect(svc.verifyOtp("a@b.cl", first)).rejects.toThrow();
    await expect(svc.verifyOtp("a@b.cl", second)).resolves.toEqual({
      email: "a@b.cl",
      consent: false,
    });
    // Otros emails no se ven afectados.
  });

  it("verifyOtp éxito devuelve {email, consent} y consume el código (single-use)", async () => {
    const { repo, svc } = setup();
    const code = await svc.createOtp("a@b.cl", true);
    await expect(svc.verifyOtp("a@b.cl", code)).resolves.toEqual({
      email: "a@b.cl",
      consent: true,
    });
    expect(repo.otps[0].consumedAt).toBeInstanceOf(Date);
    // Reuso rechazado.
    await expect(svc.verifyOtp("a@b.cl", code)).rejects.toThrow();
  });

  it("verifyOtp código incorrecto suma intento y lanza", async () => {
    const { repo, svc } = setup();
    const code = await svc.createOtp("a@b.cl", false);
    // Código distinto del emitido, garantizado.
    const wrong = code === "000000" ? "000001" : "000000";
    await expect(svc.verifyOtp("a@b.cl", wrong)).rejects.toThrow();
    expect(repo.otps[0].attempts).toBe(1);
  });

  it("verifyOtp tras 5 intentos fallidos rechaza incluso el código correcto", async () => {
    const { repo, svc } = setup();
    const code = await svc.createOtp("a@b.cl", false);
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      await expect(svc.verifyOtp("a@b.cl", wrong)).rejects.toThrow();
    }
    expect(repo.otps[0].attempts).toBe(5);
    await expect(svc.verifyOtp("a@b.cl", code)).rejects.toThrow();
  });

  it("verifyOtp código expirado lanza", async () => {
    const { repo, svc } = setup();
    const code = await svc.createOtp("a@b.cl", false);
    repo.otps[0].expiresAt = new Date(Date.now() - 1000);
    await expect(svc.verifyOtp("a@b.cl", code)).rejects.toThrow();
  });

  it("verifyOtp sin solicitud vigente lanza", async () => {
    const { svc } = setup();
    await expect(svc.verifyOtp("nadie@b.cl", "123456")).rejects.toThrow();
  });
});

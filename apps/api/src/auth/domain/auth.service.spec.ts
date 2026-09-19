import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import { AuthService } from "./auth.service";

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

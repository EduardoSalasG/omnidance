import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { QrService } from "./qr.service";

const SECRET = "qr-test-secret-at-least-32-chars!!";

describe("QrService", () => {
  const svc = new QrService(SECRET);

  it("mint + verify round-trip retorna personId", async () => {
    const { token, expiresAt } = await svc.mint("person-1");
    const { personId } = await svc.verify(token);
    expect(personId).toBe("person-1");
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rechaza token expirado", async () => {
    const key = new TextEncoder().encode(SECRET);
    const expired = await new SignJWT({ purpose: "qr" })
      .setSubject("person-1")
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    await expect(svc.verify(expired)).rejects.toThrow();
  });

  it("rechaza token con purpose distinto", async () => {
    const key = new TextEncoder().encode(SECRET);
    const wrong = await new SignJWT({ purpose: "magic" })
      .setSubject("person-1")
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(key);
    await expect(svc.verify(wrong)).rejects.toThrow();
  });

  it("rechaza firma con otro secreto", async () => {
    const other = new QrService("otro-secreto-totalmente-distinto-123456");
    const { token } = await other.mint("person-1");
    await expect(svc.verify(token)).rejects.toThrow();
  });
});

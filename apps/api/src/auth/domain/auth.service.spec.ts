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
});

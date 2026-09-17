import { SignJWT, jwtVerify } from "jose";

export class AuthService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  issueSession(personId: string): Promise<string> {
    return new SignJWT({ purpose: "session" })
      .setSubject(personId)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(this.key);
  }

  createMagicToken(email: string): Promise<string> {
    return new SignJWT({ purpose: "magic", email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(this.key);
  }

  async verifyMagicToken(token: string): Promise<{ email: string }> {
    const { payload } = await jwtVerify(token, this.key);
    if (payload.purpose !== "magic" || typeof payload.email !== "string") {
      throw new Error("invalid magic token");
    }
    return { email: payload.email };
  }

  async verifySession(token: string): Promise<{ personId: string }> {
    const { payload } = await jwtVerify(token, this.key);
    if (payload.purpose !== "session" || !payload.sub) {
      throw new Error("invalid session token");
    }
    return { personId: payload.sub };
  }
}

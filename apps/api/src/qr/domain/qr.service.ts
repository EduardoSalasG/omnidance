import { SignJWT, jwtVerify } from "jose";

const QR_TTL_SECONDS = 60;

export class QrService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async mint(personId: string): Promise<{ token: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000);
    const token = await new SignJWT({ purpose: "qr" })
      .setSubject(personId)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.key);
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async verify(token: string): Promise<{ personId: string }> {
    const { payload } = await jwtVerify(token, this.key);
    if (payload.purpose !== "qr" || !payload.sub) {
      throw new Error("invalid qr token");
    }
    return { personId: payload.sub };
  }
}

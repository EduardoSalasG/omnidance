import { SignJWT, jwtVerify } from "jose";
import { SESSION_RULES } from "@omnidance/shared";

// Default del dominio — los callers parametrizan vía qr.rotation_seconds.
const QR_TTL_SECONDS: number = SESSION_RULES.QR_ROTATION_SECONDS;

export class QrService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async mint(
    personId: string,
    ttlSeconds = QR_TTL_SECONDS,
  ): Promise<{ token: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
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

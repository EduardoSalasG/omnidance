import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type BinaryLike,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";

// El overload con `options` existe en runtime pero @types/node no lo
// expone en la firma promisificada — se declara aquí explícitamente.
const scryptAsync = promisify(scrypt) as unknown as (
  password: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  options?: ScryptOptions,
) => Promise<Buffer>;

// Formato del hash: scrypt$N$r$p$salt$hash (salt y hash en hex).
// Self-describing para permitir rotar parámetros sin romper hashes viejos.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

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

  async hashPassword(password: string): Promise<string> {
    const { N, r, p, keylen } = SCRYPT_PARAMS;
    const salt = randomBytes(16);
    const hash = (await scryptAsync(password, salt, keylen, { N, r, p })) as Buffer;
    return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${hash.toString("hex")}`;
  }

  async verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
    const [N, r, p] = [Number(nStr), Number(rStr), Number(pStr)];
    const expected = Buffer.from(hashHex, "hex");
    if (!N || !r || !p || !saltHex || expected.length === 0) return false;
    const salt = Buffer.from(saltHex, "hex");
    const actual = (await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      // scrypt lanza si el costo excede maxmem por defecto con N altos
      maxmem: 128 * N * r * 2,
    })) as Buffer;
    return timingSafeEqual(actual, expected);
  }
}

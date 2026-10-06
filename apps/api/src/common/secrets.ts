// Cifrado de credenciales de terceros en reposo (spec
// producer-gateway-accounts): AES-256-GCM con key de env
// `PRODUCER_GATEWAY_KEY` (64 hex = 32 bytes). El blob persiste como
// `v1.<iv>.<tag>.<ct>` base64 - versionado para rotación futura.
// Sin key válida NO se persiste ni usa material: fail explícito.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENV_KEY = "PRODUCER_GATEWAY_KEY";

function key(): Buffer {
  const raw = process.env[ENV_KEY];
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      `${ENV_KEY} requerida: 64 caracteres hex (32 bytes) - generar con \`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\``,
    );
  }
  return Buffer.from(raw, "hex");
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ct.toString("base64"),
  ].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !ct) {
    throw new Error("blob de credenciales inválido o versión desconocida");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Lo único visible de una credencial por API: últimos 4 caracteres. */
export function maskSecret(secret: string): string {
  return `••••${secret.slice(-4)}`;
}

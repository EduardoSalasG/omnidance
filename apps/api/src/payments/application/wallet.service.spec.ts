import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { generateKeyPair, exportPKCS8, jwtVerify } from "jose";
import { WalletService } from "./wallet.service";

// WalletService (spec wallet-passes): saveUrl de Google Wallet con
// GenericPass lanzador a /qr (sin barcode - el QR personal es la
// credencial); null sin credenciales → 503 en el controller.

const prisma = {
  person: {
    findUnique: async () => ({ name: "Ana Paz" }),
  },
};

const svc = () => new WalletService(prisma as never);

describe("WalletService", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    delete process.env.GOOGLE_WALLET_ISSUER_ID;
    delete process.env.GOOGLE_WALLET_SA_EMAIL;
    delete process.env.GOOGLE_WALLET_SA_PRIVATE_KEY;
    process.env.WEB_URL = "https://app.test";
  });
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("sin credenciales → configured false y saveUrl null", async () => {
    const svc = new WalletService(prisma as never);
    expect(svc.configured()).toBe(false);
    expect(await svc.googleSaveUrl("p1")).toBeNull();
  });

  it("con credenciales → saveUrl firmado RS256 con pase lanzador a /qr", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const pem = await exportPKCS8(privateKey);
    // El env suele llegar con \n escapados - el service los normaliza.
    process.env.GOOGLE_WALLET_SA_PRIVATE_KEY = pem.replace(/\n/g, "\\n");
    process.env.GOOGLE_WALLET_SA_EMAIL = "sa@test.iam.gserviceaccount.com";
    process.env.GOOGLE_WALLET_ISSUER_ID = "3388000000012345678";

    const svc = new WalletService(prisma as never);
    expect(svc.configured()).toBe(true);
    const url = await svc.googleSaveUrl("p1");
    expect(url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);

    const jwt = url!.split("/save/")[1];
    const { payload } = await jwtVerify(jwt, publicKey, {
      audience: "google",
    });
    const obj = (
      payload.payload as {
        genericObjects: Record<string, unknown>[];
      }
    ).genericObjects[0];
    expect(obj.id).toBe("3388000000012345678.person-p1");
    expect(obj.classId).toBe("3388000000012345678.omnidance-qr");
    // Lanzador: solo el link a /qr - sin barcode.
    expect(
      (
        obj.linksModuleData as { uris: { uri: string }[] }
      ).uris[0].uri,
    ).toBe("https://app.test/qr");
    expect(obj.barcode).toBeUndefined();
  });
});

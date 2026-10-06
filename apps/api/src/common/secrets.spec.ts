import { describe, expect, it, afterEach } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "./secrets";

const KEY = "a".repeat(64);

afterEach(() => {
  delete process.env.PRODUCER_GATEWAY_KEY;
});

describe("secrets (AES-256-GCM)", () => {
  it("roundtrip encrypt/decrypt", () => {
    process.env.PRODUCER_GATEWAY_KEY = KEY;
    const blob = encryptSecret('{"apiKey":"k","secret":"s"}');
    expect(blob.startsWith("v1.")).toBe(true);
    expect(blob).not.toContain('"apiKey"');
    expect(decryptSecret(blob)).toBe('{"apiKey":"k","secret":"s"}');
  });

  it("dos encrypts del mismo plaintext producen blobs distintos (iv random)", () => {
    process.env.PRODUCER_GATEWAY_KEY = KEY;
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("sin key → error explícito en ambas direcciones", () => {
    expect(() => encryptSecret("x")).toThrow("PRODUCER_GATEWAY_KEY");
    expect(() => decryptSecret("v1.a.b.c")).toThrow("PRODUCER_GATEWAY_KEY");
  });

  it("key con formato inválido → error explícito", () => {
    process.env.PRODUCER_GATEWAY_KEY = "corta";
    expect(() => encryptSecret("x")).toThrow("PRODUCER_GATEWAY_KEY");
  });

  it("blob corrupto o adulterado → error de descifrado (GCM tag)", () => {
    process.env.PRODUCER_GATEWAY_KEY = KEY;
    const blob = encryptSecret("secreto");
    expect(() => decryptSecret("v1.bad.blob")).toThrow();
    // adultera el TAG (segundo segmento): cualquier cambio rompe la
    // verificación GCM. El flip es determinista del primer char del
    // tag - si ya es "A" se usa "B".
    const [v, iv, tag, ct] = blob.split(".");
    const tampered = [v, iv, (tag!.at(0) === "A" ? "B" : "A") + tag!.slice(1), ct].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("maskSecret solo expone los últimos 4", () => {
    expect(maskSecret("sk_live_1234abcd")).toBe("••••abcd");
    expect(maskSecret("ab")).toBe("••••ab");
  });
});

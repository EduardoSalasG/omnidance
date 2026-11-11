import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { cleanHttpUrl, sanitizeMethodDetails } from "./http-url";

// Whitelist http(s) en write (spec web-edge-security): los valores que
// persisten acá se renderizan en <a href> - esquemas no-http son sink
// de phishing/handlers (audit frontend M1, B2).
describe("cleanHttpUrl", () => {
  it("normaliza http/https absolutas", () => {
    expect(cleanHttpUrl("https://mpago.la/abc")).toBe("https://mpago.la/abc");
    expect(cleanHttpUrl("http://ej.cl/pago")).toBe("http://ej.cl/pago");
    expect(cleanHttpUrl("https://ej.cl/")).toBe("https://ej.cl");
  });

  it("asume https:// cuando falta esquema", () => {
    expect(cleanHttpUrl("mpago.la/abc")).toBe("https://mpago.la/abc");
    // Protocol-relative se normaliza a https absoluta - el esquema
    // resultante sigue en whitelist.
    expect(cleanHttpUrl("//evil.example")).toBe("https://evil.example");
  });

  it("rechaza esquemas no-http con 400", () => {
    for (const bad of [
      "javascript:alert(1)",
      "javascript://host/%0aalert(1)",
      "file:///etc/passwd",
      "ftp://files.ej.cl/x",
      "data:text/html,<b>x</b>",
      "intent://x",
    ]) {
      expect(() => cleanHttpUrl(bad)).toThrow(BadRequestException);
    }
  });

  it("rechaza host sin punto y strings no parseables", () => {
    expect(() => cleanHttpUrl("http://localhost/x")).toThrow(
      BadRequestException,
    );
    expect(() => cleanHttpUrl("no soy url")).toThrow(BadRequestException);
  });

  it("undefined no toca; vacío/null limpian a null", () => {
    expect(cleanHttpUrl(undefined)).toBeUndefined();
    expect(cleanHttpUrl("")).toBeNull();
    expect(cleanHttpUrl(null)).toBeNull();
    expect(cleanHttpUrl("   ")).toBeNull();
  });
});

describe("sanitizeMethodDetails", () => {
  it("PAYMENT_LINK normaliza details.url", () => {
    expect(
      sanitizeMethodDetails("PAYMENT_LINK", { url: "mpago.la/abc" }),
    ).toEqual({ url: "https://mpago.la/abc" });
  });

  it("PAYMENT_LINK rechaza url inválida o no-string", () => {
    expect(() =>
      sanitizeMethodDetails("PAYMENT_LINK", { url: "javascript:x" }),
    ).toThrow(BadRequestException);
    expect(() =>
      sanitizeMethodDetails("PAYMENT_LINK", { url: 42 }),
    ).toThrow(BadRequestException);
  });

  it("PAYMENT_LINK sin url viaja tal cual", () => {
    const d = { instructions: "paga y avisa" };
    expect(sanitizeMethodDetails("PAYMENT_LINK", d)).toBe(d);
  });

  it("otros tipos no tocan details", () => {
    const d = { bank: "X", url: "javascript:x" };
    expect(sanitizeMethodDetails("TRANSFER", d)).toBe(d);
    expect(sanitizeMethodDetails("CASH", d)).toBe(d);
  });
});

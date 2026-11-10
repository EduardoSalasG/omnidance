/**
 * Whitelist http(s) de anchors externos (spec web-edge-security): un
 * href con dato de actor solo navega si es http/https absoluta - el
 * esquema malicioso o no parseable omite el anchor (undefined).
 */
import { describe, expect, it } from "vitest";
import { safeExternalHref } from "./safe-external";

describe("safeExternalHref", () => {
  it("acepta http/https absolutas", () => {
    expect(safeExternalHref("https://mpago.la/abc")).toBe(
      "https://mpago.la/abc",
    );
    expect(safeExternalHref("http://ej.cl/pago")).toBe(
      "http://ej.cl/pago",
    );
  });

  it("rechaza esquemas no-http", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "javascript://host/%0aalert(1)",
      "file:///etc/passwd",
      "data:text/html,<b>x</b>",
      "ftp://files.ej.cl/x",
      "intent://x",
      "mailto:a@b.cl",
    ]) {
      expect(safeExternalHref(bad)).toBeUndefined();
    }
  });

  it("rechaza strings no parseables y vacíos", () => {
    expect(safeExternalHref("no soy url")).toBeUndefined();
    expect(safeExternalHref("//evil.example")).toBeUndefined();
    expect(safeExternalHref("/relativo")).toBeUndefined();
    expect(safeExternalHref("")).toBeUndefined();
    expect(safeExternalHref(null)).toBeUndefined();
    expect(safeExternalHref(undefined)).toBeUndefined();
  });
});

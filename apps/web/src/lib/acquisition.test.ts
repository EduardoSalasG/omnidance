// @vitest-environment happy-dom
/**
 * Captura first-touch de la fuente orgánica (spec
 * auth/acquisition-source): UTM + referrer externo + landingPath en
 * localStorage; la primera landing gana.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  ACQUISITION_KEY,
  captureAcquisition,
  readAcquisition,
} from "./acquisition";

describe("acquisition - captura first-touch", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("captura utm + referrer + landingPath de la URL actual", () => {
    window.history.replaceState(
      {},
      "",
      "/para-academias?utm_source=instagram&utm_medium=social",
    );
    const cap = captureAcquisition();
    expect(cap).toMatchObject({
      utmSource: "instagram",
      utmMedium: "social",
      landingPath: "/para-academias",
    });
    expect(readAcquisition()).toMatchObject({ utmSource: "instagram" });
    expect(window.localStorage.getItem(ACQUISITION_KEY)).toBeTruthy();
  });

  it("first-touch: una segunda landing no pisa la captura", () => {
    window.history.replaceState(
      {},
      "",
      "/?utm_source=google",
    );
    captureAcquisition();
    window.history.replaceState({}, "", "/pro?utm_source=tiktok");
    const cap = captureAcquisition();
    expect(cap?.utmSource).toBe("google");
    expect(readAcquisition()?.utmSource).toBe("google");
  });

  it("sin utm conserva landingPath y no falla", () => {
    window.history.replaceState({}, "", "/pro");
    const cap = captureAcquisition();
    expect(cap?.landingPath).toBe("/pro");
    expect(cap?.utmSource).toBeUndefined();
  });
});

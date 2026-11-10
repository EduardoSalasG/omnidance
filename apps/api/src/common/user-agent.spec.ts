import { describe, expect, it } from "vitest";
import { deviceLabel, osLabel } from "./user-agent";

describe("user-agent labels (spec auth-sessions)", () => {
  it("iPhone Safari", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
    expect(deviceLabel(ua)).toBe("iPhone · Safari");
    expect(osLabel(ua)).toBe("iOS");
  });

  it("Android Chrome", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
    expect(deviceLabel(ua)).toBe("Android · Chrome");
    expect(osLabel(ua)).toBe("Android");
  });

  it("Android Chrome iOS (CriOS) cae en Chrome", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1";
    expect(deviceLabel(ua)).toBe("iPhone · Chrome");
  });

  it("Windows Chrome y Edge", () => {
    const chrome =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const edge = `${chrome} Edg/124.0.0.0`;
    expect(deviceLabel(chrome)).toBe("Windows · Chrome");
    expect(deviceLabel(edge)).toBe("Windows · Edge");
    expect(osLabel(chrome)).toBe("Windows");
  });

  it("Mac Firefox", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0";
    expect(deviceLabel(ua)).toBe("Mac · Firefox");
    expect(osLabel(ua)).toBe("macOS");
  });

  it("UA ausente o irreconocible degrada sin lanzar", () => {
    expect(deviceLabel(undefined)).toBe("Dispositivo desconocido");
    expect(deviceLabel(null)).toBe("Dispositivo desconocido");
    expect(deviceLabel("curl/8.0")).toBe("Dispositivo");
    expect(osLabel(undefined)).toBeNull();
    expect(osLabel("curl/8.0")).toBeNull();
  });
});

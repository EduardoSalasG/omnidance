import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import {
  throttleAuthLimit,
  throttleGlobalLimit,
  throttleSkipIf,
  throttleTtlMs,
} from "./throttle.config";

// Las funciones leen process.env en cada llamada → el spec manipula env
// directamente y restaura al salir.
const ENV_KEYS = [
  "THROTTLE_TTL_MS",
  "THROTTLE_GLOBAL_LIMIT",
  "THROTTLE_AUTH_LIMIT",
  "NODE_ENV",
] as const;

const ctx = (type: string) =>
  ({ getType: () => type }) as unknown as ExecutionContext;

describe("throttle.config", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("defaults: 300/min global, 8/min auth, ventana 60s", () => {
    expect(throttleGlobalLimit()).toBe(300);
    expect(throttleAuthLimit()).toBe(8);
    expect(throttleTtlMs()).toBe(60_000);
  });

  it("lee overrides de env", () => {
    process.env.THROTTLE_GLOBAL_LIMIT = "500";
    process.env.THROTTLE_AUTH_LIMIT = "3";
    process.env.THROTTLE_TTL_MS = "30000";
    expect(throttleGlobalLimit()).toBe(500);
    expect(throttleAuthLimit()).toBe(3);
    expect(throttleTtlMs()).toBe(30_000);
  });

  it("env inválido o no positivo → fallback", () => {
    process.env.THROTTLE_GLOBAL_LIMIT = "abc";
    process.env.THROTTLE_AUTH_LIMIT = "0";
    process.env.THROTTLE_TTL_MS = "-5";
    expect(throttleGlobalLimit()).toBe(300);
    expect(throttleAuthLimit()).toBe(8);
    expect(throttleTtlMs()).toBe(60_000);
  });

  it("skipIf salta contextos no-HTTP (socket.io/rpc)", () => {
    expect(throttleSkipIf(ctx("ws"))).toBe(true);
    expect(throttleSkipIf(ctx("rpc"))).toBe(true);
    expect(throttleSkipIf(ctx("http"))).toBe(false);
  });

  it("skipIf salta todo en NODE_ENV=test (e2e)", () => {
    process.env.NODE_ENV = "test";
    expect(throttleSkipIf(ctx("http"))).toBe(true);
  });
});

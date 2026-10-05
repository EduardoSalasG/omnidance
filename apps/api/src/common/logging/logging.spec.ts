import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "winston";
import { redactValue } from "./logger.factory";
import { requestLoggerMiddleware } from "./request-logger.middleware";
import { getLogContext, runWithLogContext } from "./log-context";

describe("redactValue", () => {
  it("enmascara claves sensibles a cualquier profundidad", () => {
    const input = {
      plan: "MONTHLY",
      body: { password: "x", card: "4111" },
      headers: { authorization: "Bearer tok", host: "h" },
      nested: [{ token: "abc", ok: 1 }],
    };
    const out = redactValue(input) as Record<string, any>;
    expect(out.plan).toBe("MONTHLY");
    expect(out.body.password).toBe("[redacted]");
    expect(out.body.card).toBe("4111");
    expect(out.headers.authorization).toBe("[redacted]");
    expect(out.headers.host).toBe("h");
    expect(out.nested[0].token).toBe("[redacted]");
    expect(out.nested[0].ok).toBe(1);
  });

  it("no muta el input y respeta no-objetos", () => {
    const input = { token: "keep" };
    redactValue(input);
    expect(input.token).toBe("keep");
    expect(redactValue("str")).toBe("str");
    expect(redactValue(42)).toBe(42);
  });

  it("enmascara claves sensibles a nivel top del record", async () => {
    const { Writable } = await import("node:stream");
    const { createLogger, format, transports } = await import("winston");
    const { redactMeta } = await import("./logger.factory");
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const logger = createLogger({
      level: "info",
      transports: [
        new transports.Stream({
          stream: sink,
          format: format.combine(redactMeta(), format.json()),
        }),
      ],
    });
    logger.info("t", { token: "abc", plan: "M", qrPayload: "zzz" });
    await new Promise((r) => setImmediate(r));
    const rec = JSON.parse(lines[0]);
    expect(rec.token).toBe("[redacted]");
    expect(rec.qrPayload).toBe("[redacted]");
    expect(rec.plan).toBe("M");
  });
});

describe("requestLoggerMiddleware", () => {
  function fakeRes(status = 200) {
    const res = new EventEmitter() as EventEmitter & {
      statusCode: number;
      setHeader: (k: string, v: string) => void;
      headers: Record<string, string>;
    };
    res.statusCode = status;
    res.headers = {};
    res.setHeader = (k, v) => {
      res.headers[k] = v;
    };
    return res;
  }

  function fakeReq(overrides: Record<string, unknown> = {}) {
    return {
      method: "GET",
      baseUrl: "",
      path: "/api/events",
      header: () => undefined,
      ip: "127.0.0.1",
      ...overrides,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  function fakeLogger() {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger & {
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };
  }

  it("hereda un x-request-id entrante y lo devuelve en la respuesta", () => {
    const logger = fakeLogger();
    const req = fakeReq({ header: (k: string) => (k === "x-request-id" ? "abc-123" : undefined) });
    const res = fakeRes();
    requestLoggerMiddleware(logger)(req, res as never, () => {});
    res.emit("finish");
    expect(res.headers["x-request-id"]).toBe("abc-123");
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("/api/events"),
      expect.objectContaining({ requestId: "abc-123", status: 200 }),
    );
  });

  it("genera UUID cuando no viene header", () => {
    const logger = fakeLogger();
    const res = fakeRes();
    requestLoggerMiddleware(logger)(fakeReq(), res as never, () => {});
    res.emit("finish");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("nivel por status: warn en 4xx, error en 5xx", () => {
    const logger = fakeLogger();
    const res4 = fakeRes(404);
    requestLoggerMiddleware(logger)(fakeReq(), res4 as never, () => {});
    res4.emit("finish");
    const res5 = fakeRes(500);
    requestLoggerMiddleware(logger)(fakeReq(), res5 as never, () => {});
    res5.emit("finish");
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("excluye health y docs", () => {
    const logger = fakeLogger();
    for (const path of ["/api/health", "/api/docs", "/api/docs-json"]) {
      const res = fakeRes();
      requestLoggerMiddleware(logger)(fakeReq({ path }), res as never, () => {});
      res.emit("finish");
    }
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("incluye personId cuando la sesión quedó poblada", () => {
    const logger = fakeLogger();
    const res = fakeRes();
    requestLoggerMiddleware(logger)(
      fakeReq({ person: { id: "p1" } }),
      res as never,
      () => {},
    );
    res.emit("finish");
    expect(logger.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ personId: "p1" }),
    );
  });

  it("propaga requestId por AsyncLocalStorage dentro del handler", () => {
    const logger = fakeLogger();
    const req = fakeReq({ header: () => "ctx-1" });
    const res = fakeRes();
    let seen: string | undefined;
    requestLoggerMiddleware(logger)(req, res as never, () => {
      seen = getLogContext().requestId;
    });
    expect(seen).toBe("ctx-1");
  });
});

describe("log-context", () => {
  it("devuelve contexto vacío fuera de un run", () => {
    expect(getLogContext()).toEqual({});
  });

  it("expone el store dentro del run", () => {
    runWithLogContext({ requestId: "r1" }, () => {
      expect(getLogContext().requestId).toBe("r1");
    });
  });
});

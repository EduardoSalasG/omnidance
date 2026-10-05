import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import type { Logger } from "winston";
import { runWithLogContext } from "./log-context";

const SKIP_PREFIXES = ["/api/health", "/api/docs", "/favicon.ico"];
const MAX_INCOMING_ID = 128;

interface RequestWithPerson extends Omit<Request, "person"> {
  person?: { id?: string };
}

/**
 * Middleware global (registrado en main.ts antes de listen — cubre
 * todos los requests HTTP, incluidos 404s de rutas inexistentes):
 * asigna/hereda x-request-id, lo propaga por AsyncLocalStorage y en
 * res.finish emite la línea resumen del request.
 */
export function requestLoggerMiddleware(logger: Logger) {
  return (req: RequestWithPerson, res: Response, next: NextFunction) => {
    const incoming = req.header("x-request-id");
    const requestId =
      incoming && incoming.length <= MAX_INCOMING_ID
        ? incoming
        : randomUUID();
    res.setHeader("x-request-id", requestId);
    const start = process.hrtime.bigint();

    runWithLogContext({ requestId }, () => {
      res.on("finish", () => {
        const path = req.baseUrl + req.path;
        if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return;
        const status = res.statusCode;
        const durationMs = Math.round(
          Number(process.hrtime.bigint() - start) / 1e6,
        );
        const meta = {
          type: "http.request",
          method: req.method,
          path,
          status,
          durationMs,
          requestId,
          ip: req.ip,
          ...(req.person?.id ? { personId: req.person.id } : {}),
        };
        const msg = `${req.method} ${path} ${status} ${durationMs}ms`;
        if (status >= 500) logger.error(msg, meta);
        else if (status >= 400) logger.warn(msg, meta);
        else logger.info(msg, meta);
      });
      next();
    });
  };
}

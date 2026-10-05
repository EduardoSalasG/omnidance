import { createLogger, format, transports, type Logger } from "winston";
import { utilities as nestWinstonModuleUtilities } from "nest-winston";
import { getLogContext } from "./log-context";

const SENSITIVE_KEY =
  /authorization|cookie|password|passwd|secret|token|jwt|session|qr/i;
const MASK = "[redacted]";
const MAX_DEPTH = 6;

export function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object" || depth > MAX_DEPTH) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, depth + 1));
  }
  if (value instanceof Error) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? MASK : redactValue(v, depth + 1);
  }
  return out;
}

// Inyecta requestId del contexto async en todo log del request.
const injectContext = format((info) => {
  const { requestId } = getLogContext();
  if (requestId && info.requestId === undefined) {
    info.requestId = requestId;
  }
  return info;
});

// Campos propios del record - el resto se escanea como meta.
const OWN_KEYS = new Set([
  "level",
  "message",
  "timestamp",
  "context",
  "requestId",
  "ms",
  "stack",
  Symbol.for("level") as unknown as string,
  Symbol.for("message") as unknown as string,
  Symbol.for("splat") as unknown as string,
]);

// Anotación explícita: el tipo inferido (logform.FormatWrap) apunta a
// una dependencia transitiva no hoisteada por pnpm → TS2742 en tsc.
export const redactMeta: ReturnType<typeof format> = format((info) => {
  for (const key of Object.keys(info)) {
    if (OWN_KEYS.has(key)) continue;
    info[key] = SENSITIVE_KEY.test(key) ? MASK : redactValue(info[key]);
  }
  return info;
});

// En dev el formato nestLike no imprime campos extra - el requestId se
// hace visible anexándolo al contexto (`Clase#ab12cd34`).
const decorateContext = format((info) => {
  if (info.requestId) {
    const short = String(info.requestId).slice(0, 8);
    info.context = `${info.context ?? "http"}#${short}`;
  }
  return info;
});

export function buildLogger(): Logger {
  const isProd = process.env.NODE_ENV === "production";
  const base = format.combine(
    format.errors({ stack: true }),
    format.timestamp(),
    injectContext(),
    redactMeta(),
  );
  return createLogger({
    level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
    transports: [
      new transports.Console({
        format: isProd
          ? format.combine(base, format.json())
          : format.combine(
              base,
              format.ms(),
              decorateContext(),
              nestWinstonModuleUtilities.format.nestLike("api", {
                colors: true,
              }),
            ),
      }),
    ],
  });
}

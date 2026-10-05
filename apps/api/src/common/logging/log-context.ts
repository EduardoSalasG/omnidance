import { AsyncLocalStorage } from "node:async_hooks";

export interface LogContext {
  requestId?: string;
}

/**
 * Contexto de correlación por request - cualquier log emitido dentro
 * del handler (servicios, guards, schedulers disparados por request)
 * hereda el requestId sin pasarlo por parámetros.
 */
const storage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getLogContext(): LogContext {
  return storage.getStore() ?? {};
}

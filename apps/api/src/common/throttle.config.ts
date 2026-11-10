import type { ExecutionContext } from "@nestjs/common";

/**
 * Config de rate limiting (@nestjs/throttler) - spec api-hardening.
 *
 * Límites por IP, leídos de env en cada request (resolvers): así los
 * valores también llegan si solo están en .env (ConfigModule los carga
 * tras evaluar los módulos) y se pueden ajustar sin rebuild.
 *
 * - THROTTLE_TTL_MS       ventana deslizante   (default 60000)
 * - THROTTLE_GLOBAL_LIMIT requests/ventana     (default 300 - ~5/s, muy
 *   por encima del uso normal incluido el polling del checkout ~30/min)
 * - THROTTLE_AUTH_LIMIT   requests/ventana en magic-link/login/register
 *   (default 8 - anti spam de correos y fuerza bruta)
 * - THROTTLE_WEBHOOK_LIMIT requests/ventana en webhooks de pago
 *   (default 30 - cada hit puede disparar llamadas salientes firmadas)
 * - THROTTLE_EXPORT_LIMIT requests/ventana en exports csv/pdf
 *   (default 10 - reportes pesados)
 *
 * En NODE_ENV=test el throttling se salta completo (skipIf): los e2e
 * levantan AppModule y disparan cientos de requests + logins - un límite
 * "alto" sigue siendo un límite arbitrario que puede morder en paralelo.
 */
function intEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function throttleTtlMs(): number {
  return intEnv("THROTTLE_TTL_MS", 60_000);
}

export function throttleGlobalLimit(): number {
  return intEnv("THROTTLE_GLOBAL_LIMIT", 300);
}

export function throttleAuthLimit(): number {
  return intEnv("THROTTLE_AUTH_LIMIT", 8);
}

export function throttleWebhookLimit(): number {
  return intEnv("THROTTLE_WEBHOOK_LIMIT", 30);
}

export function throttleExportLimit(): number {
  return intEnv("THROTTLE_EXPORT_LIMIT", 10);
}

/**
 * Objetos @Throttle compartidos (spec api-hardening). Los resolvers se
 * evalúan por request → respetan las env THROTTLE_* en runtime sin
 * rebuild, igual que AUTH_THROTTLE en auth.controller.
 */
export const WEBHOOK_THROTTLE = {
  default: {
    limit: () => throttleWebhookLimit(),
    ttl: () => throttleTtlMs(),
  },
};

export const EXPORT_THROTTLE = {
  default: {
    limit: () => throttleExportLimit(),
    ttl: () => throttleTtlMs(),
  },
};

/**
 * Condición global de skip del throttler:
 * - Contextos no-HTTP (websocket socket.io, rpc): el tracker depende de
 *   `req.ip` de Express; en un mensaje WS no existe y el guard no aplica.
 * - NODE_ENV=test: ver comentario del módulo.
 */
export function throttleSkipIf(context: ExecutionContext): boolean {
  return (
    context.getType() !== "http" || process.env.NODE_ENV === "test"
  );
}

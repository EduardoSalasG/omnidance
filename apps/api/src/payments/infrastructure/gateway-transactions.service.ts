import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../../prisma.service";
import type { Prisma } from "@prisma/client";

/**
 * Entrada de auditoría append-only para cada request/response contra la
 * pasarela (tabla GatewayTransaction — evidencia primaria ante disputas).
 * OUTBOUND = llamada saliente del gateway; INBOUND_WEBHOOK = recepción del
 * webhook de confirmación.
 */
export interface GatewayTxEntry {
  provider: string;
  direction: "OUTBOUND" | "INBOUND_WEBHOOK";
  endpoint: string;
  correlationId: string;
  requestBody?: unknown;
  responseBody?: unknown;
  httpStatus?: number;
  durationMs?: number;
  ok: boolean;
  error?: string;
  paymentId?: string;
}

/**
 * "s" (firma HMAC) → huella sha256 truncada a 16 hex: la firma nunca se
 * persiste (es recomputable con el secret y funciona como credencial),
 * pero la huella permite correlacionar params firmados sin guardarla.
 * El secret nunca llega aquí — no es un param de Flow.
 * Idempotente en valor: un `s` que ya viene "sha256:<16 hex>" se deja
 * tal cual — re-hashearlo produciría sha256("sha256:"+H), un hash del
 * hash no recomputable desde la firma (rompe la correlación).
 */
export function sanitizeGatewayPayload(body: unknown): unknown {
  if (!body || typeof body !== "object") return body ?? null;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    clean[k] =
      k === "s" && typeof v === "string"
        ? /^sha256:[0-9a-f]{16}$/.test(v)
          ? v
          : `sha256:${createHash("sha256").update(v).digest("hex").slice(0, 16)}`
        : v;
  }
  return clean;
}

@Injectable()
export class GatewayTransactionsService {
  private readonly logger = new Logger(GatewayTransactionsService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Best-effort: un fallo de escritura nunca rompe el pago — la auditoría
   * es observador, no parte del camino crítico. Solo log a Logger.
   */
  async record(entry: GatewayTxEntry): Promise<void> {
    try {
      await this.prisma.gatewayTransaction.create({
        data: {
          provider: entry.provider,
          direction: entry.direction,
          endpoint: entry.endpoint,
          correlationId: entry.correlationId,
          requestBody: sanitizeGatewayPayload(
            entry.requestBody,
          ) as Prisma.InputJsonValue,
          responseBody: (entry.responseBody ??
            null) as Prisma.InputJsonValue,
          httpStatus: entry.httpStatus,
          durationMs: entry.durationMs,
          ok: entry.ok,
          error: entry.error,
          paymentId: entry.paymentId,
        },
      });
    } catch (e) {
      this.logger.error(
        `gateway tx log falló: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}

import { randomUUID } from "node:crypto";
import type { PayoutRail } from "../domain/payout-rail";
import {
  sanitizeGatewayPayload,
  type GatewayTxEntry,
} from "./gateway-transactions.service";
import { toMinorUnits } from "./stripe.gateway";

// Stripe Connect (spec payouts/payout-rails, change
// stripe-gateway-payout-rail): el desembolso del payout es un Transfer
// de la cuenta plataforma a la cuenta Connect Express del actor
// (`POST /v1/transfers`, destination = acct_…). Sin SDK - mismo patrón
// del resto de adaptadores: fetch + form-urlencoded + timeout +
// auditoría GatewayTransaction en el finally del wrapper call().
//
// Idempotencia: `Idempotency-Key: payout:<payoutId>` - un reintento del
// admin tras timeout devuelve el mismo tr_… de Stripe, nunca duplica
// la transferencia. metadata[payoutId] queda para reconciliación en el
// dashboard.
//
// `StripeConnectClient` es el wrapper HTTP compartido: el rail lo usa
// para transfers y PayoutDestinationService para el onboarding Express
// (POST /v1/accounts + /v1/account_links) y el refresh-on-read
// (GET /v1/accounts/:id). Credenciales: STRIPE_SECRET_KEY /
// STRIPE_BASE_URL (mismas del adaptador de checkout).

export interface StripeConnectAccount {
  id?: string;
  object?: string;
  country?: string;
  default_currency?: string;
  details_submitted?: boolean;
  charges_enabled?: boolean;
}

export interface StripeAccountLink {
  url?: string;
  expires_at?: number;
}

export interface StripeTransfer {
  id?: string;
  object?: string;
  amount?: number;
  currency?: string;
  destination?: string;
}

/** Wrapper HTTP auditado contra la API de Stripe (lado Connect). */
export class StripeConnectClient {
  constructor(
    private readonly secretKey: string,
    private readonly baseUrl = "https://api.stripe.com",
    private readonly onTx?: (e: GatewayTxEntry) => Promise<void>,
  ) {}

  /** Cuenta Connect Express con capabilities para recibir transfers. */
  createExpressAccount(p: {
    country: string;
    actorType: string;
    actorId: string;
  }): Promise<StripeConnectAccount> {
    return this.call<StripeConnectAccount>(
      "v1/accounts",
      {
        type: "express",
        country: p.country.toUpperCase(),
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        "metadata[actorType]": p.actorType,
        "metadata[actorId]": p.actorId,
      },
      { method: "POST" },
    );
  }

  /** Account Link de onboarding (type account_onboarding, url de 1 uso). */
  createAccountLink(p: {
    account: string;
    refresh_url: string;
    return_url: string;
  }): Promise<StripeAccountLink> {
    return this.call<StripeAccountLink>(
      "v1/account_links",
      {
        account: p.account,
        refresh_url: p.refresh_url,
        return_url: p.return_url,
        type: "account_onboarding",
      },
      { method: "POST" },
    );
  }

  /** Estado de la cuenta Connect (refresh best-effort del destino). */
  getAccount(accountId: string): Promise<StripeConnectAccount> {
    return this.call<StripeConnectAccount>(
      `v1/accounts/${encodeURIComponent(accountId)}`,
      undefined,
      { method: "GET" },
    );
  }

  /**
   * Transfer plataforma → cuenta Connect (desembolso del payout).
   * amount llega en unidad mayor entera y sale en minor units por la
   * tabla zero-decimal compartida con el gateway (CLP 5000 = 5000).
   */
  createTransfer(p: {
    amount: number;
    currency: string;
    destination: string;
    payoutId: string;
  }): Promise<StripeTransfer> {
    const currency = p.currency.toUpperCase();
    return this.call<StripeTransfer>(
      "v1/transfers",
      {
        amount: String(toMinorUnits(currency, p.amount)),
        currency: currency.toLowerCase(),
        destination: p.destination,
        "metadata[payoutId]": p.payoutId,
      },
      { method: "POST", idempotencyKey: `payout:${p.payoutId}` },
    );
  }

  /**
   * Wrapper único de HTTP contra Stripe (mismo patrón que los gateways):
   * bearer auth, form-urlencoded en POST, Idempotency-Key opcional,
   * timeout 15s y SIEMPRE emite GatewayTxEntry en el finally - éxito,
   * error HTTP o falla de red quedan auditados (provider "STRIPE").
   */
  async call<T>(
    endpoint: string,
    params?: Record<string, string>,
    opts: {
      method?: "GET" | "POST";
      idempotencyKey?: string;
      correlationId?: string;
      timeoutMs?: number;
    } = {},
  ): Promise<T> {
    const method = opts.method ?? (params !== undefined ? "POST" : "GET");
    const correlationId = opts.correlationId ?? randomUUID();
    const started = Date.now();
    let httpStatus: number | undefined;
    let responseBody: unknown;
    let ok = false;
    let error: string | undefined;
    try {
      const res = await fetch(`${this.baseUrl}/${endpoint}`, {
        method,
        headers: {
          authorization: `Bearer ${this.secretKey}`,
          ...(params !== undefined
            ? { "content-type": "application/x-www-form-urlencoded" }
            : undefined),
          ...(opts.idempotencyKey
            ? { "idempotency-key": opts.idempotencyKey }
            : undefined),
        },
        body:
          params !== undefined
            ? new URLSearchParams(params).toString()
            : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
      httpStatus = res.status;
      const text = await res.text();
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = text;
      }
      ok = res.ok;
      if (!res.ok) {
        const detail = (
          responseBody as { error?: { message?: string } } | null
        )?.error?.message;
        throw new Error(
          `stripe ${endpoint} HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
        );
      }
      return responseBody as T;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      try {
        await this.onTx?.({
          provider: "STRIPE",
          direction: "OUTBOUND",
          endpoint,
          correlationId,
          requestBody: sanitizeGatewayPayload(params),
          responseBody,
          httpStatus,
          durationMs: Date.now() - started,
          ok,
          error,
        });
      } catch {
        // Auditoría best-effort: un writer que lance nunca rompe el call.
      }
    }
  }
}

/**
 * Rail STRIPE_CONNECT del port PayoutRail: desembolsa el payout como
 * Transfer a la cuenta Connect del actor (destinationRef = acct_…).
 * La resolución destino→rail vive en PayoutDestinationService.
 */
export class StripeConnectPayoutRail implements PayoutRail {
  readonly name = "STRIPE_CONNECT";

  private readonly client: StripeConnectClient;

  constructor(
    secretKey: string,
    baseUrl = "https://api.stripe.com",
    onTx?: (e: GatewayTxEntry) => Promise<void>,
  ) {
    this.client = new StripeConnectClient(secretKey, baseUrl, onTx);
  }

  async disburse(p: {
    payoutId: string;
    amount: number;
    currency: string;
    destinationRef: string;
  }): Promise<{ ref: string }> {
    const transfer = await this.client.createTransfer({
      amount: p.amount,
      currency: p.currency,
      destination: p.destinationRef,
      payoutId: p.payoutId,
    });
    if (!transfer.id) {
      throw new Error("stripe transfer: respuesta sin id");
    }
    return { ref: transfer.id };
  }
}

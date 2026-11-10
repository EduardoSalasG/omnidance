// Cuentas de pasarela propias de un actor (specs
// producer-gateway-accounts + academy-byo-collections): credenciales
// cifradas AES-256-GCM, un adaptador PaymentGateway por cuenta (cache
// por id+updatedAt) y la selección del adaptador en
// checkout/webhook/polling.
//
// Semántica de negocio: la venta de eventos/series de un productor con
// cuenta ACTIVE se cobra en SU Flow/MP - la plata va directo a él y la
// plataforma devenga su comisión (all-in − card%) neteada en el payout
// (feeMode OWN_GATEWAY, líneas OWN_METHOD_*). Una academia con cuenta
// ACTIVE cobra sus órdenes (MEMBERSHIP/WORKSHOP/PRIVATE y las
// renovaciones de sus suscripciones BYO) por su adaptador - la plata
// nunca entra a Omnidance: el take `academy_fee.net_pct` se factura
// mes vencido (AcademyCollectionsStatement), jamás por payout.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ActorGatewayAccount } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { decryptSecret, encryptSecret, maskSecret } from "../../common/secrets";
import type { PaymentGateway } from "../domain/ports";
import { FlowGateway } from "../infrastructure/flow.gateway";
import { MercadoPagoGateway } from "../infrastructure/mercadopago.gateway";
import { FintocGateway } from "../infrastructure/fintoc.gateway";
import { StripeGateway } from "../infrastructure/stripe.gateway";
import { StubGateway } from "../infrastructure/stub.gateway";
import {
  GatewayTransactionsService,
  type GatewayTxEntry,
} from "../infrastructure/gateway-transactions.service";

const SANDBOX_BASE_URL = "https://sandbox.flow.cl/api";
const SUPPORTED = new Set([
  "FLOW",
  "MERCADOPAGO",
  "FINTOC",
  "STUB",
  "STRIPE",
]);

/** Credenciales planas por proveedor (solo existen en memoria). */
interface AccountCredentials {
  apiKey?: string; // FLOW
  secret?: string; // FLOW
  accessToken?: string; // MERCADOPAGO
  secretKey?: string; // FINTOC
  webhookSecret?: string; // FINTOC
  accountId?: string; // STRIPE: acct_… Connect (direct charge)
}

/** Vista segura de la cuenta - nunca material plano ni blob. */
export interface GatewayAccountView {
  id: string;
  provider: string;
  keyMask: string;
  status: string;
  lastError: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  /** URL que el actor configura como urlConfirmation en su panel. */
  webhookUrl: string;
}

function toView(a: ActorGatewayAccount): GatewayAccountView {
  return {
    id: a.id,
    provider: a.provider,
    keyMask: a.keyMask,
    status: a.status,
    lastError: a.lastError,
    verifiedAt: a.verifiedAt,
    createdAt: a.createdAt,
    webhookUrl: webhookUrlFor(a.provider, a.id),
  };
}

/** Dueño de la cuenta: exactamente uno (XOR validado en upsert). */
export type AccountScope =
  | { producerId: string; academyId?: never }
  | { academyId: string; producerId?: never };

function scopeWhere(scope: AccountScope) {
  return scope.producerId
    ? { producerId: scope.producerId }
    : { academyId: scope.academyId };
}

function webhookUrlFor(provider: string, accountId: string): string {
  const apiUrl = process.env.API_URL ?? "http://localhost:4000";
  return `${apiUrl}/api/payments/webhook/${provider}?account=${accountId}`;
}

@Injectable()
export class GatewayAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayTx: GatewayTransactionsService,
  ) {}

  // Adaptadores vivos por cuenta. Cache por id - se invalida cuando la
  // fila cambia (updatedAt nuevo = credenciales rotadas). El StubGateway
  // guarda tokens en memoria, así que checkout y webhook DEBEN caer en
  // la misma instancia - por eso el cache es indispensable, no solo perf.
  private readonly cache = new Map<
    string,
    { updatedAt: Date; gateway: PaymentGateway }
  >();

  /** Cuenta ACTIVE del productor + su adaptador, o null (→ MANAGED). */
  async activeForProducer(
    producerId: string,
  ): Promise<{ account: ActorGatewayAccount; gateway: PaymentGateway } | null> {
    return this.activeFor({ producerId });
  }

  /**
   * Cuenta ACTIVE de la academia + su adaptador, o null (spec
   * academy-byo-collections): null → la academia solo vende por claim
   * manual - el path our-Flow no emite órdenes nuevas de academias.
   */
  async activeForAcademy(
    academyId: string,
  ): Promise<{ account: ActorGatewayAccount; gateway: PaymentGateway } | null> {
    return this.activeFor({ academyId });
  }

  private async activeFor(
    scope: AccountScope,
  ): Promise<{ account: ActorGatewayAccount; gateway: PaymentGateway } | null> {
    const account = await this.prisma.actorGatewayAccount.findFirst({
      where: { ...scopeWhere(scope), status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (!account) return null;
    return { account, gateway: this.buildAdapter(account) };
  }

  /**
   * Adaptador de una cuenta concreta (webhook ?account= / polling por
   * Payment.gatewayAccountId). Cuenta inexistente o DISABLED →
   * NotFound: el proveedor no debería estar notificando a una cuenta
   * apagada (fail-closed, no cae a credenciales de plataforma).
   */
  async adapterFor(
    accountId: string,
  ): Promise<{ account: ActorGatewayAccount; gateway: PaymentGateway }> {
    const account = await this.prisma.actorGatewayAccount.findUnique({
      where: { id: accountId },
    });
    if (!account || account.status !== "ACTIVE") {
      throw new NotFoundException("cuenta de pasarela no disponible");
    }
    return { account, gateway: this.buildAdapter(account) };
  }

  async viewForProducer(
    producerId: string,
  ): Promise<GatewayAccountView | null> {
    return this.viewFor({ producerId });
  }

  async viewForAcademy(
    academyId: string,
  ): Promise<GatewayAccountView | null> {
    return this.viewFor({ academyId });
  }

  private async viewFor(
    scope: AccountScope,
  ): Promise<GatewayAccountView | null> {
    const account = await this.prisma.actorGatewayAccount.findFirst({
      where: scopeWhere(scope),
      orderBy: { createdAt: "desc" },
    });
    return account ? toView(account) : null;
  }

  /**
   * Alta/rotación: valida formato, cifra y crea ACTIVE desactivando la
   * cuenta previa en la misma tx (a lo sumo una ACTIVE por productor).
   * La verificación real es implícita: el primer cobro/webhook exitoso
   * estampa `verifiedAt`; un fallo deja `lastError` visible al
   * productor.
   */
  async upsert(
    scopeOrProducerId: AccountScope | string,
    input: { provider: string; apiKey?: string; secret?: string },
  ): Promise<GatewayAccountView> {
    const scope: AccountScope =
      typeof scopeOrProducerId === "string"
        ? { producerId: scopeOrProducerId }
        : scopeOrProducerId;
    const provider = input.provider.toUpperCase();
    if (!SUPPORTED.has(provider)) {
      throw new BadRequestException(
        `proveedor no soportado: ${input.provider}`,
      );
    }
    if (provider === "STUB" && process.env.NODE_ENV === "production") {
      throw new BadRequestException("STUB no disponible en producción");
    }
    let creds: AccountCredentials;
    let maskSource: string;
    if (provider === "STRIPE") {
      if (!scope.producerId) {
        // STRIPE Connect es rail de desembolso (PayoutDestination) -
        // solo productores; las academias cobran por FLOW/MP/FINTOC.
        throw new BadRequestException(
          "STRIPE no está disponible para academias",
        );
      }
      // STRIPE es distinto (spec connect-own-gateway): no hay credencial
      // que ingresar - el "direct charge" se hace con la secret key de
      // PLATAFORMA + header Stripe-Account con la acct_ del productor.
      // Esa acct_ sale de su PayoutDestination STRIPE_CONNECT ACTIVE
      // (el onboarding Connect es la puerta de entrada: sin destino
      // activo no hay cuenta donde cobrar → 400 guiando a conectar).
      const destination = await this.prisma.payoutDestination.findUnique({
        where: {
          actorType_actorId_rail: {
            actorType: "PRODUCER",
            actorId: scope.producerId,
            rail: "STRIPE_CONNECT",
          },
        },
      });
      if (!destination || destination.status !== "ACTIVE") {
        throw new BadRequestException(
          "conecta tu cuenta de desembolso en /productor/desembolso primero",
        );
      }
      creds = { accountId: destination.externalId };
      maskSource = destination.externalId;
    } else {
      if (!input.apiKey?.trim()) {
        throw new BadRequestException("apiKey requerido");
      }
      const apiKey = input.apiKey.trim();
      creds =
        provider === "MERCADOPAGO"
          ? { accessToken: apiKey }
          : provider === "FLOW"
            ? { apiKey, secret: input.secret?.trim() }
            : provider === "FINTOC"
              ? {
                  secretKey: apiKey,
                  webhookSecret: input.secret?.trim(),
                }
              : {};
      if (provider === "FLOW" && !creds.secret) {
        throw new BadRequestException("secret requerido para FLOW");
      }
      if (provider === "FINTOC" && !creds.webhookSecret) {
        throw new BadRequestException(
          "secret (webhook endpoint secret) requerido para FINTOC",
        );
      }
      maskSource = apiKey;
    }

    const blob = encryptSecret(JSON.stringify(creds));
    const keyMask = maskSecret(maskSource);
    const account = await this.prisma.$transaction(async (tx) => {
      await tx.actorGatewayAccount.updateMany({
        where: { ...scopeWhere(scope), status: "ACTIVE" },
        data: { status: "DISABLED" },
      });
      return tx.actorGatewayAccount.create({
        data: {
          ...scopeWhere(scope),
          provider,
          credentialsEnc: blob,
          keyMask,
        },
      });
    });
    return toView(account);
  }

  /** Apaga la cuenta (sus órdenes futuras vuelven a MANAGED/manual). */
  async disable(id: string, scope: AccountScope | string): Promise<void> {
    await this.prisma.actorGatewayAccount.updateMany({
      where: {
        id,
        ...scopeWhere(
          typeof scope === "string" ? { producerId: scope } : scope,
        ),
      },
      data: { status: "DISABLED" },
    });
  }

  /**
   * Instancia (cacheada) el adaptador de la cuenta con sus credenciales
   * descifradas. El onTx envuelve al writer de auditoría estampando
   * `gatewayAccountId` + `lastError`/`verifiedAt` de la cuenta.
   */
  private buildAdapter(account: ActorGatewayAccount): PaymentGateway {
    const hit = this.cache.get(account.id);
    if (hit && hit.updatedAt.getTime() === account.updatedAt.getTime()) {
      return hit.gateway;
    }
    const creds = JSON.parse(
      decryptSecret(account.credentialsEnc),
    ) as AccountCredentials;
    const onTx = async (e: GatewayTxEntry) => {
      await this.gatewayTx.record({ ...e, gatewayAccountId: account.id });
      // Evidencia operativa visible al productor: último fallo / primer
      // éxito. Best-effort dentro del record (la escritura de la tx ya
      // ocurrió) - no vuelve a intentar ni rompe el camino crítico.
      try {
        if (!e.ok) {
          await this.prisma.actorGatewayAccount.update({
            where: { id: account.id },
            data: { lastError: (e.error ?? "error").slice(0, 500) },
          });
        } else {
          await this.prisma.actorGatewayAccount.updateMany({
            where: { id: account.id, verifiedAt: null },
            data: { verifiedAt: new Date(), lastError: null },
          });
        }
      } catch {
        /* observador - nunca rompe */
      }
    };
    const confirmUrl = webhookUrlFor(account.provider, account.id);
    let gateway: PaymentGateway;
    switch (account.provider) {
      case "FLOW": {
        // Callback de suscripciones por cuenta (spec
        // academy-byo-collections): el urlCallback del plan espejo lleva
        // ?account=<id> para que el webhook resuelva ESTE adaptador -
        // las subs de la academia cobran en su Flow, no en el de
        // plataforma.
        const apiUrl = process.env.API_URL ?? "http://localhost:4000";
        gateway = new FlowGateway(
          creds.apiKey!,
          creds.secret!,
          process.env.FLOW_BASE_URL ?? SANDBOX_BASE_URL,
          confirmUrl,
          onTx,
          `${apiUrl}/api/payments/subscription-webhook?account=${account.id}`,
        );
        break;
      }
      case "MERCADOPAGO":
        gateway = new MercadoPagoGateway(
          creds.accessToken!,
          process.env.MERCADOPAGO_BASE_URL ?? "https://api.mercadopago.com",
          confirmUrl,
          onTx,
        );
        break;
      case "FINTOC":
        gateway = new FintocGateway(
          creds.secretKey!,
          creds.webhookSecret!,
          process.env.FINTOC_BASE_URL ?? "https://api.fintoc.com",
          onTx,
        );
        break;
      case "STRIPE": {
        // Cargo directo en la cuenta Connect del productor: la auth es
        // la secret key de PLATAFORMA y el Stripe-Account es la acct_
        // persistida. Sin secret de plataforma la cuenta no puede
        // operar → fail explícito, nunca cobra en otra cuenta.
        const platformKey = process.env.STRIPE_SECRET_KEY;
        if (!platformKey || !creds.accountId) {
          throw new Error(
            "cuenta STRIPE inoperable: falta STRIPE_SECRET_KEY de plataforma o accountId",
          );
        }
        gateway = new StripeGateway(
          platformKey,
          process.env.STRIPE_WEBHOOK_SECRET ?? "",
          process.env.STRIPE_BASE_URL ?? "https://api.stripe.com",
          onTx,
          creds.accountId,
        );
        break;
      }
      default:
        // STUB (dev): su confirmUrl solo informa al flujo simulado.
        gateway = new StubGateway();
        break;
    }
    this.cache.set(account.id, { updatedAt: account.updatedAt, gateway });
    return gateway;
  }
}

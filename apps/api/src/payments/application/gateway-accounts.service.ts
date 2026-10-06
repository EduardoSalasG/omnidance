// Cuentas de pasarela propias del productor (spec
// producer-gateway-accounts): credenciales cifradas AES-256-GCM, un
// adaptador PaymentGateway por cuenta (cache por id+updatedAt) y la
// selección del adaptador en checkout/webhook/polling.
//
// Semántica de negocio: la venta de eventos/series de un productor con
// cuenta ACTIVE se cobra en SU Flow/MP - la plata va directo a él y la
// plataforma devenga su comisión (all-in − card%) neteada en el payout
// (feeMode OWN_GATEWAY, líneas OWN_METHOD_*). Las suscripciones y las
// órdenes de academia NUNCA pasan por cuentas propias.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ProducerGatewayAccount } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { decryptSecret, encryptSecret, maskSecret } from "../../common/secrets";
import type { PaymentGateway } from "../domain/ports";
import { FlowGateway } from "../infrastructure/flow.gateway";
import { MercadoPagoGateway } from "../infrastructure/mercadopago.gateway";
import { FintocGateway } from "../infrastructure/fintoc.gateway";
import { StubGateway } from "../infrastructure/stub.gateway";
import {
  GatewayTransactionsService,
  type GatewayTxEntry,
} from "../infrastructure/gateway-transactions.service";

const SANDBOX_BASE_URL = "https://sandbox.flow.cl/api";
const SUPPORTED = new Set(["FLOW", "MERCADOPAGO", "FINTOC", "STUB"]);

/** Credenciales planas por proveedor (solo existen en memoria). */
interface AccountCredentials {
  apiKey?: string; // FLOW
  secret?: string; // FLOW
  accessToken?: string; // MERCADOPAGO
  secretKey?: string; // FINTOC
  webhookSecret?: string; // FINTOC
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
  /** URL que el productor configura como urlConfirmation en su panel. */
  webhookUrl: string;
}

function toView(a: ProducerGatewayAccount): GatewayAccountView {
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
  ): Promise<{ account: ProducerGatewayAccount; gateway: PaymentGateway } | null> {
    const account = await this.prisma.producerGatewayAccount.findFirst({
      where: { producerId, status: "ACTIVE" },
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
  ): Promise<{ account: ProducerGatewayAccount; gateway: PaymentGateway }> {
    const account = await this.prisma.producerGatewayAccount.findUnique({
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
    const account = await this.prisma.producerGatewayAccount.findFirst({
      where: { producerId },
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
    producerId: string,
    input: { provider: string; apiKey: string; secret?: string },
  ): Promise<GatewayAccountView> {
    const provider = input.provider.toUpperCase();
    if (!SUPPORTED.has(provider)) {
      throw new BadRequestException(
        `proveedor no soportado: ${input.provider}`,
      );
    }
    if (provider === "STUB" && process.env.NODE_ENV === "production") {
      throw new BadRequestException("STUB no disponible en producción");
    }
    if (!input.apiKey?.trim()) {
      throw new BadRequestException("apiKey requerido");
    }
    const creds: AccountCredentials =
      provider === "MERCADOPAGO"
        ? { accessToken: input.apiKey.trim() }
        : provider === "FLOW"
          ? { apiKey: input.apiKey.trim(), secret: input.secret?.trim() }
          : provider === "FINTOC"
            ? {
                secretKey: input.apiKey.trim(),
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

    const blob = encryptSecret(JSON.stringify(creds));
    const keyMask = maskSecret(input.apiKey.trim());
    const account = await this.prisma.$transaction(async (tx) => {
      await tx.producerGatewayAccount.updateMany({
        where: { producerId, status: "ACTIVE" },
        data: { status: "DISABLED" },
      });
      return tx.producerGatewayAccount.create({
        data: {
          producerId,
          provider,
          credentialsEnc: blob,
          keyMask,
        },
      });
    });
    return toView(account);
  }

  /** Apaga la cuenta (sus órdenes futuras vuelven a MANAGED). */
  async disable(id: string, producerId: string): Promise<void> {
    await this.prisma.producerGatewayAccount.updateMany({
      where: { id, producerId },
      data: { status: "DISABLED" },
    });
  }

  /**
   * Instancia (cacheada) el adaptador de la cuenta con sus credenciales
   * descifradas. El onTx envuelve al writer de auditoría estampando
   * `gatewayAccountId` + `lastError`/`verifiedAt` de la cuenta.
   */
  private buildAdapter(account: ProducerGatewayAccount): PaymentGateway {
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
          await this.prisma.producerGatewayAccount.update({
            where: { id: account.id },
            data: { lastError: (e.error ?? "error").slice(0, 500) },
          });
        } else {
          await this.prisma.producerGatewayAccount.updateMany({
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
      case "FLOW":
        gateway = new FlowGateway(
          creds.apiKey!,
          creds.secret!,
          process.env.FLOW_BASE_URL ?? SANDBOX_BASE_URL,
          confirmUrl,
          onTx,
        );
        break;
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
      default:
        // STUB (dev): su confirmUrl solo informa al flujo simulado.
        gateway = new StubGateway();
        break;
    }
    this.cache.set(account.id, { updatedAt: account.updatedAt, gateway });
    return gateway;
  }
}

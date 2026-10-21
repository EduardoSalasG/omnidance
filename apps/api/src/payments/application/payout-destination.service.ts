import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { PayoutDestination, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { GatewayTransactionsService } from "../infrastructure/gateway-transactions.service";
import { ManualPayoutRail } from "../infrastructure/manual-payout.rail";
import {
  StripeConnectClient,
  StripeConnectPayoutRail,
  type StripeConnectAccount,
} from "../infrastructure/stripe-connect.rail";

// Destino de liquidación Connect del actor + resolución actor→rail de
// desembolso (spec payouts/payout-rails, change
// stripe-gateway-payout-rail):
//
// - resolveRail: PayoutDestination ACTIVE del actor cuya currency calza
//   con la del payout → StripeConnectPayoutRail + el destino (externalId
//   = acct_… = destinationRef). Sin match → ManualPayoutRail + reason
//   diagnóstico para ops. STRIPE_CONNECT solo está disponible con
//   STRIPE_SECRET_KEY configurada.
// - listFor: destinos del actor autenticado (misma regla de ownership
//   que GET /me/payouts: PRODUCER = personId, ACADEMY/VENUE = ownerId) +
//   refresh best-effort contra Stripe de los PENDING
//   (details_submitted && charges_enabled → ACTIVE + onboardedAt +
//   default_currency reportada). Un fallo de fetch solo deja lastError
//   en el destino - nunca rompe el listado.
// - create: valida ownership y crea la cuenta Connect Express
//   (capabilities card_payments + transfers) + Account Link de
//   onboarding apuntando a /productor/pagos. Un destino PENDING previo
//   reutiliza su externalId (no crea segunda cuenta); ACTIVE → 409;
//   DISABLED se reactiva con cuenta nueva sobre la misma fila (la
//   restricción @@unique(actorType,actorId,rail) no permite otra).
//   Sin STRIPE_SECRET_KEY → 503.
const CONNECT_RAIL = "STRIPE_CONNECT";

export interface ConnectRailResolution {
  readonly kind: "STRIPE_CONNECT";
  readonly rail: StripeConnectPayoutRail;
  readonly destination: PayoutDestination;
}

export interface ManualRailResolution {
  readonly kind: "MANUAL";
  readonly rail: ManualPayoutRail;
  /** Diagnóstico para ops (NO_DESTINATION | CURRENCY_MISMATCH:* |
   *  UNSUPPORTED_RAIL:* | STRIPE_NOT_CONFIGURED). */
  readonly reason: string;
}

export type PayoutRailResolution =
  | ConnectRailResolution
  | ManualRailResolution;

@Injectable()
export class PayoutDestinationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: GatewayTransactionsService,
  ) {}

  /**
   * Resuelve el rail de desembolso del actor para un payout en
   * `currency`. El destino ACTIVE con moneda distinta NO desembolsa -
   * un payout CLP nunca sale por una cuenta USD (mismatch queda
   * notado en reason).
   */
  async resolveRail(
    actorType: string,
    actorId: string,
    currency: string,
  ): Promise<PayoutRailResolution> {
    const manual = (reason: string): ManualRailResolution => ({
      kind: "MANUAL",
      rail: new ManualPayoutRail(),
      reason,
    });
    const actives = await this.prisma.payoutDestination.findMany({
      where: { actorType, actorId, status: "ACTIVE" },
    });
    if (!actives.length) return manual("NO_DESTINATION");
    const destination = actives.find(
      (d) => d.currency.toUpperCase() === currency.toUpperCase(),
    );
    if (!destination) {
      return manual(
        `CURRENCY_MISMATCH:${actives.map((d) => d.currency).join(",")}`,
      );
    }
    if (destination.rail !== CONNECT_RAIL) {
      return manual(`UNSUPPORTED_RAIL:${destination.rail}`);
    }
    const cfg = this.connectConfig();
    if (!cfg) return manual("STRIPE_NOT_CONFIGURED");
    return {
      kind: "STRIPE_CONNECT",
      rail: new StripeConnectPayoutRail(cfg.secretKey, cfg.baseUrl, (e) =>
        this.tx.record(e),
      ),
      destination,
    };
  }

  /**
   * Destinos visibles del actor autenticado + refresh best-effort de
   * los PENDING contra Stripe (flip a ACTIVE cuando la cuenta quedó
   * operable). Sin credenciales Stripe devuelve el listado tal cual.
   */
  async listFor(personId: string): Promise<PayoutDestination[]> {
    const or = await this.actorScope(personId);
    const destinations = await this.prisma.payoutDestination.findMany({
      where: { OR: or },
      orderBy: { createdAt: "desc" },
    });
    const client = this.connectClient();
    if (!client) return destinations;
    await Promise.all(
      destinations
        .filter((d) => d.rail === CONNECT_RAIL && d.status === "PENDING")
        .map((d) => this.refreshFromStripe(d, client)),
    );
    return destinations;
  }

  /**
   * Alta del destino Connect del actor: cuenta Express + Account Link.
   * Devuelve el destino PENDING persistido y la onboardingUrl de un
   * solo uso (Stripe la expira - el front la consume al tiro).
   */
  async create(
    personId: string,
    dto: { actorType: string; actorId: string; country: string },
  ): Promise<{ destination: PayoutDestination; onboardingUrl: string }> {
    const client = this.connectClient();
    if (!client) {
      throw new ServiceUnavailableException(
        "Stripe Connect no configurado (STRIPE_SECRET_KEY ausente)",
      );
    }
    await this.assertOwnership(personId, dto.actorType, dto.actorId);
    let country = dto.country.toUpperCase();

    const existing = await this.prisma.payoutDestination.findUnique({
      where: {
        actorType_actorId_rail: {
          actorType: dto.actorType,
          actorId: dto.actorId,
          rail: CONNECT_RAIL,
        },
      },
    });
    if (existing?.status === "ACTIVE") {
      throw new ConflictException(
        "el actor ya tiene un destino de desembolso activo",
      );
    }

    let externalId: string;
    let currency: string;
    if (existing?.status === "PENDING") {
      // Reintento de onboarding: la cuenta Express ya existe con su
      // país - solo se emite un Account Link nuevo (nunca una segunda
      // acct_ ni un país distinto al de la cuenta remota).
      externalId = existing.externalId;
      currency = existing.currency;
      country = existing.country;
    } else {
      const account = await client.createExpressAccount({
        country,
        actorType: dto.actorType,
        actorId: dto.actorId,
      });
      if (!account.id) {
        throw new Error("stripe accounts: respuesta sin id");
      }
      externalId = account.id;
      currency = account.default_currency?.toUpperCase() ?? "USD";
    }

    // Persistir ANTES del Account Link: si el link falla, el row
    // PENDING ya apunta a la acct_ y el próximo intento la reutiliza
    // (sin cuentas huérfanas).
    const destination = existing
      ? await this.prisma.payoutDestination.update({
          where: { id: existing.id },
          data: {
            externalId,
            country,
            currency,
            status: "PENDING",
            onboardedAt: null,
            lastError: null,
          },
        })
      : await this.prisma.payoutDestination.create({
          data: {
            actorType: dto.actorType,
            actorId: dto.actorId,
            rail: CONNECT_RAIL,
            externalId,
            country,
            currency,
            status: "PENDING",
          },
        });

    // El onboarding aterriza en la consola de pagos del productor
    // (apps/web /productor/pagos) - refresh y return comparten URL.
    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const link = await client.createAccountLink({
      account: externalId,
      refresh_url: `${webUrl}/productor/pagos`,
      return_url: `${webUrl}/productor/pagos`,
    });
    if (!link.url) {
      throw new Error("stripe account_links: respuesta sin url");
    }

    return { destination, onboardingUrl: link.url };
  }

  // ── privados ───────────────────────────────────────────────────────

  /** Credenciales Stripe por env (misma fuente que resolveGateways). */
  private connectConfig(): { secretKey: string; baseUrl: string } | null {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return null;
    return {
      secretKey,
      baseUrl: process.env.STRIPE_BASE_URL ?? "https://api.stripe.com",
    };
  }

  private connectClient(): StripeConnectClient | null {
    const cfg = this.connectConfig();
    if (!cfg) return null;
    return new StripeConnectClient(cfg.secretKey, cfg.baseUrl, (e) =>
      this.tx.record(e),
    );
  }

  /**
   * Mismo scope de ownership que MePayoutsController: el productor ES la
   * persona (PRODUCER = personId) + academias y venues que posee.
   */
  private async actorScope(
    personId: string,
  ): Promise<Prisma.PayoutDestinationWhereInput[]> {
    const [academies, venues] = await Promise.all([
      this.prisma.academy.findMany({
        where: { ownerId: personId },
        select: { id: true },
      }),
      this.prisma.venue.findMany({
        where: { ownerId: personId },
        select: { id: true },
      }),
    ]);
    const or: Prisma.PayoutDestinationWhereInput[] = [
      { actorType: "PRODUCER", actorId: personId },
    ];
    if (academies.length) {
      or.push({
        actorType: "ACADEMY",
        actorId: { in: academies.map((a) => a.id) },
      });
    }
    if (venues.length) {
      or.push({
        actorType: "VENUE",
        actorId: { in: venues.map((v) => v.id) },
      });
    }
    return or;
  }

  /**
   * Ownership del actor destino (spec: actor ajeno → 403/404 sin crear
   * cuenta ni destino): PRODUCER = el propio personId; ACADEMY/VENUE
   * deben existir y tener ownerId = personId.
   */
  private async assertOwnership(
    personId: string,
    actorType: string,
    actorId: string,
  ): Promise<void> {
    if (actorType === "PRODUCER") {
      if (actorId !== personId) {
        throw new ForbiddenException("solo puedes crear tu propio destino");
      }
      return;
    }
    if (actorType === "ACADEMY" || actorType === "VENUE") {
      const ownerId =
        actorType === "ACADEMY"
          ? (
              await this.prisma.academy.findUnique({
                where: { id: actorId },
                select: { ownerId: true },
              })
            )?.ownerId
          : (
              await this.prisma.venue.findUnique({
                where: { id: actorId },
                select: { ownerId: true },
              })
            )?.ownerId;
      if (ownerId === undefined) {
        throw new NotFoundException(
          actorType === "ACADEMY"
            ? "academia no encontrada"
            : "venue no encontrado",
        );
      }
      if (ownerId !== personId) {
        throw new ForbiddenException(
          `el ${actorType === "ACADEMY" ? "academia" : "venue"} no te pertenece`,
        );
      }
      return;
    }
    throw new BadRequestException(`actorType inválido: ${actorType}`);
  }

  /**
   * Refresh-on-read del destino: details_submitted && charges_enabled →
   * ACTIVE + onboardedAt + moneda reportada por la cuenta. Fallo de
   * fetch → lastError en el row (nunca rompe el listado).
   */
  private async refreshFromStripe(
    destination: PayoutDestination,
    client: StripeConnectClient,
  ): Promise<void> {
    let account: StripeConnectAccount;
    try {
      account = await client.getAccount(destination.externalId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      try {
        await this.prisma.payoutDestination.update({
          where: { id: destination.id },
          data: { lastError: message.slice(0, 500) },
        });
        destination.lastError = message.slice(0, 500);
      } catch {
        // best-effort: ni el error del proveedor rompe la lectura.
      }
      return;
    }
    if (!account.details_submitted || !account.charges_enabled) {
      // El fetch funcionó: un lastError viejo de un fallo previo no
      // corresponde más - se limpia aunque la cuenta siga sin operar.
      if (destination.lastError) {
        try {
          await this.prisma.payoutDestination.update({
            where: { id: destination.id },
            data: { lastError: null },
          });
          destination.lastError = null;
        } catch {
          // best-effort
        }
      }
      return;
    }
    const updated = await this.prisma.payoutDestination.update({
      where: { id: destination.id },
      data: {
        status: "ACTIVE",
        onboardedAt: new Date(),
        currency: account.default_currency?.toUpperCase() ?? destination.currency,
        lastError: null,
      },
    });
    Object.assign(destination, updated);
  }
}

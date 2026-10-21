import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma, SocialPass } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { ParamsService } from "../../params/params.service";
import { FeatureFlagsService } from "../../features/feature-flags.service";
import {
  type BillingWebhookEvent,
  type SubscriptionProvider,
} from "../domain/ports";
import {
  GatewayRegistry,
  PAYMENT_GATEWAYS,
} from "../domain/gateway-registry";

// Pase Social (spec pase-social): suscripción del bailarín sobre Stripe
// Billing - créditos de entrada por período (reset duro), siempre precio
// preventa y sin cargo de puerta en el checkout de tickets.
//
// DECISIÓN DE DISEÑO - resolución del provider: el pase se cobra
// EXPLÍCITAMENTE con el adaptador STRIPE del GatewayRegistry (get por
// name), no por el param `payments.subscription_gateway`: ese param
// sigue gobernando las suscripciones de academia/productor (motor Flow)
// y tocarlo rompería el billing chileno. Sin STRIPE_SECRET_KEY el
// adaptador no se registra → los endpoints del pase responden 503.
const PASS_TIER = "SOCIAL_PASS";
const DEFAULT_CREDITS = 4;
const DEFAULT_PRICE_CLP = 15_000;
const FLAG = "social_pass";

/** Stripe no corre el checkout del pase (sin credenciales). */
export class SocialPassUnavailableError extends Error {
  constructor() {
    super("el Pase Social no está disponible por el momento");
    this.name = "SocialPassUnavailableError";
  }
}

/** Conflictos de negocio del pase (409): ya suscrito, sin saldo, regalos. */
export class SocialPassConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialPassConflictError";
  }
}

/**
 * ¿El pase otorga beneficios ahora? CANCEL_PENDING también tiene acceso:
 * la cancelación es al fin del período ya pagado (cancel_at_period_end).
 */
export function isPassActive(
  pass: Pick<SocialPass, "status"> | null | undefined,
): boolean {
  return pass?.status === "ACTIVE" || pass?.status === "CANCEL_PENDING";
}

/**
 * REDEEM atómico dentro de la tx del checkout (spec pase-social, escenario
 * "Redención atómica"): decremento condicional por saldo + línea de
 * ledger - si el balance no alcanza la tx entera revierte y nada muta.
 * Nunca llamar fuera de la $transaction que crea la orden.
 */
export async function redeemPassCredits(
  tx: Prisma.TransactionClient,
  pass: { id: string; personId: string },
  quantity: number,
  paymentId: string,
): Promise<void> {
  const dec = await tx.socialPass.updateMany({
    where: { id: pass.id, creditsBalance: { gte: quantity } },
    data: { creditsBalance: { decrement: quantity } },
  });
  if (dec.count === 0) {
    throw new SocialPassConflictError(
      "no te quedan suficientes créditos del Pase Social",
    );
  }
  await tx.socialPassLedger.create({
    data: {
      passId: pass.id,
      personId: pass.personId,
      delta: -quantity,
      reason: "REDEEM",
      paymentId,
    },
  });
}

@Injectable()
export class SocialPassService {
  private readonly logger = new Logger(SocialPassService.name);
  private readonly webUrl = process.env.WEB_URL ?? "http://localhost:3000";

  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
    private readonly flags: FeatureFlagsService,
    @Inject(PAYMENT_GATEWAYS)
    private readonly gateways: GatewayRegistry,
  ) {}

  /**
   * Motor de billing del pase: SIEMPRE Stripe (ver nota de diseño al
   * tope) - resuelto por name contra el registry + capability por
   * presencia de createSubscription. Sin credenciales → 503 amable.
   */
  private provider(): SubscriptionProvider {
    const gw = this.gateways.get("STRIPE");
    if (
      !gw ||
      typeof (gw as Partial<SubscriptionProvider>).createSubscription !==
        "function"
    ) {
      throw new SocialPassUnavailableError();
    }
    return gw as unknown as SubscriptionProvider;
  }

  /**
   * Precio del pase por jurisdicción del bailarín (spec pase-social):
   * TierPrice SOCIAL_PASS × countryCode (= Person.jurisdiction), fallback
   * a la fila CL y como último recurso el param `social_pass.price_clp`.
   */
  private async priceFor(jurisdiction?: string | null) {
    const cc = (jurisdiction ?? "CL").toUpperCase();
    // La unique key de TierPrice lleva kind+billingCycle (schema:
    // SOCIAL_PASS se siembra PRODUCER/MONTHLY como placeholder) -
    // filtrar explícito para no tomar una fila de otro ciclo si el
    // admin agrega una segunda.
    const tierWhere = {
      tierCode: PASS_TIER,
      kind: "PRODUCER" as const,
      billingCycle: "MONTHLY" as const,
    };
    const row =
      (await this.prisma.tierPrice.findFirst({
        where: { ...tierWhere, countryCode: cc },
      })) ??
      (cc !== "CL"
        ? await this.prisma.tierPrice.findFirst({
            where: { ...tierWhere, countryCode: "CL" },
          })
        : null);
    if (row) return { amount: row.price, currency: row.currency };
    return {
      amount: await this.params.getNumber(
        "social_pass.price_clp",
        DEFAULT_PRICE_CLP,
      ),
      currency: "CLP",
    };
  }

  /**
   * GET /me/social-pass - estado público del pase del autenticado +
   * `price` resuelto por jurisdicción para el pitch pre-suscripción.
   */
  async getMine(personId: string) {
    if (!(await this.flags.isEnabled(FLAG))) {
      throw new NotFoundException("no encontrado");
    }
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { jurisdiction: true },
    });
    const [pass, price, creditsPerPeriod] = await Promise.all([
      this.prisma.socialPass.findUnique({ where: { personId } }),
      this.priceFor(person?.jurisdiction),
      this.params.getNumber("social_pass.credits_per_month", DEFAULT_CREDITS),
    ]);
    return {
      status: pass?.status ?? null,
      amount: pass?.amount ?? null,
      currency: pass?.currency ?? null,
      creditsBalance: pass?.creditsBalance ?? 0,
      creditsPerPeriod: pass?.creditsPerPeriod ?? creditsPerPeriod,
      currentPeriodEnd: pass?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: pass?.cancelAtPeriodEnd ?? false,
      price,
    };
  }

  /**
   * POST /me/social-pass/subscribe - crea el customer Stripe (lazy, con
   * rescate por email si la fila se perdió), materializa el Product+Price
   * espejo (ensurePlan) y devuelve la URL de la Checkout Session
   * mode=subscription (el registro de tarjeta Y el primer cobro ocurren
   * ahí). Persiste/actualiza la fila SocialPass en PENDING con
   * `stripeSubId` placeholder `pending:<personId>` hasta que el webhook
   * `invoice.paid` o el confirm por polling traigan el id real.
   */
  async subscribe(personId: string): Promise<{ registerUrl: string }> {
    if (!(await this.flags.isEnabled(FLAG))) {
      throw new NotFoundException("no encontrado");
    }
    const provider = this.provider();
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { email: true, name: true, jurisdiction: true },
    });
    if (!person?.email) {
      throw new BadRequestException(
        "tu cuenta necesita un email para suscribir el pase",
      );
    }
    const existing = await this.prisma.socialPass.findUnique({
      where: { personId },
    });
    if (existing && isPassActive(existing)) {
      throw new SocialPassConflictError("ya tienes el Pase Social activo");
    }
    const [price, credits] = await Promise.all([
      this.priceFor(person.jurisdiction),
      this.params.getNumber("social_pass.credits_per_month", DEFAULT_CREDITS),
    ]);
    const correlationId = randomUUID();

    // Customer Stripe: reutiliza el persistido o el remoto por email
    // (la fila pudo perderse) antes de crear uno nuevo.
    let customerId = existing?.stripeCustomerId;
    if (!customerId) {
      customerId =
        (await provider.findCustomerByEmail?.(person.email, { correlationId }))
          ?.customerId ??
        (
          await provider.createCustomer(
            {
              email: person.email,
              name: person.name ?? person.email,
              externalId: personId,
            },
            { correlationId },
          )
        ).customerId;
    }

    await provider.ensurePlan(
      {
        planId: PASS_TIER,
        name: "Omnidance Pase Social",
        amount: price.amount,
        intervalCount: 1,
        currency: price.currency,
      },
      { correlationId },
    );

    // Re-suscripción tras FAILED_CARD: la sub remota puede seguir viva
    // (Stripe Smart Retries la reintenta) y una sesión nueva crearía
    // una SEGUNDA suscripción con doble cobro. Se cancelan todas las
    // subs no-canceled del customer como compensación de huérfanas
    // (uso legítimo de `immediate` del port) antes de la sesión nueva.
    const remoteSubs =
      (await provider.listCustomerSubscriptions?.(customerId, {
        correlationId,
      })) ?? [];
    for (const sub of remoteSubs) {
      if (sub.status !== "CANCELED") {
        await provider.cancelSubscription(sub.subscriptionId, {
          immediate: true,
          correlationId,
        });
      }
    }

    // Upsert por personId (único): re-suscripción tras CANCELED /
    // FAILED_CARD reutiliza la fila y conserva su historial de ledger.
    // stripeSubId se resetea a pending: los eventos rezagados del sub
    // viejo (deleted/payment_failed tardío) no deben resolver contra
    // este pass nuevo - findPass los ignora sin match.
    const pass = await this.prisma.socialPass.upsert({
      where: { personId },
      update: {
        stripeCustomerId: customerId,
        stripeSubId: `pending:${personId}`,
        status: "PENDING",
        amount: price.amount,
        currency: price.currency,
        creditsPerPeriod: credits,
        cancelAtPeriodEnd: false,
      },
      create: {
        personId,
        stripeCustomerId: customerId,
        stripeSubId: `pending:${personId}`,
        status: "PENDING",
        amount: price.amount,
        currency: price.currency,
        creditsPerPeriod: credits,
      },
    });
    void pass;

    const { registerUrl } = await provider.registerCustomerCard(
      {
        customerId,
        // Vuelta al pitch del pase; el front confirma por polling
        // (mismo patrón que la orden del checkout) - en dev el webhook
        // no llega a localhost.
        returnUrl: `${this.webUrl}/pase?sub=return&session_id={CHECKOUT_SESSION_ID}`,
        planId: PASS_TIER,
        currency: price.currency,
        metadata: { personId, socialPass: "1" },
      },
      { correlationId },
    );
    return { registerUrl };
  }

  /**
   * POST /me/social-pass/cancel - cancel_at_period_end (el acceso vive
   * hasta el fin del período pagado). Idempotente: un pase ya
   * CANCEL_PENDING responde su estado sin volver a llamar al proveedor.
   */
  async cancel(personId: string) {
    if (!(await this.flags.isEnabled(FLAG))) {
      throw new NotFoundException("no encontrado");
    }
    const pass = await this.prisma.socialPass.findUnique({
      where: { personId },
    });
    if (!pass) throw new NotFoundException("no tienes Pase Social");
    if (pass.status === "CANCELED" || pass.status === "PENDING") {
      throw new BadRequestException("el pase no está activo");
    }
    if (pass.cancelAtPeriodEnd || pass.status === "CANCEL_PENDING") {
      return { status: pass.status, cancelAtPeriodEnd: true };
    }
    await this.provider().cancelSubscription(pass.stripeSubId, {
      correlationId: randomUUID(),
    });
    await this.prisma.socialPass.update({
      where: { id: pass.id },
      data: { status: "CANCEL_PENDING", cancelAtPeriodEnd: true },
    });
    await this.audit(pass.personId, "SOCIAL_PASS_CANCEL_REQUESTED", pass.id, {
      stripeSubId: pass.stripeSubId,
    });
    return { status: "CANCEL_PENDING", cancelAtPeriodEnd: true };
  }

  /**
   * POST /me/social-pass/confirm - confirmación al volver de Checkout
   * (spec pase-social): cubre dev sin webhook. Con `sessionId` resuelve
   * por getRegisterStatus (la sesión trae la sub expandida); sin él,
   * lista las subs del customer. Idempotente - un pass ya ACTIVE solo
   * re-devuelve su estado.
   */
  async confirm(personId: string, sessionId?: string) {
    if (!(await this.flags.isEnabled(FLAG))) {
      throw new NotFoundException("no encontrado");
    }
    const pass = await this.prisma.socialPass.findUnique({
      where: { personId },
    });
    if (!pass) throw new NotFoundException("no tienes Pase Social");
    if (isPassActive(pass)) {
      return { activated: true, pass: await this.getMine(personId) };
    }
    const provider = this.provider();
    const correlationId = randomUUID();
    let subId: string | undefined;
    if (sessionId) {
      const reg = await provider.getRegisterStatus(sessionId, {
        correlationId,
      });
      if (reg.registered && reg.customerId === pass.stripeCustomerId) {
        subId = reg.subscriptionId;
      }
    }
    if (!subId && provider.listCustomerSubscriptions) {
      const subs = await provider.listCustomerSubscriptions(
        pass.stripeCustomerId,
        { correlationId },
      );
      subId = subs[0]?.subscriptionId;
    }
    if (!subId) {
      return { activated: false, pass: await this.getMine(personId) };
    }
    const remote = await provider.getSubscription(subId, { correlationId });
    if (remote.status === "ACTIVE") {
      await this.activate(pass, remote, "polling");
    } else if (remote.status === "CANCELED") {
      await this.markCanceled(pass, "polling");
    }
    return {
      activated: remote.status === "ACTIVE",
      pass: await this.getMine(personId),
    };
  }

  /**
   * Routing de eventos de billing firmados (spec pase-social, task 4).
   * NO se gatea por flag: el flag apaga superficies, no la liquidación
   * de dinero - un pago ya cobrado debe reflejarse aunque el flag se
   * apague a medio ciclo. Evento sin pass que calce → no-op.
   */
  async handleBillingEvent(ev: BillingWebhookEvent): Promise<void> {
    const pass = await this.findPass(ev);
    if (!pass) return;
    const provider = this.provider();

    if (ev.type === "invoice.paid") {
      // Período pagado → ACTIVE + reset duro de créditos. El periodEnd
      // autoritativo es el de la sub remota; si falta se consulta.
      let periodEnd = ev.invoice?.periodEnd;
      if (!periodEnd && ev.subscriptionId) {
        try {
          periodEnd = (
            await provider.getSubscription(ev.subscriptionId, {
              correlationId: randomUUID(),
            })
          ).nextInvoiceDate;
        } catch (e) {
          this.logger.warn(
            `invoice.paid ${ev.invoice?.id}: sin periodEnd y la sub no responde: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
      await this.activate(
        pass,
        {
          subscriptionId: ev.subscriptionId ?? pass.stripeSubId,
          nextInvoiceDate: periodEnd,
          cancelAtPeriodEnd: pass.cancelAtPeriodEnd,
        },
        "webhook",
        ev.invoice?.id,
      );
      return;
    }

    if (ev.type === "invoice.payment_failed") {
      // CANCELED gana: un payment_failed posterior al delete es ruido.
      if (pass.status !== "CANCELED" && pass.status !== "FAILED_CARD") {
        await this.prisma.socialPass.update({
          where: { id: pass.id },
          data: { status: "FAILED_CARD" },
        });
        await this.audit(
          pass.personId,
          "SOCIAL_PASS_FAILED_CARD",
          pass.id,
          { invoiceId: ev.invoice?.id, stripeSubId: ev.subscriptionId },
        );
      }
      return;
    }

    if (ev.type === "customer.subscription.deleted") {
      await this.markCanceled(pass, "webhook");
      return;
    }

    // checkout.session.expired (mode=subscription): la sesión expiró
    // sin cobrar - el pass PENDING no se puede cancelar ni reactivar,
    // así que se limpia para que el usuario pueda suscribir de nuevo.
    if (ev.type === "checkout.session.expired" && pass.status === "PENDING") {
      await this.prisma.socialPass.delete({ where: { id: pass.id } });
      await this.audit(pass.personId, "SOCIAL_PASS_EXPIRED", pass.id, {
        stripeSubId: ev.subscriptionId,
      });
      return;
    }

    // checkout.session.* mode=subscription: la sesión ya cobró - activa
    // si el pass sigue PENDING (redundante con invoice.paid, idempotente).
    if (
      ev.type === "checkout.session.completed" &&
      pass.status === "PENDING" &&
      ev.subscriptionId
    ) {
      try {
        const remote = await provider.getSubscription(ev.subscriptionId, {
          correlationId: randomUUID(),
        });
        if (remote.status === "ACTIVE") {
          await this.activate(pass, remote, "webhook");
        }
      } catch (e) {
        this.logger.warn(
          `checkout.session.completed sin sub resoluble: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  /** Lookup del pass por sub → customer → personId (metadata). */
  private async findPass(ev: BillingWebhookEvent) {
    if (ev.subscriptionId) {
      const bySub = await this.prisma.socialPass.findUnique({
        where: { stripeSubId: ev.subscriptionId },
      });
      if (bySub) return bySub;
    }
    if (ev.customerId) {
      const byCustomer = await this.prisma.socialPass.findFirst({
        where: { stripeCustomerId: ev.customerId },
      });
      if (byCustomer) return byCustomer;
    }
    if (ev.personId) {
      return this.prisma.socialPass.findUnique({
        where: { personId: ev.personId },
      });
    }
    return null;
  }

  /**
   * Activa/renueva el pass + RESET duro de créditos con línea de ledger
   * en la misma tx (spec pase-social: `creditsBalance = creditsPerPeriod`,
   * el remanente no acumula). Dedup por período: un invoice.paid repetido
   * (reintento de Stripe) con el mismo currentPeriodEnd no duplica RESET.
   */
  private async activate(
    pass: SocialPass,
    remote: {
      subscriptionId: string;
      nextInvoiceDate?: string;
      cancelAtPeriodEnd?: boolean;
    },
    actor: string,
    invoiceId?: string,
  ): Promise<void> {
    const periodEnd = remote.nextInvoiceDate
      ? new Date(remote.nextInvoiceDate)
      : null;
    const samePeriod =
      pass.currentPeriodEnd != null &&
      periodEnd != null &&
      pass.currentPeriodEnd.getTime() === periodEnd.getTime();
    await this.prisma.$transaction(async (tx) => {
      // Dedup anclado en invoiceId persistido en el ledger (estable
      // entre reintentos de Stripe, a diferencia de periodEnd que
      // puede faltar); samePeriod cubre eventos sin invoice. Un
      // reintento NO re-muta el balance - la línea es la única
      // evidencia del allotment y sin ella el refill sería crédito
      // gratis e irrazonable ante auditoría.
      const dup =
        (invoiceId != null &&
          (await tx.socialPassLedger.findFirst({
            where: {
              passId: pass.id,
              reason: "RESET",
              paymentId: invoiceId,
            },
          }))) ||
        samePeriod;
      await tx.socialPass.update({
        where: { id: pass.id },
        data: {
          stripeSubId: remote.subscriptionId,
          status: "ACTIVE",
          // Reset duro solo en período nuevo: el allotment del período
          // reemplaza el remanente; en reintento el balance no se toca.
          ...(dup
            ? {}
            : {
                creditsBalance: pass.creditsPerPeriod,
                lastCreditResetAt: new Date(),
              }),
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: remote.cancelAtPeriodEnd ?? false,
        },
      });
      if (!dup) {
        await tx.socialPassLedger.create({
          data: {
            passId: pass.id,
            personId: pass.personId,
            delta: pass.creditsPerPeriod,
            reason: "RESET",
            paymentId: invoiceId ?? null,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: pass.personId,
          action: pass.status === "PENDING" ? "SOCIAL_PASS_ACTIVATED" : "SOCIAL_PASS_RENEWED",
          targetType: "SocialPass",
          targetId: pass.id,
          payload: {
            stripeSubId: remote.subscriptionId,
            invoiceId,
            actor,
            periodEnd,
          },
        },
      });
    });
  }

  private async markCanceled(pass: SocialPass, actor: string) {
    if (pass.status === "CANCELED") return;
    await this.prisma.socialPass.update({
      where: { id: pass.id },
      data: { status: "CANCELED", cancelAtPeriodEnd: false },
    });
    await this.audit(pass.personId, "SOCIAL_PASS_CANCELED", pass.id, {
      stripeSubId: pass.stripeSubId,
      actor,
    });
  }

  private audit(
    personId: string,
    action: string,
    targetId: string,
    payload: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: personId,
        action,
        targetType: "SocialPass",
        targetId,
        payload,
      },
    });
  }
}

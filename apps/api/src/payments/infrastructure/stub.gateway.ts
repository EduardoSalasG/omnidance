import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  PaymentGateway,
  RemoteSubscription,
  SubscriptionCallOpts,
  SubscriptionInvoice,
  SubscriptionProvider,
} from "../domain/ports";

type StubPlan = { planId: string; name: string; amount: number; intervalCount: number };
type StubCustomer = {
  customerId: string;
  email: string;
  name: string;
  externalId: string;
  hasCard: boolean;
};
type StubSub = {
  subscriptionId: string;
  planId: string;
  customerId: string;
  canceled: boolean;
  nextInvoiceDate?: string;
  cancelAtPeriodEnd: boolean;
  invoices: SubscriptionInvoice[];
};

// Gateway de desarrollo: no sale a ninguna red; el webhook acepta
// { refId, status: "PAID" | "FAILED" } tal cual para simular la pasarela.
//
// Además implementa SubscriptionProvider con estado EN MEMORIA (se pierde
// al reiniciar el proceso): planes espejo, customers, registro de tarjeta
// y suscripciones con su invoice inicial ya pagada - el flujo completo
// (needs_card → customer-return → ACTIVE → settle → cancel) se ejerce en
// localhost sin credenciales Flow. El registerUrl apunta al returnUrl que
// le pasa el caller (el callback real customer-return del API), así que el
// browser nunca sale de localhost.
//
// Tras un restart, getSubscription de un id desconocido reporta CANCELED
// para que la fila local converja a CANCELED en el próximo reconcile en
// vez de quedar viva para siempre - la simulación no intenta sobrevivir
// al proceso.
@Injectable()
export class StubGateway implements PaymentGateway, SubscriptionProvider {
  readonly name = "STUB";

  private readonly plans = new Map<string, StubPlan>();
  private readonly customers = new Map<string, StubCustomer>();
  private readonly registerTokens = new Map<string, string>(); // token → customerId
  private readonly subs = new Map<string, StubSub>();
  private invoiceSeq = 1000;
  private orderSeq = 9000;

  createOrder(p: { refId: string }): Promise<{
    paymentUrl: string;
    gatewayRef: string;
  }> {
    return Promise.resolve({
      paymentUrl: `stub://pay/${p.refId}`,
      gatewayRef: `stub-${p.refId}`,
    });
  }

  verifyWebhook(body: unknown): Promise<{
    refId: string;
    status: "PAID" | "FAILED";
  }> {
    const b = body as { refId?: unknown; status?: unknown } | null;
    if (
      !b ||
      typeof b.refId !== "string" ||
      (b.status !== "PAID" && b.status !== "FAILED")
    ) {
      throw new Error("webhook stub inválido");
    }
    return Promise.resolve({ refId: b.refId, status: b.status });
  }

  // ---------- Suscripciones (SubscriptionProvider simulado) ----------

  ensurePlan(
    p: { planId: string; name: string; amount: number; intervalCount: number },
    _opts?: SubscriptionCallOpts,
  ): Promise<void> {
    if (!this.plans.has(p.planId)) this.plans.set(p.planId, { ...p });
    return Promise.resolve();
  }

  // Upsert a propósito: tras un restart el plan espejo no existe en memoria
  // pero el local sí tiene flowPlanId - un stub tolerante evita que un
  // PATCH de plan falle en dev por un restart del proceso.
  syncPlan(
    p: { planId: string; name: string; amount: number },
    _opts?: SubscriptionCallOpts,
  ): Promise<void> {
    const cur = this.plans.get(p.planId);
    this.plans.set(p.planId, {
      planId: p.planId,
      name: p.name,
      amount: p.amount,
      intervalCount: cur?.intervalCount ?? 1,
    });
    return Promise.resolve();
  }

  // Idempotente por externalId: mismo person → mismo customerId.
  createCustomer(
    p: { email: string; name: string; externalId: string },
    _opts?: SubscriptionCallOpts,
  ): Promise<{ customerId: string }> {
    const customerId = `stub_cus_${p.externalId}`;
    const cur = this.customers.get(customerId);
    if (cur) return Promise.resolve({ customerId: cur.customerId });
    this.customers.set(customerId, { customerId, hasCard: false, ...p });
    return Promise.resolve({ customerId });
  }

  // Customer desconocido (restart) → sin tarjeta: el subscribe lo manda
  // al registro de tarjeta de nuevo, recuperación natural del stub.
  getCustomer(
    customerId: string,
    _opts?: SubscriptionCallOpts,
  ): Promise<{ hasCard: boolean }> {
    const c = this.customers.get(customerId);
    return Promise.resolve({ hasCard: c?.hasCard === true });
  }

  // registerUrl = returnUrl + ?token= → el browser cae directo en el
  // callback real del API (GET /api/payments/flow/customer-return) sin
  // salir de localhost.
  registerCustomerCard(
    p: { customerId: string; returnUrl: string },
    _opts?: SubscriptionCallOpts,
  ): Promise<{ registerUrl: string }> {
    // customer desconocido (flowCustomerId stale tras restart): se crea
    // implícito para que el registro → subscribe siga funcionando.
    if (!this.customers.has(p.customerId)) {
      this.customers.set(p.customerId, {
        customerId: p.customerId,
        email: "",
        name: "",
        externalId: p.customerId,
        hasCard: false,
      });
    }
    const token = `stub_reg_${randomUUID()}`;
    this.registerTokens.set(token, p.customerId);
    const sep = p.returnUrl.includes("?") ? "&" : "?";
    return Promise.resolve({
      registerUrl: `${p.returnUrl}${sep}token=${token}`,
    });
  }

  // Consume el token de registro: marca la tarjeta del customer y devuelve
  // registered + customerId.
  getRegisterStatus(
    token: string,
    _opts?: SubscriptionCallOpts,
  ): Promise<{ registered: boolean; customerId?: string }> {
    const customerId = this.registerTokens.get(token);
    if (!customerId) return Promise.resolve({ registered: false });
    this.registerTokens.delete(token);
    const c = this.customers.get(customerId);
    if (c) c.hasCard = true;
    return Promise.resolve({ registered: true, customerId });
  }

  // Crea la sub con su invoice inicial YA pagada (Flow cobra el primer
  // período al crear) → el reconcile local la liquida como renovación.
  createSubscription(
    p: { planId: string; customerId: string; subscriptionStart: string },
    _opts?: SubscriptionCallOpts,
  ): Promise<RemoteSubscription> {
    const plan = this.plans.get(p.planId);
    const amount = plan?.amount ?? 0;
    const intervalMonths = plan?.intervalCount ?? 1;
    const next = new Date(`${p.subscriptionStart}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + intervalMonths);
    const invoice: SubscriptionInvoice = {
      id: ++this.invoiceSeq,
      amount,
      paid: true,
      periodStart: p.subscriptionStart,
      periodEnd: next.toISOString().slice(0, 10),
      payment: {
        orderRef: String(++this.orderSeq),
        data: {
          amount,
          fee: 0,
          media: "STUB",
          transferDate: new Date().toISOString(),
        },
      },
    };
    const sub: StubSub = {
      subscriptionId: `stub_sub_${randomUUID().slice(0, 12)}`,
      planId: p.planId,
      customerId: p.customerId,
      canceled: false,
      nextInvoiceDate: next.toISOString().slice(0, 10),
      cancelAtPeriodEnd: false,
      invoices: [invoice],
    };
    this.subs.set(sub.subscriptionId, sub);
    return Promise.resolve(this.toRemote(sub));
  }

  // Id desconocido (restart del proceso) → CANCELED: la fila local
  // converge a CANCELED en el próximo reconcile en vez de vivir siempre.
  getSubscription(
    subscriptionId: string,
    _opts?: SubscriptionCallOpts,
  ): Promise<RemoteSubscription> {
    const s = this.subs.get(subscriptionId);
    return Promise.resolve(
      s
        ? this.toRemote(s)
        : {
            subscriptionId,
            planId: "",
            status: "CANCELED",
            morose: false,
            cancelAtPeriodEnd: false,
            invoices: [],
          },
    );
  }

  // cancel al fin del período por default; immediate solo para la
  // compensación de huérfanas. Id desconocido → no-op (idempotente).
  cancelSubscription(
    subscriptionId: string,
    opts?: SubscriptionCallOpts & { immediate?: boolean },
  ): Promise<void> {
    const s = this.subs.get(subscriptionId);
    if (s) {
      if (opts?.immediate) {
        s.canceled = true;
        s.cancelAtPeriodEnd = false;
      } else {
        s.cancelAtPeriodEnd = true;
      }
    }
    return Promise.resolve();
  }

  private toRemote(s: StubSub): RemoteSubscription {
    return {
      subscriptionId: s.subscriptionId,
      planId: s.planId,
      status: s.canceled ? "CANCELED" : "ACTIVE",
      rawStatus: s.canceled ? 4 : 1,
      morose: false,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      nextInvoiceDate: s.nextInvoiceDate,
      invoices: s.invoices,
    };
  }
}

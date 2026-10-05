import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  FlowInvoice,
  FlowSubscription,
  PaymentGateway,
  SubscriptionCallOpts,
  SubscriptionProvider,
} from "../domain/ports";

type StubPlan = { planId: string; name: string; amount: number; intervalCount: number };
type StubCustomer = {
  customerId: string;
  email: string;
  name: string;
  externalId: string;
  creditCardType?: string;
};
type StubSub = {
  subscriptionId: string;
  planId: string;
  customerId: string;
  status: number;
  next_invoice_date?: string;
  cancel_at_period_end?: number;
  invoices: FlowInvoice[];
};

// Gateway de desarrollo: no sale a ninguna red; el webhook acepta
// { refId, status: "PAID" | "FAILED" } tal cual para simular la pasarela.
//
// Además implementa SubscriptionProvider con estado EN MEMORIA (se pierde
// al reiniciar el proceso): planes espejo, customers, registro de tarjeta
// y suscripciones con su invoice inicial ya pagada — el flujo completo
// (needs_card → customer-return → ACTIVE → settle → cancel) se ejerce en
// localhost sin credenciales Flow. El registerUrl apunta al returnUrl que
// le pasa el caller (el callback real customer-return del API), así que el
// browser nunca sale de localhost.
//
// Tras un restart, getSubscription de un id desconocido reporta status 4
// (cancelada) para que la fila local converja a CANCELED en el próximo
// reconcile en vez de quedar viva para siempre — la simulación no intenta
// sobrevivir al proceso.
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
  // pero el local sí tiene flowPlanId — un stub tolerante evita que un
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
    this.customers.set(customerId, { customerId, ...p });
    return Promise.resolve({ customerId });
  }

  // Customer desconocido (restart) → sin tarjeta: el subscribe lo manda
  // al registro de tarjeta de nuevo, recuperación natural del stub.
  getCustomer(
    customerId: string,
    _opts?: SubscriptionCallOpts,
  ): Promise<{ creditCardType?: string; status?: number }> {
    const c = this.customers.get(customerId);
    return Promise.resolve({
      creditCardType: c?.creditCardType,
      status: c ? 1 : 0,
    });
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
  // status 1 + customerId (lo que getRegisterStatus de Flow reporta).
  getRegisterStatus(
    token: string,
    _opts?: SubscriptionCallOpts,
  ): Promise<{ status: number; customerId?: string }> {
    const customerId = this.registerTokens.get(token);
    if (!customerId) return Promise.resolve({ status: 0 });
    this.registerTokens.delete(token);
    const c = this.customers.get(customerId);
    if (c) c.creditCardType = "STUB";
    return Promise.resolve({ status: 1, customerId });
  }

  // Crea la sub con su invoice inicial YA pagada (Flow cobra el primer
  // período al crear) → el reconcile local la liquida como renovación.
  createSubscription(
    p: { planId: string; customerId: string; subscriptionStart: string },
    _opts?: SubscriptionCallOpts,
  ): Promise<FlowSubscription> {
    const plan = this.plans.get(p.planId);
    const amount = plan?.amount ?? 0;
    const intervalMonths = plan?.intervalCount ?? 1;
    const next = new Date(`${p.subscriptionStart}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + intervalMonths);
    const invoice: FlowInvoice = {
      id: ++this.invoiceSeq,
      status: 1,
      amount,
      period_start: p.subscriptionStart,
      period_end: next.toISOString().slice(0, 10),
      payment: {
        status: 2,
        flowOrder: ++this.orderSeq,
        paymentData: {
          amount,
          fee: 0,
          media: "STUB",
          date: new Date().toISOString(),
        },
      },
    };
    const sub: StubSub = {
      subscriptionId: `stub_sub_${randomUUID().slice(0, 12)}`,
      planId: p.planId,
      customerId: p.customerId,
      status: 1,
      next_invoice_date: next.toISOString().slice(0, 10),
      cancel_at_period_end: 0,
      invoices: [invoice],
    };
    this.subs.set(sub.subscriptionId, sub);
    return Promise.resolve({ ...sub });
  }

  // Id desconocido (restart del proceso) → status 4: la fila local
  // converge a CANCELED en el próximo reconcile en vez de vivir siempre.
  getSubscription(
    subscriptionId: string,
    _opts?: SubscriptionCallOpts,
  ): Promise<FlowSubscription> {
    const s = this.subs.get(subscriptionId);
    return Promise.resolve(
      s
        ? { ...s }
        : { subscriptionId, planId: "", status: 4, invoices: [] },
    );
  }

  // at_period_end por default; immediate solo para la compensación de
  // huérfanas. Id desconocido → no-op (cancel es idempotente en dev).
  cancelSubscription(
    subscriptionId: string,
    opts?: SubscriptionCallOpts & { immediate?: boolean },
  ): Promise<void> {
    const s = this.subs.get(subscriptionId);
    if (s) {
      if (opts?.immediate) {
        s.status = 4;
        s.cancel_at_period_end = 0;
      } else {
        s.cancel_at_period_end = 1;
      }
    }
    return Promise.resolve();
  }
}

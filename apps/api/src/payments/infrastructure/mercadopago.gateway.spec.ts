import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoPagoGateway } from "./mercadopago.gateway";
import type { GatewayTxEntry } from "./gateway-transactions.service";

const TOKEN = "test-access-token";
const BASE = "https://api.mercadopago.com";
const NOTIFY = "http://api.test/api/payments/webhook/MERCADOPAGO";
const SUB_RETURN =
  "http://api.test/api/payments/mp/subscription-return?account=acct-1";

function makeGateway(onTx?: (e: GatewayTxEntry) => Promise<void>) {
  return new MercadoPagoGateway(TOKEN, BASE, NOTIFY, onTx, SUB_RETURN);
}

function mockFetch(payload: unknown, ok = true, status = 200) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(payload),
    text: () =>
      Promise.resolve(
        typeof payload === "string" ? payload : JSON.stringify(payload),
      ),
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Mock por ruta: matchea (método, substring de URL) → respuesta. */
function mockFetchRoutes(
  routes: {
    match: string;
    method?: string;
    payload: unknown;
    ok?: boolean;
    status?: number;
  }[],
) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const route = routes.find(
      (r) =>
        url.includes(r.match) && (r.method == null || r.method === method),
    );
    if (!route) {
      throw new Error(`fetch no mockeado: ${method} ${url}`);
    }
    const { payload, ok = true, status = 200 } = route;
    return {
      ok,
      status,
      json: () => Promise.resolve(payload),
      text: () =>
        Promise.resolve(
          typeof payload === "string" ? payload : JSON.stringify(payload),
        ),
    };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("MercadoPagoGateway", () => {
  describe("createOrder", () => {
    it("POST /checkout/preferences con bearer, external_reference y notification_url", async () => {
      const fetchSpy = mockFetch({
        id: "pref-1",
        init_point: "https://mp.test/checkout",
      });
      const out = await makeGateway().createOrder({
        refId: "tkt_ev1_abc",
        amount: 6000,
        email: "d@o.dev",
        returnUrl: "http://web.test/checkout/return",
        currency: "CLP",
      });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/checkout/preferences`);
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({
        authorization: `Bearer ${TOKEN}`,
      });
      const body = JSON.parse(init.body as string);
      expect(body.external_reference).toBe("tkt_ev1_abc");
      expect(body.notification_url).toBe(NOTIFY);
      expect(body.items[0].unit_price).toBe(6000);
      expect(body.items[0].currency_id).toBe("CLP");
      expect(out).toEqual({
        paymentUrl: "https://mp.test/checkout",
        gatewayRef: "pref-1",
      });
    });

    it("currency por defecto CLP cuando no se pasa", async () => {
      const fetchSpy = mockFetch({ id: "p", init_point: "u" });
      await makeGateway().createOrder({
        refId: "tkt_ev1_abc",
        amount: 100,
        email: "d@o.dev",
        returnUrl: "u",
      });
      const body = JSON.parse(
        (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(body.items[0].currency_id).toBe("CLP");
    });

    it("rechaza moneda no soportada sin llamar a MP", async () => {
      const fetchSpy = mockFetch({});
      await expect(
        makeGateway().createOrder({
          refId: "tkt_ev1_abc",
          amount: 100,
          email: "d@o.dev",
          returnUrl: "u",
          currency: "JPY",
        }),
      ).rejects.toThrow(/JPY/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("respuesta sin init_point → error", async () => {
      mockFetch({ id: "pref-1" });
      await expect(
        makeGateway().createOrder({
          refId: "tkt_ev1_abc",
          amount: 100,
          email: "d@o.dev",
          returnUrl: "u",
        }),
      ).rejects.toThrow();
    });
  });

  describe("verifyWebhook", () => {
    const mpPayment = (over: Record<string, unknown> = {}) => ({
      id: 555,
      status: "approved",
      external_reference: "tkt_ev1_abc",
      currency_id: "CLP",
      transaction_amount: 6000,
      transaction_details: {
        total_paid_amount: 6000,
        net_received_amount: 5780,
      },
      fee_details: [{ type: "mercadopago_fee", amount: 220 }],
      payment_method_id: "visa",
      date_approved: "2026-10-06T20:00:00.000Z",
      ...over,
    });

    it("notificación payment approved → PAID con gatewayData normalizado", async () => {
      const fetchSpy = mockFetch(mpPayment());
      const out = await makeGateway().verifyWebhook({
        type: "payment",
        data: { id: "555" },
      });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/v1/payments/555`);
      expect(init.headers).toMatchObject({
        authorization: `Bearer ${TOKEN}`,
      });
      expect(out.status).toBe("PAID");
      expect(out.refId).toBe("tkt_ev1_abc");
      const gd = out.gatewayData as Record<string, unknown>;
      // fee = total_paid - net_received (lo que MP nos cobró)
      expect(gd.fee).toBe(220);
      expect(gd.amount).toBe(6000);
      expect(gd.media).toBe("visa");
      expect(gd.currency).toBe("CLP");
      expect(gd.transferDate).toBe("2026-10-06T20:00:00.000Z");
      expect(gd.raw).toBeTruthy();
    });

    it("rejected/cancelled/refunded → FAILED", async () => {
      for (const st of ["rejected", "cancelled", "refunded"]) {
        mockFetch(mpPayment({ status: st }));
        const out = await makeGateway().verifyWebhook({
          type: "payment",
          data: { id: "555" },
        });
        expect(out.status).toBe("FAILED");
        expect(out.refId).toBe("tkt_ev1_abc");
      }
    });

    it("estado no terminal (pending/in_process) → throw (MP reintenta)", async () => {
      mockFetch(mpPayment({ status: "pending" }));
      await expect(
        makeGateway().verifyWebhook({ type: "payment", data: { id: "555" } }),
      ).rejects.toThrow();
    });

    it("notificación de otro topic → throw sin fetch", async () => {
      const fetchSpy = mockFetch({});
      await expect(
        makeGateway().verifyWebhook({ type: "merchant_order", data: { id: "9" } }),
      ).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("formato IPN legacy {topic:'payment', id} también confirma", async () => {
      const fetchSpy = mockFetch(mpPayment());
      const out = await makeGateway().verifyWebhook({
        topic: "payment",
        id: "555",
      });
      expect(fetchSpy).toHaveBeenCalled();
      expect(out.status).toBe("PAID");
    });

    it("payment sin external_reference → error (no hay refId que liquidar)", async () => {
      mockFetch(mpPayment({ external_reference: null }));
      await expect(
        makeGateway().verifyWebhook({ type: "payment", data: { id: "555" } }),
      ).rejects.toThrow();
    });
  });

  describe("refreshStatus", () => {
    it("busca por external_reference y normaliza el último pago", async () => {
      const fetchSpy = mockFetch({
        results: [
          {
            status: "approved",
            external_reference: "tkt_ev1_abc",
            currency_id: "CLP",
            transaction_details: {
              total_paid_amount: 6000,
              net_received_amount: 5780,
            },
            payment_method_id: "visa",
            date_approved: "2026-10-06T20:00:00.000Z",
          },
        ],
      });
      const out = await makeGateway().refreshStatus!("tkt_ev1_abc");
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/v1/payments/search");
      expect(url).toContain("external_reference=tkt_ev1_abc");
      expect(out.status).toBe("PAID");
    });

    it("sin resultados → PENDING", async () => {
      mockFetch({ results: [] });
      const out = await makeGateway().refreshStatus!("tkt_ev1_abc");
      expect(out.status).toBe("PENDING");
    });

    it("rejected → FAILED", async () => {
      mockFetch({
        results: [{ status: "rejected", external_reference: "tkt_ev1_abc" }],
      });
      const out = await makeGateway().refreshStatus!("tkt_ev1_abc");
      expect(out.status).toBe("FAILED");
    });
  });

  describe("auditoría", () => {
    it("cada HTTP emite un GatewayTxEntry (éxito y error)", async () => {
      const entries: GatewayTxEntry[] = [];
      const gw = makeGateway(async (e) => void entries.push(e));
      mockFetch({ id: "pref-1", init_point: "u" });
      await gw.createOrder({
        refId: "tkt_ev1_abc",
        amount: 100,
        email: "d@o.dev",
        returnUrl: "u",
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].provider).toBe("MERCADOPAGO");
      expect(entries[0].direction).toBe("OUTBOUND");
      expect(entries[0].ok).toBe(true);
      expect(entries[0].endpoint).toBe("checkout/preferences");

      mockFetch({ message: "boom" }, false, 500);
      await expect(
        gw.createOrder({
          refId: "tkt_ev1_abc",
          amount: 100,
          email: "d@o.dev",
          returnUrl: "u",
        }),
      ).rejects.toThrow();
      expect(entries).toHaveLength(2);
      expect(entries[1].ok).toBe(false);
      expect(entries[1].httpStatus).toBe(500);
    });
  });

  // ---------- Suscripciones (spec mercadopago-subscriptions) ----------
  describe("SubscriptionProvider", () => {
    it("capability: expone el motor de suscripciones (supportsSubs)", () => {
      const gw = makeGateway();
      expect(typeof gw.createSubscription).toBe("function");
      expect(typeof gw.registerCustomerCard).toBe("function");
      expect(typeof gw.getSubscription).toBe("function");
    });

    it("ensurePlan es no-op (contrato without-plan: no hay plan remoto)", async () => {
      const fetchSpy = mockFetch({});
      await makeGateway().ensurePlan({
        planId: "omni_plan1",
        name: "Academia X - Mensual",
        amount: 10000,
        intervalCount: 1,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("syncPlan NO existe: sin espejo remoto el service lo salta por capability (si fuera no-op falsearía planChargeClp)", () => {
      const gw = makeGateway() as unknown as Record<string, unknown>;
      expect(typeof gw.syncPlan).not.toBe("function");
    });

    describe("createCustomer / findCustomerByEmail", () => {
      it("customer existente por email → reutiliza su id sin POST", async () => {
        const fetchSpy = mockFetchRoutes([
          {
            match: "/v1/customers/search",
            payload: { results: [{ id: "mp-cus-1" }] },
          },
        ]);
        const out = await makeGateway().createCustomer({
          email: "d@o.dev",
          name: "Fan",
          externalId: "p1",
        });
        expect(out).toEqual({ customerId: "mp-cus-1" });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const url = fetchSpy.mock.calls[0][0] as string;
        expect(url).toContain("email=d%40o.dev");
      });

      it("customer inexistente → POST /v1/customers con email", async () => {
        const fetchSpy = mockFetchRoutes([
          { match: "/v1/customers/search", payload: { results: [] } },
          {
            match: "/v1/customers",
            method: "POST",
            payload: { id: "mp-cus-2" },
          },
        ]);
        const out = await makeGateway().createCustomer({
          email: "d@o.dev",
          name: "Fan",
          externalId: "p1",
        });
        expect(out).toEqual({ customerId: "mp-cus-2" });
        const body = JSON.parse(
          (fetchSpy.mock.calls[1] as [string, RequestInit])[1]
            .body as string,
        );
        expect(body.email).toBe("d@o.dev");
      });

      it("findCustomerByEmail → id o null", async () => {
        mockFetchRoutes([
          {
            match: "/v1/customers/search",
            payload: { results: [{ id: "mp-cus-1" }] },
          },
        ]);
        await expect(
          makeGateway().findCustomerByEmail!("d@o.dev"),
        ).resolves.toEqual({ customerId: "mp-cus-1" });
        mockFetchRoutes([
          { match: "/v1/customers/search", payload: { results: [] } },
        ]);
        await expect(
          makeGateway().findCustomerByEmail!("x@o.dev"),
        ).resolves.toBeNull();
      });
    });

    it("getCustomer.hasCard siempre false (cada preapproval exige su autorización hosted)", async () => {
      const fetchSpy = mockFetch({});
      await expect(
        makeGateway().getCustomer("mp-cus-1"),
      ).resolves.toEqual({ hasCard: false });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    describe("registerCustomerCard", () => {
      const prePending = {
        id: "pre-1",
        status: "pending",
        external_reference: "sub-1",
        init_point: "https://mp.test/preapproval/pre-1",
      };

      it("crea el preapproval pending con external_reference=subId y devuelve init_point", async () => {
        const fetchSpy = mockFetchRoutes([
          {
            match: "/preapproval/search",
            payload: { results: [] },
          },
          {
            match: "/v1/customers/mp-cus-1",
            payload: { id: "mp-cus-1", email: "d@o.dev" },
          },
          { match: "/preapproval", method: "POST", payload: prePending },
        ]);
        const out = await makeGateway().registerCustomerCard({
          customerId: "mp-cus-1",
          returnUrl: "http://api.test/api/payments/flow/customer-return?account=acct-1",
          metadata: {
            personId: "p1",
            subId: "sub-1",
            amount: "40000",
            intervalCount: "3",
            reason: "Academia X - Trimestral",
          },
        });
        expect(out).toEqual({
          registerUrl: "https://mp.test/preapproval/pre-1",
        });
        const [, init] = fetchSpy.mock.calls[2] as [string, RequestInit];
        const body = JSON.parse(init.body as string);
        expect(body.external_reference).toBe("sub-1");
        expect(body.payer_email).toBe("d@o.dev");
        expect(body.status).toBe("pending");
        expect(body.reason).toBe("Academia X - Trimestral");
        expect(body.auto_recurring).toMatchObject({
          frequency: 3,
          frequency_type: "months",
          transaction_amount: 40000,
          currency_id: "CLP",
        });
        expect(body.auto_recurring.end_date).toBeUndefined();
        expect(body.back_url).toContain("account=acct-1");
        expect(body.back_url).toContain("sub=sub-1");
      });

      it("preapproval pending existente → reusa su init_point (dedup por external_reference)", async () => {
        const fetchSpy = mockFetchRoutes([
          {
            match: "/preapproval/search",
            payload: { results: [prePending] },
          },
        ]);
        const out = await makeGateway().registerCustomerCard({
          customerId: "mp-cus-1",
          returnUrl: "u",
          metadata: { subId: "sub-1", amount: "40000", intervalCount: "1" },
        });
        expect(out.registerUrl).toBe("https://mp.test/preapproval/pre-1");
        // Solo la búsqueda - ni fetch de customer ni POST.
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });

      it("preapproval ya authorized → registerUrl = back_url (activa al volver sin re-autorizar)", async () => {
        mockFetchRoutes([
          {
            match: "/preapproval/search",
            payload: {
              results: [{ ...prePending, status: "authorized" }],
            },
          },
        ]);
        const out = await makeGateway().registerCustomerCard({
          customerId: "mp-cus-1",
          returnUrl: "u",
          metadata: { subId: "sub-1", amount: "40000", intervalCount: "1" },
        });
        expect(out.registerUrl).toContain("mp/subscription-return");
        expect(out.registerUrl).toContain("sub=sub-1");
      });

      it("sin metadata.subId → error explícito (external_reference es la dedup)", async () => {
        const fetchSpy = mockFetch({});
        await expect(
          makeGateway().registerCustomerCard({
            customerId: "mp-cus-1",
            returnUrl: "u",
          }),
        ).rejects.toThrow(/subId/);
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });

    describe("getRegisterStatus", () => {
      it("preapproval authorized → registered + subscriptionId", async () => {
        mockFetchRoutes([
          {
            match: "/preapproval/search",
            payload: {
              results: [
                {
                  id: "pre-1",
                  status: "authorized",
                  payer_id: 555,
                  external_reference: "sub-1",
                },
              ],
            },
          },
        ]);
        const out = await makeGateway().getRegisterStatus("sub-1");
        expect(out).toEqual({
          registered: true,
          customerId: "555",
          subscriptionId: "pre-1",
        });
      });

      it("pending o inexistente → registered false (nunca activa a ciegas)", async () => {
        mockFetchRoutes([
          {
            match: "/preapproval/search",
            payload: {
              results: [{ id: "pre-1", status: "pending" }],
            },
          },
        ]);
        const out = await makeGateway().getRegisterStatus("sub-1");
        expect(out.registered).toBe(false);
        mockFetchRoutes([
          { match: "/preapproval/search", payload: { results: [] } },
        ]);
        const out2 = await makeGateway().getRegisterStatus("sub-9");
        expect(out2.registered).toBe(false);
      });
    });

    describe("createSubscription", () => {
      it("lookup por external_reference (externalRef) - jamás crea un segundo preapproval", async () => {
        const fetchSpy = mockFetchRoutes([
          {
            match: "/preapproval/search",
            payload: {
              results: [
                {
                  id: "pre-1",
                  status: "authorized",
                  external_reference: "sub-1",
                  next_payment_date: "2026-11-15T00:00:00.000Z",
                },
              ],
            },
          },
          {
            match: "/authorized_payments/search",
            payload: { results: [] },
          },
        ]);
        const fs = await makeGateway().createSubscription({
          planId: "omni_plan1",
          customerId: "mp-cus-1",
          subscriptionStart: "2026-10-15",
          externalRef: "sub-1",
        });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(
          fetchSpy.mock.calls.every(
            (c) => (c[1] as RequestInit | undefined)?.method !== "POST",
          ),
        ).toBe(true);
        expect(fs.subscriptionId).toBe("pre-1");
        expect(fs.status).toBe("ACTIVE");
        expect(fs.nextInvoiceDate).toBe("2026-11-15T00:00:00.000Z");
      });

      it("sin preapproval → error (no hay create remoto en el contrato pending)", async () => {
        mockFetchRoutes([
          { match: "/preapproval/search", payload: { results: [] } },
          // Fallback payer_email: customer sin email → no hay segundo
          // intento de búsqueda.
          {
            match: "/v1/customers/mp-cus-1",
            payload: { id: "mp-cus-1", email: null },
          },
        ]);
        await expect(
          makeGateway().createSubscription({
            planId: "omni_plan1",
            customerId: "mp-cus-1",
            subscriptionStart: "2026-10-15",
            externalRef: "sub-9",
          }),
        ).rejects.toThrow(/preapproval/);
      });
    });

    describe("getSubscription", () => {
      it("authorized → ACTIVE + nextInvoiceDate + invoices de authorized_payments", async () => {
        mockFetchRoutes([
          {
            match: "/preapproval/pre-1",
            payload: {
              id: "pre-1",
              status: "authorized",
              external_reference: "sub-1",
              next_payment_date: "2026-11-15T00:00:00.000Z",
            },
          },
          {
            match: "/authorized_payments/search",
            payload: {
              results: [
                {
                  id: 901,
                  status: "processed",
                  transaction_amount: 40000,
                  currency_id: "CLP",
                  date_created: "2026-10-15T00:00:00.000Z",
                },
                {
                  id: 902,
                  status: "rejected",
                  transaction_amount: 40000,
                  currency_id: "CLP",
                  date_created: "2026-11-15T00:00:00.000Z",
                },
              ],
            },
          },
        ]);
        const fs = await makeGateway().getSubscription("pre-1");
        expect(fs.status).toBe("ACTIVE");
        expect(fs.nextInvoiceDate).toBe("2026-11-15T00:00:00.000Z");
        expect(fs.invoices).toHaveLength(2);
        expect(fs.invoices![0]).toMatchObject({ id: "901", paid: true });
        expect(fs.invoices![1]).toMatchObject({ id: "902", paid: false });
        // La cuota rechazada marca mora (misma semántica que Flow morose=1).
        expect(fs.morose).toBe(true);
      });

      it("cancelled → CANCELED", async () => {
        mockFetchRoutes([
          {
            match: "/preapproval/pre-1",
            payload: { id: "pre-1", status: "cancelled" },
          },
          {
            match: "/authorized_payments/search",
            payload: { results: [] },
          },
        ]);
        const fs = await makeGateway().getSubscription("pre-1");
        expect(fs.status).toBe("CANCELED");
      });
    });

    describe("cancelSubscription / repriceSubscription", () => {
      it("cancel → PUT /preapproval/:id {status:'cancelled'}", async () => {
        const fetchSpy = mockFetchRoutes([
          { match: "/preapproval/pre-1", method: "PUT", payload: {} },
        ]);
        await makeGateway().cancelSubscription("pre-1");
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${BASE}/preapproval/pre-1`);
        expect(init.method).toBe("PUT");
        expect(JSON.parse(init.body as string)).toEqual({
          status: "cancelled",
        });
      });

      it("reprice → PUT auto_recurring.transaction_amount por sub (sin cancel+recreate)", async () => {
        const fetchSpy = mockFetchRoutes([
          { match: "/preapproval/pre-1", method: "PUT", payload: {} },
        ]);
        await makeGateway().repriceSubscription!("pre-1", {
          amount: 45000,
          currency: "CLP",
        });
        const body = JSON.parse(
          (fetchSpy.mock.calls[0] as [string, RequestInit])[1]
            .body as string,
        );
        expect(body.auto_recurring).toEqual({
          transaction_amount: 45000,
          currency_id: "CLP",
        });
      });
    });
  });

  describe("verifyWebhook topics de suscripción", () => {
    it("subscription_authorized_payment → billing invoice.paid con subscriptionId=preapproval_id", async () => {
      const fetchSpy = mockFetchRoutes([
        {
          match: "/authorized_payments/901",
          payload: {
            id: 901,
            preapproval_id: "pre-1",
            status: "processed",
            transaction_amount: 40000,
            currency_id: "CLP",
            date_created: "2026-10-15T00:00:00.000Z",
          },
        },
      ]);
      const out = await makeGateway().verifyWebhook({
        type: "subscription_authorized_payment",
        data: { id: "901" },
      });
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/authorized_payments/901");
      expect(out.billing?.type).toBe("invoice.paid");
      expect(out.billing?.subscriptionId).toBe("pre-1");
      expect(out.billing?.invoice).toMatchObject({
        id: "901",
        amount: 40000,
        currency: "CLP",
        paid: true,
      });
    });

    it("authorized_payment rechazado → billing invoice.payment_failed", async () => {
      mockFetchRoutes([
        {
          match: "/authorized_payments/902",
          payload: {
            id: 902,
            preapproval_id: "pre-1",
            status: "rejected",
            transaction_amount: 40000,
            currency_id: "CLP",
          },
        },
      ]);
      const out = await makeGateway().verifyWebhook({
        type: "subscription_authorized_payment",
        data: { id: "902" },
      });
      expect(out.billing?.type).toBe("invoice.payment_failed");
      expect(out.billing?.invoice?.paid).toBe(false);
    });

    it("subscription_preapproval cancelled → billing customer.subscription.updated con raw.status=canceled", async () => {
      mockFetchRoutes([
        {
          match: "/preapproval/pre-1",
          payload: {
            id: "pre-1",
            status: "cancelled",
            external_reference: "sub-1",
          },
        },
      ]);
      const out = await makeGateway().verifyWebhook({
        type: "subscription_preapproval",
        data: { id: "pre-1" },
      });
      expect(out.billing?.type).toBe("customer.subscription.updated");
      expect(out.billing?.subscriptionId).toBe("pre-1");
      const raw = out.billing?.raw as { status?: string };
      expect(raw.status).toBe("canceled");
    });

    it("IPN legacy {topic:'subscription_authorized_payment', id} también confirma", async () => {
      mockFetchRoutes([
        {
          match: "/authorized_payments/901",
          payload: {
            id: 901,
            preapproval_id: "pre-1",
            status: "processed",
            transaction_amount: 40000,
            currency_id: "CLP",
          },
        },
      ]);
      const out = await makeGateway().verifyWebhook({
        topic: "subscription_authorized_payment",
        id: "901",
      });
      expect(out.billing?.type).toBe("invoice.paid");
    });
  });
});

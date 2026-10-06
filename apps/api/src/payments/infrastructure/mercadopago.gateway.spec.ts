import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoPagoGateway } from "./mercadopago.gateway";
import type { GatewayTxEntry } from "./gateway-transactions.service";

const TOKEN = "test-access-token";
const BASE = "https://api.mercadopago.com";
const NOTIFY = "http://api.test/api/payments/webhook/MERCADOPAGO";

function makeGateway(onTx?: (e: GatewayTxEntry) => Promise<void>) {
  return new MercadoPagoGateway(TOKEN, BASE, NOTIFY, onTx);
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
});

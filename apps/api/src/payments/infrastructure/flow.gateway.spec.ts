import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowGateway } from "./flow.gateway";
import {
  sanitizeGatewayPayload,
  type GatewayTxEntry,
} from "./gateway-transactions.service";
import { StubGateway } from "./stub.gateway";
import { resolveGateway } from "../payments.module";

const KEY = "test-api-key";
const SECRET = "test-secret-key";
const BASE = "https://sandbox.flow.cl/api";
const CONFIRM = "http://api.test/api/payments/webhook";
const SUB_CB = "http://api.test/api/payments/subscription-webhook";

function makeGateway() {
  return new FlowGateway(KEY, SECRET, BASE, CONFIRM);
}

// Gateway con subscriptionCallbackUrl (6º param del ctor) — el que arma
// resolveGateway como `${API_URL}/api/payments/subscription-webhook`.
function makeSubGateway() {
  return new FlowGateway(KEY, SECRET, BASE, CONFIRM, undefined, SUB_CB);
}

// Firma esperada según doc Flow: params ordenados alfabéticamente,
// concatenados "nombreValor", HMAC-SHA256 hex con el secret.
function expectedSignature(params: Record<string, string>): string {
  const concat = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  return createHmac("sha256", SECRET).update(concat).digest("hex");
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

describe("FlowGateway", () => {
  describe("createOrder", () => {
    it("POST a /payment/create urlencoded con params firmados", async () => {
      const fetchSpy = mockFetch({
        url: "https://sandbox.flow.cl/app/pagos.php",
        token: "tok123",
        flowOrder: 777,
      });
      const gw = makeGateway();
      const out = await gw.createOrder({
        refId: "mem_plan1_abc",
        amount: 25000,
        email: "d@o.dev",
        returnUrl: "http://web.test/checkout/return",
      });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/payment/create`);
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({
        "content-type": "application/x-www-form-urlencoded",
      });

      const body = init.body as URLSearchParams;
      const params: Record<string, string> = {
        apiKey: KEY,
        commerceOrder: "mem_plan1_abc",
        subject: "Plan Omnidance",
        currency: "CLP",
        amount: "25000",
        email: "d@o.dev",
        urlConfirmation: CONFIRM,
        urlReturn: "http://web.test/checkout/return",
      };
      for (const [k, v] of Object.entries(params)) {
        expect(body.get(k)).toBe(v);
      }
      expect(body.get("s")).toBe(expectedSignature(params));

      expect(out.paymentUrl).toBe(
        "https://sandbox.flow.cl/app/pagos.php?token=tok123",
      );
      expect(out.gatewayRef).toBe("777");
    });

    it("subject según prefijo del refId (tkt_/sp_/mem_)", async () => {
      const fetchSpy = mockFetch({ url: "u", token: "t", flowOrder: 1 });
      const gw = makeGateway();
      const base = { amount: 1, email: "e", returnUrl: "r" };
      await gw.createOrder({ ...base, refId: "tkt_e1_x" });
      await gw.createOrder({ ...base, refId: "sp_s1_x" });
      const subjects = fetchSpy.mock.calls.map(
        (c) => ((c[1] as RequestInit).body as URLSearchParams).get("subject"),
      );
      expect(subjects).toEqual([
        "Ticket Omnidance",
        "Pase de serie Omnidance",
      ]);
    });

    it("respuesta sin url/token → error", async () => {
      mockFetch({ url: null });
      await expect(
        makeGateway().createOrder({
          refId: "tkt_x",
          amount: 1,
          email: "e",
          returnUrl: "r",
        }),
      ).rejects.toThrow("respuesta inválida");
    });
  });

  describe("verifyWebhook", () => {
    it("firma apiKey+token y consulta payment/getStatus; status 2 → PAID", async () => {
      const fetchSpy = mockFetch({ status: 2, commerceOrder: "tkt_e1_abc" });
      const out = await makeGateway().verifyWebhook({ token: "tok9" });
      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url.startsWith(`${BASE}/payment/getStatus?`)).toBe(true);
      const qs = new URLSearchParams(url.split("?")[1]);
      expect(qs.get("apiKey")).toBe(KEY);
      expect(qs.get("token")).toBe("tok9");
      expect(qs.get("s")).toBe(
        expectedSignature({ apiKey: KEY, token: "tok9" }),
      );
      expect(out).toEqual({ refId: "tkt_e1_abc", status: "PAID" });
    });

    it.each([3, 4])("status %i → FAILED", async (status) => {
      mockFetch({ status, commerceOrder: "tkt_e1_abc" });
      const out = await makeGateway().verifyWebhook({ token: "t" });
      expect(out.status).toBe("FAILED");
    });

    it("status 1 (pendiente) → error no terminal", async () => {
      mockFetch({ status: 1, commerceOrder: "tkt_e1_abc" });
      await expect(
        makeGateway().verifyWebhook({ token: "t" }),
      ).rejects.toThrow("no terminal");
    });

    it("body sin token → webhook inválido", async () => {
      await expect(makeGateway().verifyWebhook({})).rejects.toThrow(
        "inválido",
      );
    });
  });

  describe("refreshStatus", () => {
    it("consulta getStatusByCommerceId con commerceOrder firmado", async () => {
      const fetchSpy = mockFetch({ status: 2 });
      const out = await makeGateway().refreshStatus("mem_p1_x");
      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url.startsWith(`${BASE}/payment/getStatusByCommerceId?`)).toBe(
        true,
      );
      const qs = new URLSearchParams(url.split("?")[1]);
      expect(qs.get("commerceOrder")).toBe("mem_p1_x");
      expect(qs.get("s")).toBe(
        expectedSignature({ apiKey: KEY, commerceOrder: "mem_p1_x" }),
      );
      expect(out.status).toBe("PAID");
    });

    it.each([
      [1, "PENDING"],
      [2, "PAID"],
      [3, "FAILED"],
      [4, "FAILED"],
    ])("status %i → %s", async (status, expected) => {
      mockFetch({ status });
      expect((await makeGateway().refreshStatus("r")).status).toBe(expected);
    });

    it("devuelve paymentData como gatewayData (verdad monetaria del polling)", async () => {
      mockFetch({
        status: 2,
        paymentData: { amount: 10500, fee: 335, media: "Webpay" },
      });
      const out = await makeGateway().refreshStatus("r");
      expect(out.gatewayData).toEqual({
        amount: 10500,
        fee: 335,
        media: "Webpay",
      });
    });
  });

  describe("suscripciones (plans/customer/subscription)", () => {
    describe("ensurePlan", () => {
      it("plans/get error → plans/create con params firmados + urlCallback", async () => {
        const spy = vi
          .fn()
          .mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: () => Promise.resolve("{}"),
            json: () => Promise.resolve({}),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: () => Promise.resolve("{}"),
            json: () => Promise.resolve({ planId: "pl_1" }),
          });
        vi.stubGlobal("fetch", spy);

        await makeSubGateway().ensurePlan({
          planId: "pl_1",
          name: "Academia X — Mensual",
          amount: 25000,
          intervalCount: 1,
        });

        expect(spy).toHaveBeenCalledTimes(2);
        // 1ª: GET plans/get con planId firmado en querystring
        const [getUrl] = spy.mock.calls[0] as [string];
        expect(getUrl.startsWith(`${BASE}/plans/get?`)).toBe(true);
        const getQs = new URLSearchParams(getUrl.split("?")[1]);
        expect(getQs.get("planId")).toBe("pl_1");
        expect(getQs.get("s")).toBe(
          expectedSignature({ apiKey: KEY, planId: "pl_1" }),
        );
        // 2ª: POST plans/create
        const [createUrl, createInit] = spy.mock.calls[1] as [
          string,
          RequestInit,
        ];
        expect(createUrl).toBe(`${BASE}/plans/create`);
        expect(createInit.method).toBe("POST");
        const body = createInit.body as URLSearchParams;
        const params: Record<string, string> = {
          apiKey: KEY,
          planId: "pl_1",
          name: "Academia X — Mensual",
          currency: "CLP",
          amount: "25000",
          interval: "3",
          interval_count: "1",
          urlCallback: SUB_CB,
          charges_retries_number: "3",
        };
        for (const [k, v] of Object.entries(params)) {
          expect(body.get(k)).toBe(v);
        }
        expect(body.get("s")).toBe(expectedSignature(params));
      });

      it("plans/get ok → ya existe, no llama plans/create", async () => {
        const spy = mockFetch({ planId: "pl_1", name: "Plan" });
        await makeSubGateway().ensurePlan({
          planId: "pl_1",
          name: "Plan",
          amount: 100,
          intervalCount: 3,
        });
        expect(spy).toHaveBeenCalledTimes(1);
      });
    });

    it("syncPlan POST plans/edit con planId+name+amount", async () => {
      const spy = mockFetch({ planId: "pl_1" });
      await makeGateway().syncPlan({
        planId: "pl_1",
        name: "Nuevo nombre",
        amount: 30000,
      });
      const [url, init] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/plans/edit`);
      const body = init.body as URLSearchParams;
      const params: Record<string, string> = {
        apiKey: KEY,
        planId: "pl_1",
        name: "Nuevo nombre",
        amount: "30000",
      };
      for (const [k, v] of Object.entries(params)) {
        expect(body.get(k)).toBe(v);
      }
      expect(body.get("s")).toBe(expectedSignature(params));
    });

    it("createCustomer POST customer/create → customerId", async () => {
      const spy = mockFetch({ customerId: "cus_9", email: "d@o.dev" });
      const out = await makeGateway().createCustomer({
        email: "d@o.dev",
        name: "Dani",
        externalId: "per_1",
      });
      const [url, init] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/customer/create`);
      const body = init.body as URLSearchParams;
      const params: Record<string, string> = {
        apiKey: KEY,
        email: "d@o.dev",
        name: "Dani",
        externalId: "per_1",
      };
      for (const [k, v] of Object.entries(params)) {
        expect(body.get(k)).toBe(v);
      }
      expect(body.get("s")).toBe(expectedSignature(params));
      expect(out.customerId).toBe("cus_9");
    });

    it("getCustomer GET customer/get → creditCardType+status", async () => {
      const spy = mockFetch({
        customerId: "cus_1",
        creditCardType: "Visa",
        status: 1,
      });
      const out = await makeGateway().getCustomer("cus_1");
      const [url] = spy.mock.calls[0] as [string];
      expect(url.startsWith(`${BASE}/customer/get?`)).toBe(true);
      const qs = new URLSearchParams(url.split("?")[1]);
      expect(qs.get("customerId")).toBe("cus_1");
      expect(qs.get("s")).toBe(
        expectedSignature({ apiKey: KEY, customerId: "cus_1" }),
      );
      expect(out).toEqual({ creditCardType: "Visa", status: 1 });
    });

    it("registerCustomerCard POST customer/register → registerUrl = url?token=", async () => {
      const spy = mockFetch({
        url: "https://sandbox.flow.cl/app/customer/disclaimer.php",
        token: "tokR",
      });
      const out = await makeGateway().registerCustomerCard({
        customerId: "cus_1",
        returnUrl: "https://api/cb",
      });
      const [url, init] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/customer/register`);
      const body = init.body as URLSearchParams;
      expect(body.get("customerId")).toBe("cus_1");
      expect(body.get("url_return")).toBe("https://api/cb");
      expect(body.get("s")).toBe(
        expectedSignature({
          apiKey: KEY,
          customerId: "cus_1",
          url_return: "https://api/cb",
        }),
      );
      expect(out.registerUrl).toBe(
        "https://sandbox.flow.cl/app/customer/disclaimer.php?token=tokR",
      );
    });

    it("getRegisterStatus GET — status viene STRING '1' → parsea a 1 + customerId", async () => {
      const spy = mockFetch({
        status: "1",
        customerId: "cus_1",
        creditCardType: "Visa",
        last4CardDigits: "4242",
      });
      const out = await makeGateway().getRegisterStatus("tokReg");
      const [url] = spy.mock.calls[0] as [string];
      expect(url.startsWith(`${BASE}/customer/getRegisterStatus?`)).toBe(
        true,
      );
      const qs = new URLSearchParams(url.split("?")[1]);
      expect(qs.get("token")).toBe("tokReg");
      expect(qs.get("s")).toBe(
        expectedSignature({ apiKey: KEY, token: "tokReg" }),
      );
      expect(out).toEqual({ status: 1, customerId: "cus_1" });
    });

    it("createSubscription POST subscription/create con planId+customerId+start", async () => {
      const spy = mockFetch({
        subscriptionId: "sus_1",
        planId: "pl_1",
        status: 1,
        next_invoice_date: "2026-10-24 00:00:00",
      });
      const out = await makeGateway().createSubscription({
        planId: "pl_1",
        customerId: "cus_1",
        subscriptionStart: "2026-09-24",
      });
      const [url, init] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/subscription/create`);
      const body = init.body as URLSearchParams;
      const params: Record<string, string> = {
        apiKey: KEY,
        planId: "pl_1",
        customerId: "cus_1",
        subscription_start: "2026-09-24",
      };
      for (const [k, v] of Object.entries(params)) {
        expect(body.get(k)).toBe(v);
      }
      expect(body.get("s")).toBe(expectedSignature(params));
      expect(out.subscriptionId).toBe("sus_1");
      expect(out.next_invoice_date).toBe("2026-10-24 00:00:00");
    });

    it("getSubscription GET subscription/get → parsea invoices[]", async () => {
      const spy = mockFetch({
        subscriptionId: "sus_1",
        planId: "pl_1",
        status: 1,
        invoices: [
          {
            id: 10,
            status: 1,
            amount: 5000,
            payment: { status: 2, flowOrder: 99 },
          },
        ],
      });
      const out = await makeGateway().getSubscription("sus_1");
      const [url] = spy.mock.calls[0] as [string];
      expect(url.startsWith(`${BASE}/subscription/get?`)).toBe(true);
      const qs = new URLSearchParams(url.split("?")[1]);
      expect(qs.get("subscriptionId")).toBe("sus_1");
      expect(qs.get("s")).toBe(
        expectedSignature({ apiKey: KEY, subscriptionId: "sus_1" }),
      );
      expect(out.invoices).toHaveLength(1);
      expect(out.invoices?.[0].id).toBe(10);
      expect(out.invoices?.[0].payment?.flowOrder).toBe(99);
    });

    it("cancelSubscription → at_period_end=1", async () => {
      const spy = mockFetch({ subscriptionId: "sus_1" });
      await makeGateway().cancelSubscription("sus_1");
      const [url, init] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/subscription/cancel`);
      const body = init.body as URLSearchParams;
      expect(body.get("subscriptionId")).toBe("sus_1");
      expect(body.get("at_period_end")).toBe("1");
      expect(body.get("s")).toBe(
        expectedSignature({
          apiKey: KEY,
          subscriptionId: "sus_1",
          at_period_end: "1",
        }),
      );
    });

    it("correlationId de opts propaga a la auditoría de call()", async () => {
      const txLog: GatewayTxEntry[] = [];
      const gw = new FlowGateway(KEY, SECRET, BASE, CONFIRM, async (e) => {
        txLog.push(e);
      });
      mockFetch({ subscriptionId: "sus_1", status: 1 });
      await gw.createSubscription(
        {
          planId: "pl_1",
          customerId: "cus_1",
          subscriptionStart: "2026-09-24",
        },
        { correlationId: "corr_sub_42" },
      );
      expect(txLog).toHaveLength(1);
      expect(txLog[0].endpoint).toBe("subscription/create");
      expect(txLog[0].correlationId).toBe("corr_sub_42");
      expect(txLog[0].ok).toBe(true);
    });
  });

  describe("auditoría GatewayTransaction (onTx)", () => {
    function auditedGateway(txLog: GatewayTxEntry[]) {
      return new FlowGateway(KEY, SECRET, BASE, CONFIRM, async (e) => {
        txLog.push(e);
      });
    }

    it("registra GatewayTransaction por cada call, firma sanitizada", async () => {
      const txLog: GatewayTxEntry[] = [];
      mockFetch({ url: "u", token: "t", flowOrder: 1 });
      const gw = auditedGateway(txLog);
      await gw.createOrder({
        refId: "tkt_a_b",
        amount: 1,
        email: "e",
        returnUrl: "r",
      });
      expect(txLog).toHaveLength(1);
      expect(txLog[0].endpoint).toBe("payment/create");
      expect(txLog[0].direction).toBe("OUTBOUND");
      expect(txLog[0].provider).toBe("FLOW");
      expect(txLog[0].ok).toBe(true);
      expect(txLog[0].httpStatus).toBe(200);
      expect(txLog[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(txLog[0].correlationId).toBeTruthy();
      const req = txLog[0].requestBody as Record<string, string>;
      expect(req.s).toMatch(/^sha256:/);
      expect(req.s).not.toHaveLength(64); // nunca la firma completa
      expect(req.commerceOrder).toBe("tkt_a_b");
      const res = txLog[0].responseBody as Record<string, unknown>;
      expect(res.token).toBe("t");
    });

    it("verifyWebhook registra payment/getStatus (GET)", async () => {
      const txLog: GatewayTxEntry[] = [];
      mockFetch({ status: 2, commerceOrder: "tkt_e1_abc" });
      const gw = auditedGateway(txLog);
      await gw.verifyWebhook({ token: "tok9" });
      expect(txLog).toHaveLength(1);
      expect(txLog[0].endpoint).toBe("payment/getStatus");
      expect(txLog[0].direction).toBe("OUTBOUND");
      expect(txLog[0].ok).toBe(true);
      const req = txLog[0].requestBody as Record<string, string>;
      expect(req.token).toBe("tok9");
      expect(req.s).toMatch(/^sha256:/);
    });

    it("refreshStatus registra payment/getStatusByCommerceId (GET)", async () => {
      const txLog: GatewayTxEntry[] = [];
      mockFetch({ status: 2 });
      const gw = auditedGateway(txLog);
      await gw.refreshStatus("mem_p1_x");
      expect(txLog).toHaveLength(1);
      expect(txLog[0].endpoint).toBe("payment/getStatusByCommerceId");
      expect(txLog[0].ok).toBe(true);
      const req = txLog[0].requestBody as Record<string, string>;
      expect(req.commerceOrder).toBe("mem_p1_x");
      expect(req.s).toMatch(/^sha256:/);
    });

    it("error HTTP → entry con ok=false, httpStatus y error; la excepción propaga", async () => {
      const txLog: GatewayTxEntry[] = [];
      mockFetch({ code: 108, message: "orden inválida" }, false, 400);
      const gw = auditedGateway(txLog);
      await expect(
        gw.createOrder({ refId: "tkt_x", amount: 1, email: "e", returnUrl: "r" }),
      ).rejects.toThrow("flow payment/create HTTP 400: orden inválida");
      expect(txLog).toHaveLength(1);
      expect(txLog[0].ok).toBe(false);
      expect(txLog[0].httpStatus).toBe(400);
      expect(txLog[0].error).toContain("HTTP 400");
      const res = txLog[0].responseBody as Record<string, unknown>;
      expect(res.message).toBe("orden inválida");
    });

    it("falla de red (fetch rechaza) → entry con ok=false y sin httpStatus", async () => {
      const txLog: GatewayTxEntry[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("socket hang up")),
      );
      const gw = auditedGateway(txLog);
      await expect(gw.refreshStatus("r")).rejects.toThrow("socket hang up");
      expect(txLog).toHaveLength(1);
      expect(txLog[0].ok).toBe(false);
      expect(txLog[0].httpStatus).toBeUndefined();
      expect(txLog[0].error).toBe("socket hang up");
      expect(txLog[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it("sin onTx (ctor de 4 args) las llamadas siguen funcionando", async () => {
      mockFetch({ status: 2, commerceOrder: "tkt_e1_abc" });
      const out = await makeGateway().verifyWebhook({ token: "t" });
      expect(out.status).toBe("PAID");
    });
  });
});

describe("sanitizeGatewayPayload", () => {
  it("s → sha256:<16 hex>, nunca la firma raw", () => {
    const out = sanitizeGatewayPayload({
      apiKey: "k",
      s: "a".repeat(64),
      token: "t",
    }) as Record<string, string>;
    expect(out.s).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(out.apiKey).toBe("k");
    expect(out.token).toBe("t");
  });

  it("mismo s → misma huella (correlacionable); distinto s → distinta", () => {
    const a = sanitizeGatewayPayload({ s: "sig-a" }) as { s: string };
    const b = sanitizeGatewayPayload({ s: "sig-a" }) as { s: string };
    const c = sanitizeGatewayPayload({ s: "sig-b" }) as { s: string };
    expect(a.s).toBe(b.s);
    expect(a.s).not.toBe(c.s);
  });

  it("es idempotente en valor (sha256:... ya formado queda igual)", () => {
    const once = sanitizeGatewayPayload({ s: "abc123firma" }) as {
      s: string;
    };
    const twice = sanitizeGatewayPayload(once) as { s: string };
    expect(twice.s).toBe(once.s);
  });

  it("no-objeto → tal cual (null/undefined → null)", () => {
    expect(sanitizeGatewayPayload(undefined)).toBeNull();
    expect(sanitizeGatewayPayload(null)).toBeNull();
    expect(sanitizeGatewayPayload("raw")).toBe("raw");
  });
});

describe("resolveGateway (sandbox-only)", () => {
  const creds = {
    PAYMENT_GATEWAY: "flow",
    FLOW_API_KEY: "k",
    FLOW_SECRET_KEY: "s",
  };

  it("flow + credenciales → FlowGateway (default sandbox)", () => {
    const gw = resolveGateway({ ...creds });
    expect(gw).toBeInstanceOf(FlowGateway);
  });

  it("FLOW_BASE_URL distinto de sandbox → fail-fast", () => {
    expect(() =>
      resolveGateway({ ...creds, FLOW_BASE_URL: "https://www.flow.cl/api" }),
    ).toThrow("sandbox");
  });

  it("flow sin credenciales → fail-fast", () => {
    expect(() => resolveGateway({ PAYMENT_GATEWAY: "flow" })).toThrow(
      "FLOW_API_KEY",
    );
    expect(() =>
      resolveGateway({ PAYMENT_GATEWAY: "flow", FLOW_API_KEY: "k" }),
    ).toThrow("FLOW_SECRET");
  });

  it("sin PAYMENT_GATEWAY → StubGateway", () => {
    expect(resolveGateway({})).toBeInstanceOf(StubGateway);
  });

  it("stub en producción → fail-fast", () => {
    expect(() => resolveGateway({ NODE_ENV: "production" })).toThrow(
      "producción",
    );
  });
});

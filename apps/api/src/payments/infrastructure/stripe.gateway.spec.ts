import { createHmac } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { StripeGateway } from "./stripe.gateway";

const KEY = "sk_test_stripe";
const WH = "whsec_test";

function sign(rawBody: string, t: number, secret = WH): string {
  const v1 = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  return `t=${t},v1=${v1}`;
}

function mockFetch(handlers: Record<string, unknown>) {
  return vi.fn(async (input: unknown) => {
    const url = String(
      typeof input === "string" ? input : (input as { url: string }).url,
    );
    for (const [frag, body] of Object.entries(handlers)) {
      if (url.includes(frag)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response("not found", { status: 404 });
  });
}

/** Lee el body form-urlencoded de un POST mockeado como objeto plano. */
function formOf(call: unknown[]): Record<string, string> {
  const init = call[1] as { body: string };
  return Object.fromEntries(new URLSearchParams(init.body));
}

const gw = (wh = WH) => new StripeGateway(KEY, wh, "https://api.stripe.test");

afterEach(() => vi.unstubAllGlobals());

describe("StripeGateway.createOrder", () => {
  const created = { id: "cs_test_abc", url: "https://pay.stripe.com/cs_test_abc" };

  it("crea Checkout Session mode=payment con refId duplicado y card+link", async () => {
    const fetchMock = mockFetch({ "checkout/sessions": created });
    vi.stubGlobal("fetch", fetchMock);
    const out = await gw().createOrder({
      refId: "tkt_evt-1_x",
      amount: 5000,
      email: "a@b.cl",
      returnUrl: "https://app/r",
      currency: "CLP",
    });
    expect(out).toEqual({
      paymentUrl: "https://pay.stripe.com/cs_test_abc",
      gatewayRef: "cs_test_abc",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("https://api.stripe.test/v1/checkout/sessions");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(init.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    const body = formOf(fetchMock.mock.calls[0] as unknown[]);
    expect(body.mode).toBe("payment");
    // CLP es zero-decimal: el monto va tal cual en minor units.
    expect(body["line_items[0][price_data][unit_amount]"]).toBe("5000");
    expect(body["line_items[0][price_data][currency]"]).toBe("clp");
    expect(body["line_items[0][price_data][product_data][name]"]).toBe(
      "Ticket Omnidance",
    );
    expect(body["line_items[0][quantity]"]).toBe("1");
    expect(body.client_reference_id).toBe("tkt_evt-1_x");
    expect(body["metadata[refId]"]).toBe("tkt_evt-1_x");
    expect(body.customer_email).toBe("a@b.cl");
    expect(body.success_url).toBe("https://app/r");
    expect(body.cancel_url).toBe("https://app/r");
    expect(body["payment_method_types[0]"]).toBe("card");
    expect(body["payment_method_types[1]"]).toBe("link");
  });

  it("USD convierte a minor units (×100) y JPY queda igual (zero-decimal)", async () => {
    vi.stubGlobal("fetch", mockFetch({ "checkout/sessions": created }));
    const fetchMock = vi.mocked(fetch);
    await gw().createOrder({
      refId: "r",
      amount: 25,
      email: "e",
      returnUrl: "u",
      currency: "USD",
    });
    expect(
      formOf(fetchMock.mock.calls[0] as unknown[])[
        "line_items[0][price_data][unit_amount]"
      ],
    ).toBe("2500");
    await gw().createOrder({
      refId: "r",
      amount: 5000,
      email: "e",
      returnUrl: "u",
      currency: "JPY",
    });
    expect(
      formOf(fetchMock.mock.calls[1] as unknown[])[
        "line_items[0][price_data][unit_amount]"
      ],
    ).toBe("5000");
  });

  it("sin moneda → CLP (zero-decimal, monto tal cual)", async () => {
    vi.stubGlobal("fetch", mockFetch({ "checkout/sessions": created }));
    await gw().createOrder({
      refId: "r",
      amount: 1000,
      email: "e",
      returnUrl: "u",
    });
    const body = formOf(vi.mocked(fetch).mock.calls[0] as unknown[]);
    expect(body["line_items[0][price_data][currency]"]).toBe("clp");
    expect(body["line_items[0][price_data][unit_amount]"]).toBe("1000");
  });

  it("título del ítem por prefijo de refId (mem_/sp_/pvt_/wks_/default)", async () => {
    vi.stubGlobal("fetch", mockFetch({ "checkout/sessions": created }));
    const fetchMock = vi.mocked(fetch);
    for (const [refId] of [
      ["mem_plan-1_x"],
      ["sp_ser-1_2026-10_x"],
      ["pvt_aca-1_x"],
      ["wks_cls-1_x"],
      ["tkt_x"],
    ] as const) {
      await gw().createOrder({ refId, amount: 1, email: "e", returnUrl: "u" });
    }
    for (const [i, name] of [
      [0, "Plan Omnidance"],
      [1, "Pase de serie Omnidance"],
      [2, "Clase particular Omnidance"],
      [3, "Workshop Omnidance"],
      [4, "Ticket Omnidance"],
    ] as const) {
      expect(
        formOf(fetchMock.mock.calls[i] as unknown[])[
          "line_items[0][price_data][product_data][name]"
        ],
      ).toBe(name);
    }
  });

  it("falla si la respuesta no trae url", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "checkout/sessions": { id: "cs_x" } }),
    );
    await expect(
      gw().createOrder({ refId: "r", amount: 1, email: "e", returnUrl: "u" }),
    ).rejects.toThrow(/url/);
  });
});

describe("StripeGateway Connect (stripeAccount)", () => {
  const created = { id: "cs_test_abc", url: "https://pay.stripe.com/cs" };
  const connected = () =>
    new StripeGateway(
      KEY,
      WH,
      "https://api.stripe.test",
      undefined,
      "acct_prod1",
    );

  const headersOf = (call: unknown[]) =>
    (call[1] as { headers: Record<string, string> }).headers;

  it("createOrder envía Stripe-Account (direct charge en la cuenta)", async () => {
    const fetchMock = mockFetch({ "checkout/sessions": created });
    vi.stubGlobal("fetch", fetchMock);
    await connected().createOrder({
      refId: "tkt_x",
      amount: 5000,
      email: "a@b.cl",
      returnUrl: "https://app/r",
    });
    const h = headersOf(fetchMock.mock.calls[0] as unknown[]);
    expect(h["Stripe-Account"]).toBe("acct_prod1");
    // La auth sigue siendo la secret key de plataforma.
    expect(h.authorization).toBe(`Bearer ${KEY}`);
  });

  it("refreshStatus consulta la sesión con el mismo header (polling por cuenta)", async () => {
    const fetchMock = mockFetch({
      "checkout/sessions": {
        id: "cs_x",
        status: "complete",
        payment_status: "paid",
        amount_total: 5000,
        currency: "clp",
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await connected().refreshStatus("tkt_x", {
      gatewayRef: "cs_x",
    });
    expect(r.status).toBe("PAID");
    expect(headersOf(fetchMock.mock.calls[0] as unknown[])[
      "Stripe-Account"
    ]).toBe("acct_prod1");
  });

  it("sin stripeAccount el header no se envía (cuenta plataforma)", async () => {
    const fetchMock = mockFetch({ "checkout/sessions": created });
    vi.stubGlobal("fetch", fetchMock);
    await gw().createOrder({
      refId: "tkt_x",
      amount: 1,
      email: "e",
      returnUrl: "u",
    });
    expect(
      headersOf(fetchMock.mock.calls[0] as unknown[])["Stripe-Account"],
    ).toBeUndefined();
  });
});

describe("StripeGateway.verifyWebhook", () => {
  const session = {
    id: "cs_abc123",
    object: "checkout.session",
    status: "complete",
    payment_status: "paid",
    amount_total: 5000,
    currency: "clp",
    client_reference_id: "tkt_1",
    metadata: { refId: "tkt_1" },
    payment_method_types: ["card", "link"],
    payment_intent: {
      id: "pi_1",
      latest_charge: {
        id: "ch_1",
        created: 1700000000,
        payment_method_details: { type: "card" },
        balance_transaction: {
          fee: 145,
          net: 4855,
          amount: 5000,
          currency: "clp",
        },
      },
    },
  };

  function eventBody(type: string, sessionId = "cs_abc123") {
    return JSON.stringify({
      id: "evt_1",
      type,
      data: { object: { id: sessionId, object: "checkout.session" } },
    });
  }

  function ctxFor(raw: string, secret = WH, t?: number) {
    return {
      rawBody: raw,
      headers: {
        "stripe-signature": sign(
          raw,
          t ?? Math.floor(Date.now() / 1000),
          secret,
        ),
      },
    };
  }

  it("firma válida + sesión pagada → PAID + fetch-confirm con expand", async () => {
    const fetchMock = mockFetch({ "checkout/sessions": session });
    vi.stubGlobal("fetch", fetchMock);
    const raw = eventBody("checkout.session.completed");
    const r = await gw().verifyWebhook(JSON.parse(raw), ctxFor(raw));
    expect(r.refId).toBe("tkt_1");
    expect(r.status).toBe("PAID");
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/v1/checkout/sessions/cs_abc123");
    expect(url).toContain("payment_intent.latest_charge.balance_transaction");
    expect(r.gatewayData).toMatchObject({
      fee: 145, // CLP zero-decimal: minor == mayor
      amount: 5000,
      media: "card",
      currency: "CLP",
      transferDate: new Date(1700000000 * 1000).toISOString(),
    });
  });

  it("normaliza a unidad mayor en monedas con decimales (USD)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "checkout/sessions": {
          ...session,
          amount_total: 2500,
          currency: "usd",
          payment_intent: {
            latest_charge: {
              created: 1700000000,
              payment_method_details: { type: "link" },
              balance_transaction: { fee: 73 },
            },
          },
        },
      }),
    );
    const raw = eventBody("checkout.session.completed");
    const r = await gw().verifyWebhook(JSON.parse(raw), ctxFor(raw));
    expect(r.gatewayData).toMatchObject({
      fee: 0.73,
      amount: 25,
      currency: "USD",
      media: "link",
    });
  });

  it("refId cae a metadata.refId si no hay client_reference_id", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "checkout/sessions": { ...session, client_reference_id: null },
      }),
    );
    const raw = eventBody("checkout.session.completed");
    const r = await gw().verifyWebhook(JSON.parse(raw), ctxFor(raw));
    expect(r.refId).toBe("tkt_1");
  });

  it("sesión expirada → FAILED", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "checkout/sessions": {
          ...session,
          status: "expired",
          payment_status: "unpaid",
        },
      }),
    );
    const raw = eventBody("checkout.session.expired");
    const r = await gw().verifyWebhook(JSON.parse(raw), ctxFor(raw));
    expect(r.status).toBe("FAILED");
  });

  it("firma inválida → rechaza sin consultar la API", async () => {
    const fetchMock = mockFetch({ "checkout/sessions": session });
    vi.stubGlobal("fetch", fetchMock);
    const raw = eventBody("checkout.session.completed");
    await expect(
      gw().verifyWebhook(JSON.parse(raw), ctxFor(raw, "whsec_otro")),
    ).rejects.toThrow(/firma/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin header de firma → rechaza", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const raw = eventBody("checkout.session.completed");
    await expect(
      gw().verifyWebhook(JSON.parse(raw), { rawBody: raw, headers: {} }),
    ).rejects.toThrow(/firma/);
  });

  it("sin rawBody → rechaza (la firma no es verificable)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const raw = eventBody("checkout.session.completed");
    await expect(
      gw().verifyWebhook(JSON.parse(raw), {
        headers: { "stripe-signature": sign(raw, 1) },
      }),
    ).rejects.toThrow();
  });

  it("sin webhookSecret configurado → rechaza (fail-closed)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const raw = eventBody("checkout.session.completed");
    await expect(
      gw("").verifyWebhook(JSON.parse(raw), ctxFor(raw)),
    ).rejects.toThrow(/firma/);
  });

  it("timestamp con >5min de antigüedad → rechaza (replay)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const raw = eventBody("checkout.session.completed");
    const old = Math.floor(Date.now() / 1000) - 400;
    await expect(
      gw().verifyWebhook(JSON.parse(raw), ctxFor(raw, WH, old)),
    ).rejects.toThrow(/firma/);
  });

  it("sesión aún no terminal → error (Stripe reintenta)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "checkout/sessions": {
          ...session,
          status: "open",
          payment_status: "unpaid",
        },
      }),
    );
    const raw = eventBody("checkout.session.async_payment_succeeded");
    await expect(
      gw().verifyWebhook(JSON.parse(raw), ctxFor(raw)),
    ).rejects.toThrow(/no terminal/);
  });

  it("sesión sin refId → error", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "checkout/sessions": {
          ...session,
          client_reference_id: null,
          metadata: {},
        },
      }),
    );
    const raw = eventBody("checkout.session.completed");
    await expect(
      gw().verifyWebhook(JSON.parse(raw), ctxFor(raw)),
    ).rejects.toThrow(/refId/);
  });
});

describe("StripeGateway.refreshStatus", () => {
  const session = {
    id: "cs_abc123",
    status: "complete",
    payment_status: "paid",
    amount_total: 5000,
    currency: "clp",
    client_reference_id: "tkt_1",
    payment_method_types: ["card"],
    payment_intent: {
      latest_charge: {
        created: 1700000000,
        payment_method_details: { type: "card" },
        balance_transaction: { fee: 145 },
      },
    },
  };

  it("consulta la sesión por gatewayRef (cs_…) → PAID", async () => {
    const fetchMock = mockFetch({ "checkout/sessions": session });
    vi.stubGlobal("fetch", fetchMock);
    const r = await gw().refreshStatus("tkt_1", { gatewayRef: "cs_abc123" });
    expect(r.status).toBe("PAID");
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "/v1/checkout/sessions/cs_abc123",
    );
    expect(r.gatewayData).toMatchObject({ fee: 145, amount: 5000 });
  });

  it("open → PENDING; expired → FAILED", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "checkout/sessions": {
          ...session,
          status: "open",
          payment_status: "unpaid",
        },
      }),
    );
    expect(
      (await gw().refreshStatus("tkt_1", { gatewayRef: "cs_abc123" })).status,
    ).toBe("PENDING");
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "checkout/sessions": {
          ...session,
          status: "expired",
          payment_status: "unpaid",
        },
      }),
    );
    expect(
      (await gw().refreshStatus("tkt_1", { gatewayRef: "cs_abc123" })).status,
    ).toBe("FAILED");
  });

  it("sin gatewayRef → PENDING (no hay cómo consultar)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const r = await gw().refreshStatus("tkt_1", {});
    expect(r.status).toBe("PENDING");
  });
});

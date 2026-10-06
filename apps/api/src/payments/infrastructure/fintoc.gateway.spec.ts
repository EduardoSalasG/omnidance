import { createHmac } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { FintocGateway } from "./fintoc.gateway";

const KEY = "sk_test_fintoc";
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

const gw = () => new FintocGateway(KEY, WH, "https://api.fintoc.test");

afterEach(() => vi.unstubAllGlobals());

describe("FintocGateway.createOrder", () => {
  it("crea checkout session flow payment con metadata.refId", async () => {
    const fetchMock = mockFetch({
      checkout_sessions: {
        id: "cs_abc123",
        redirect_url: "https://pay.fintoc.com/cs_abc123",
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await gw().createOrder({
      refId: "tkt_evt-1_per-1_x",
      amount: 5000,
      email: "a@b.cl",
      returnUrl: "https://app/r",
      currency: "CLP",
    });
    expect(out).toEqual({
      paymentUrl: "https://pay.fintoc.com/cs_abc123",
      gatewayRef: "cs_abc123",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string },
    ];
    expect(url).toContain("/v2/checkout_sessions");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.flow).toBe("payment");
    expect(body.amount).toBe(5000);
    expect(body.currency).toBe("CLP");
    expect(body.customer_email).toBe("a@b.cl");
    expect(body.success_url).toBe("https://app/r");
    expect((body.metadata as Record<string, string>).refId).toBe(
      "tkt_evt-1_per-1_x",
    );
  });

  it("rechaza moneda no soportada (solo CLP/MXN)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      gw().createOrder({
        refId: "r",
        amount: 1,
        email: "e",
        returnUrl: "u",
        currency: "USD",
      }),
    ).rejects.toThrow(/moneda no soportada/);
  });

  it("falla si la respuesta no trae redirect_url", async () => {
    vi.stubGlobal("fetch", mockFetch({ checkout_sessions: { id: "cs_x" } }));
    await expect(
      gw().createOrder({
        refId: "r",
        amount: 1,
        email: "e",
        returnUrl: "u",
        currency: "CLP",
      }),
    ).rejects.toThrow(/redirect_url/);
  });
});

describe("FintocGateway.verifyWebhook", () => {
  const session = {
    id: "cs_abc123",
    status: "finished",
    amount: 5000,
    currency: "CLP",
    payment_method: "bank_transfer",
    metadata: { refId: "tkt_1" },
  };

  function eventBody(type: string) {
    return JSON.stringify({
      id: "evt_1",
      type,
      data: { id: "cs_abc123", object: "checkout_session" },
    });
  }

  function ctxFor(raw: string, secret = WH, t?: number) {
    return {
      rawBody: raw,
      headers: {
        "fintoc-signature": sign(raw, t ?? Math.floor(Date.now() / 1000), secret),
      },
    };
  }

  it("checkout_session.finished con firma válida → PAID + fetch-confirm", async () => {
    vi.stubGlobal("fetch", mockFetch({ checkout_sessions: session }));
    const raw = eventBody("checkout_session.finished");
    const r = await gw().verifyWebhook(JSON.parse(raw), ctxFor(raw));
    expect(r.refId).toBe("tkt_1");
    expect(r.status).toBe("PAID");
    expect(r.gatewayData).toMatchObject({
      amount: 5000,
      currency: "CLP",
      media: "bank_transfer",
    });
  });

  it("checkout_session.expired → FAILED", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ checkout_sessions: { ...session, status: "expired" } }),
    );
    const raw = eventBody("checkout_session.expired");
    const r = await gw().verifyWebhook(JSON.parse(raw), ctxFor(raw));
    expect(r.status).toBe("FAILED");
  });

  it("firma inválida → rechaza sin consultar la API", async () => {
    const fetchMock = mockFetch({ checkout_sessions: session });
    vi.stubGlobal("fetch", fetchMock);
    const raw = eventBody("checkout_session.finished");
    await expect(
      gw().verifyWebhook(JSON.parse(raw), ctxFor(raw, "whsec_otro")),
    ).rejects.toThrow(/firma/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin header de firma → rechaza", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const raw = eventBody("checkout_session.finished");
    await expect(
      gw().verifyWebhook(JSON.parse(raw), { rawBody: raw, headers: {} }),
    ).rejects.toThrow(/firma/);
  });

  it("sin rawBody → rechaza (la firma no es verificable)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const raw = eventBody("checkout_session.finished");
    await expect(
      gw().verifyWebhook(JSON.parse(raw), {
        headers: { "fintoc-signature": sign(raw, 1) },
      }),
    ).rejects.toThrow();
  });

  it("timestamp con >5min de antigüedad → rechaza (replay)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const raw = eventBody("checkout_session.finished");
    const old = Math.floor(Date.now() / 1000) - 400;
    await expect(
      gw().verifyWebhook(JSON.parse(raw), ctxFor(raw, WH, old)),
    ).rejects.toThrow(/firma/);
  });

  it("sesión aún no terminal → error (Fintoc reintenta)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ checkout_sessions: { ...session, status: "created" } }),
    );
    const raw = eventBody("checkout_session.finished");
    await expect(
      gw().verifyWebhook(JSON.parse(raw), ctxFor(raw)),
    ).rejects.toThrow(/no terminal/);
  });

  it("sesión sin metadata.refId → error", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        checkout_sessions: { ...session, metadata: {} },
      }),
    );
    const raw = eventBody("checkout_session.finished");
    await expect(
      gw().verifyWebhook(JSON.parse(raw), ctxFor(raw)),
    ).rejects.toThrow(/refId/);
  });
});

describe("FintocGateway.refreshStatus", () => {
  const session = {
    id: "cs_abc123",
    status: "finished",
    amount: 5000,
    currency: "CLP",
    payment_method: "bank_transfer",
    metadata: { refId: "tkt_1" },
  };

  it("consulta la sesión por gatewayRef (cs_…)", async () => {
    const fetchMock = mockFetch({ checkout_sessions: session });
    vi.stubGlobal("fetch", fetchMock);
    const r = await gw().refreshStatus("tkt_1", { gatewayRef: "cs_abc123" });
    expect(r.status).toBe("PAID");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/v2/checkout_sessions/cs_abc123",
    );
  });

  it("created → PENDING; expired → FAILED", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ checkout_sessions: { ...session, status: "created" } }),
    );
    expect(
      (await gw().refreshStatus("tkt_1", { gatewayRef: "cs_abc123" })).status,
    ).toBe("PENDING");
    vi.stubGlobal(
      "fetch",
      mockFetch({ checkout_sessions: { ...session, status: "expired" } }),
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

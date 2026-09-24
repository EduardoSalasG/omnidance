import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowGateway } from "./flow.gateway";
import { StubGateway } from "./stub.gateway";
import { resolveGateway } from "../payments.module";

const KEY = "test-api-key";
const SECRET = "test-secret-key";
const BASE = "https://sandbox.flow.cl/api";
const CONFIRM = "http://api.test/api/payments/webhook";

function makeGateway() {
  return new FlowGateway(KEY, SECRET, BASE, CONFIRM);
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
      expect(out).toBe("PAID");
    });

    it.each([
      [1, "PENDING"],
      [2, "PAID"],
      [3, "FAILED"],
      [4, "FAILED"],
    ])("status %i → %s", async (status, expected) => {
      mockFetch({ status });
      expect(await makeGateway().refreshStatus("r")).toBe(expected);
    });
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

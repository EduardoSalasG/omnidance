import { describe, it, expect, vi, afterEach } from "vitest";
import {
  StripeConnectClient,
  StripeConnectPayoutRail,
} from "./stripe-connect.rail";
import { ManualPayoutRail } from "./manual-payout.rail";
import { PayoutRequiresManualError } from "../domain/payout-rail";
import type { GatewayTxEntry } from "./gateway-transactions.service";

// StripeConnectPayoutRail (spec payouts/payout-rails): POST
// /v1/transfers form-encoded con Idempotency-Key payout:<id>, amount en
// minor units por la tabla zero-decimal y destination = acct_… del
// destino. ManualPayoutRail siempre rechaza con PAYOUT_REQUIRES_MANUAL.

const KEY = "sk_test_connect";

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

function headersOf(call: unknown[]): Record<string, string> {
  return (call[1] as { headers: Record<string, string> }).headers;
}

const rail = (onTx?: (e: GatewayTxEntry) => Promise<void>) =>
  new StripeConnectPayoutRail(KEY, "https://api.stripe.test", onTx);

afterEach(() => vi.unstubAllGlobals());

describe("StripeConnectPayoutRail.disburse", () => {
  it("crea el transfer form-encoded con destination, metadata e Idempotency-Key", async () => {
    const fetchMock = mockFetch({ "v1/transfers": { id: "tr_1" } });
    vi.stubGlobal("fetch", fetchMock);
    const out = await rail().disburse({
      payoutId: "po-1",
      amount: 30000,
      currency: "CLP",
      destinationRef: "acct_abc",
    });
    expect(out).toEqual({ ref: "tr_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string },
    ];
    expect(url).toBe("https://api.stripe.test/v1/transfers");
    expect(init.method).toBe("POST");
    const headers = headersOf(fetchMock.mock.calls[0] as unknown[]);
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    expect(headers["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(headers["idempotency-key"]).toBe("payout:po-1");
    const body = formOf(fetchMock.mock.calls[0] as unknown[]);
    // CLP zero-decimal: el monto va tal cual en minor units.
    expect(body.amount).toBe("30000");
    expect(body.currency).toBe("clp");
    expect(body.destination).toBe("acct_abc");
    expect(body["metadata[payoutId]"]).toBe("po-1");
  });

  it("USD convierte a minor units (×100)", async () => {
    const fetchMock = mockFetch({ "v1/transfers": { id: "tr_2" } });
    vi.stubGlobal("fetch", fetchMock);
    await rail().disburse({
      payoutId: "po-2",
      amount: 25,
      currency: "USD",
      destinationRef: "acct_us",
    });
    const body = formOf(fetchMock.mock.calls[0] as unknown[]);
    expect(body.amount).toBe("2500");
    expect(body.currency).toBe("usd");
  });

  it("audita el call como GatewayTxEntry provider STRIPE", async () => {
    const tx: GatewayTxEntry[] = [];
    vi.stubGlobal("fetch", mockFetch({ "v1/transfers": { id: "tr_3" } }));
    await rail(async (e) => {
      tx.push(e);
    }).disburse({
      payoutId: "po-3",
      amount: 1000,
      currency: "CLP",
      destinationRef: "acct_x",
    });
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({
      provider: "STRIPE",
      direction: "OUTBOUND",
      endpoint: "v1/transfers",
      httpStatus: 200,
      ok: true,
    });
  });

  it("error HTTP del proveedor propaga con su mensaje y audita ok:false", async () => {
    const tx: GatewayTxEntry[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { message: "insufficient available funds" },
            }),
            { status: 402 },
          ),
      ),
    );
    await expect(
      rail(async (e) => {
        tx.push(e);
      }).disburse({
        payoutId: "po-4",
        amount: 10,
        currency: "CLP",
        destinationRef: "acct_y",
      }),
    ).rejects.toThrow(/HTTP 402: insufficient available funds/);
    expect(tx[0]).toMatchObject({ ok: false, httpStatus: 402 });
  });

  it("respuesta sin id de transfer → error", async () => {
    vi.stubGlobal("fetch", mockFetch({ "v1/transfers": { object: "transfer" } }));
    await expect(
      rail().disburse({
        payoutId: "po-5",
        amount: 10,
        currency: "CLP",
        destinationRef: "acct_z",
      }),
    ).rejects.toThrow(/sin id/);
  });
});

describe("ManualPayoutRail", () => {
  it("disburse siempre rechaza con PAYOUT_REQUIRES_MANUAL", async () => {
    const manual = new ManualPayoutRail();
    expect(manual.name).toBe("MANUAL");
    const p = { payoutId: "po-1", amount: 1, currency: "CLP", destinationRef: "" };
    await expect(manual.disburse(p)).rejects.toBeInstanceOf(
      PayoutRequiresManualError,
    );
    await expect(manual.disburse(p)).rejects.toMatchObject({
      code: "PAYOUT_REQUIRES_MANUAL",
    });
  });
});

describe("StripeConnectClient - onboarding Express", () => {
  const client = () => new StripeConnectClient(KEY, "https://api.stripe.test");

  it("createExpressAccount postea type=express + capabilities + metadata del actor", async () => {
    const fetchMock = mockFetch({
      "v1/accounts": { id: "acct_new", default_currency: "clp" },
    });
    vi.stubGlobal("fetch", fetchMock);
    const acc = await client().createExpressAccount({
      country: "mx",
      actorType: "PRODUCER",
      actorId: "per-1",
    });
    expect(acc.id).toBe("acct_new");
    const body = formOf(fetchMock.mock.calls[0] as unknown[]);
    expect(body.type).toBe("express");
    expect(body.country).toBe("MX");
    expect(body["capabilities[card_payments][requested]"]).toBe("true");
    expect(body["capabilities[transfers][requested]"]).toBe("true");
    expect(body["metadata[actorType]"]).toBe("PRODUCER");
    expect(body["metadata[actorId]"]).toBe("per-1");
  });

  it("createAccountLink postea account_onboarding con refresh/return", async () => {
    const fetchMock = mockFetch({
      "v1/account_links": { url: "https://connect.stripe.test/l_1" },
    });
    vi.stubGlobal("fetch", fetchMock);
    const link = await client().createAccountLink({
      account: "acct_1",
      refresh_url: "https://app/productor/pagos",
      return_url: "https://app/productor/pagos",
    });
    expect(link.url).toBe("https://connect.stripe.test/l_1");
    const body = formOf(fetchMock.mock.calls[0] as unknown[]);
    expect(body.account).toBe("acct_1");
    expect(body.type).toBe("account_onboarding");
    expect(body.refresh_url).toBe("https://app/productor/pagos");
    expect(body.return_url).toBe("https://app/productor/pagos");
  });

  it("getAccount consulta GET /v1/accounts/:id", async () => {
    const fetchMock = mockFetch({
      "v1/accounts/acct_9": {
        id: "acct_9",
        details_submitted: true,
        charges_enabled: true,
        default_currency: "usd",
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const acc = await client().getAccount("acct_9");
    expect(acc.details_submitted).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string },
    ];
    expect(url).toBe("https://api.stripe.test/v1/accounts/acct_9");
    expect(init.method).toBe("GET");
  });
});

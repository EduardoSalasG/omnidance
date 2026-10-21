import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { PrismaService } from "../../prisma.service";
import type { GatewayTransactionsService } from "../infrastructure/gateway-transactions.service";
import { PayoutDestinationService } from "./payout-destination.service";

// PayoutDestinationService (spec payouts/payout-rails):
// - create: ownership regla /me/payouts (PRODUCER=personId, ACADEMY/VENUE
//   = ownerId) → cuenta Connect Express + Account Link → destino
//   PENDING. PENDING previo reutiliza externalId; ACTIVE → 409; sin
//   STRIPE_SECRET_KEY → 503.
// - listFor: solo destinos del actor + refresh best-effort de PENDING
//   (details_submitted && charges_enabled → ACTIVE + onboardedAt +
//   currency reportada). Fallo de fetch → lastError, nunca rompe.
// - resolveRail: ACTIVE con moneda calzada → rail Connect; sin match →
//   MANUAL con reason diagnóstico.
// PrismaService se simula in-memory; fetch se stubbea global.

type Row = Record<string, unknown>;

function matchWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const v = row[key];
    if (cond !== null && typeof cond === "object") {
      const c = cond as Row;
      if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

function pick(row: Row, select?: Row): Row {
  if (!select) return row;
  const out: Row = {};
  for (const [k, on] of Object.entries(select)) {
    if (on) out[k] = row[k];
  }
  return out;
}

class FakePrisma {
  academies: Row[] = [];
  venues: Row[] = [];
  payoutDestinations: Row[] = [];
  private seq = 0;

  academy = {
    findMany: async (args: { where: Row; select?: Row }) =>
      this.academies
        .filter((a) => matchWhere(a, args.where))
        .map((a) => pick(a, args.select)),
    findUnique: async (args: { where: Row; select?: Row }) => {
      const found = this.academies.find((a) => a.id === args.where.id);
      return found ? pick(found, args.select) : null;
    },
  };

  venue = {
    findMany: async (args: { where: Row; select?: Row }) =>
      this.venues
        .filter((v) => matchWhere(v, args.where))
        .map((v) => pick(v, args.select)),
    findUnique: async (args: { where: Row; select?: Row }) => {
      const found = this.venues.find((v) => v.id === args.where.id);
      return found ? pick(found, args.select) : null;
    },
  };

  payoutDestination = {
    findUnique: async (args: { where: Row }) => {
      const w = (args.where.actorType_actorId_rail ?? args.where) as Row;
      return (
        this.payoutDestinations.find((d) => matchWhere(d, w)) ?? null
      );
    },
    findMany: async (args?: { where?: Row }) => {
      const w = { ...(args?.where ?? {}) };
      const or = Array.isArray(w.OR) ? (w.OR as Row[]) : undefined;
      delete w.OR;
      return this.payoutDestinations.filter((d) => {
        if (Object.keys(w).length && !matchWhere(d, w)) return false;
        if (or) return or.some((o) => matchWhere(d, o));
        return true;
      });
    },
    create: async ({ data }: { data: Row }) => {
      const row = {
        id: `pd-${++this.seq}`,
        lastError: null,
        onboardedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      this.payoutDestinations.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = this.payoutDestinations.find((d) => d.id === where.id);
      if (!row) throw new Error("destino no encontrado");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };
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

function formOf(call: unknown[]): Record<string, string> {
  const init = call[1] as { body: string };
  return Object.fromEntries(new URLSearchParams(init.body));
}

let prisma: FakePrisma;
let svc: PayoutDestinationService;

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_svc");
  vi.stubEnv("STRIPE_BASE_URL", "https://api.stripe.test");
  vi.stubEnv("WEB_URL", "https://app.test");
  prisma = new FakePrisma();
  svc = new PayoutDestinationService(
    prisma as unknown as PrismaService,
    { record: async () => {} } as unknown as GatewayTransactionsService,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("PayoutDestinationService.create", () => {
  const account = { id: "acct_1", default_currency: "clp" };
  const link = { url: "https://connect.stripe.test/l_1" };

  it("productor propio: cuenta Express + Account Link → destino PENDING + onboardingUrl", async () => {
    const fetchMock = mockFetch({ "v1/accounts": account, "v1/account_links": link });
    vi.stubGlobal("fetch", fetchMock);
    const out = await svc.create("per-1", {
      actorType: "PRODUCER",
      actorId: "per-1",
      country: "MX",
    });
    expect(out.onboardingUrl).toBe("https://connect.stripe.test/l_1");
    expect(out.destination).toMatchObject({
      actorType: "PRODUCER",
      actorId: "per-1",
      rail: "STRIPE_CONNECT",
      externalId: "acct_1",
      country: "MX",
      // default_currency reportada, uppercase.
      currency: "CLP",
      status: "PENDING",
    });
    const linkBody = formOf(fetchMock.mock.calls[1] as unknown[]);
    expect(linkBody.account).toBe("acct_1");
    expect(linkBody.type).toBe("account_onboarding");
    // refresh/return aterrizan en la consola de pagos del productor.
    expect(linkBody.refresh_url).toBe("https://app.test/productor/pagos");
    expect(linkBody.return_url).toBe("https://app.test/productor/pagos");
  });

  it("academia propia (ownerId) crea destino igual", async () => {
    prisma.academies.push({ id: "ac-1", ownerId: "per-1" });
    vi.stubGlobal(
      "fetch",
      mockFetch({ "v1/accounts": account, "v1/account_links": link }),
    );
    const out = await svc.create("per-1", {
      actorType: "ACADEMY",
      actorId: "ac-1",
      country: "US",
    });
    expect(out.destination).toMatchObject({
      actorType: "ACADEMY",
      actorId: "ac-1",
      status: "PENDING",
    });
  });

  it("PENDING existente: reutiliza externalId y solo emite Account Link", async () => {
    prisma.payoutDestinations.push({
      id: "pd-1",
      actorType: "PRODUCER",
      actorId: "per-1",
      rail: "STRIPE_CONNECT",
      externalId: "acct_old",
      country: "CL",
      currency: "CLP",
      status: "PENDING",
      lastError: null,
      onboardedAt: null,
    });
    const fetchMock = mockFetch({ "v1/account_links": link });
    vi.stubGlobal("fetch", fetchMock);
    const out = await svc.create("per-1", {
      actorType: "PRODUCER",
      actorId: "per-1",
      country: "MX",
    });
    // Un solo fetch (account_links): nunca una segunda acct_ por actor.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("account_links");
    expect(out.destination.externalId).toBe("acct_old");
    expect(prisma.payoutDestinations).toHaveLength(1);
  });

  it("destino ACTIVE → 409 sin tocar Stripe", async () => {
    prisma.payoutDestinations.push({
      id: "pd-1",
      actorType: "PRODUCER",
      actorId: "per-1",
      rail: "STRIPE_CONNECT",
      externalId: "acct_act",
      country: "CL",
      currency: "CLP",
      status: "ACTIVE",
      lastError: null,
      onboardedAt: new Date(),
    });
    const fetchMock = mockFetch({});
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      svc.create("per-1", {
        actorType: "PRODUCER",
        actorId: "per-1",
        country: "MX",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("actor ajeno → Forbidden/NotFound sin crear cuenta ni destino", async () => {
    const fetchMock = mockFetch({ "v1/accounts": account, "v1/account_links": link });
    vi.stubGlobal("fetch", fetchMock);
    // PRODUCER que no es la persona.
    await expect(
      svc.create("per-1", {
        actorType: "PRODUCER",
        actorId: "per-ajena",
        country: "MX",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // Academia de otra persona.
    prisma.academies.push({ id: "ac-ajena", ownerId: "otra" });
    await expect(
      svc.create("per-1", {
        actorType: "ACADEMY",
        actorId: "ac-ajena",
        country: "MX",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // Venue inexistente.
    await expect(
      svc.create("per-1", {
        actorType: "VENUE",
        actorId: "ven-x",
        country: "MX",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.payoutDestinations).toHaveLength(0);
  });

  it("actorType desconocido → BadRequestException", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    await expect(
      svc.create("per-1", { actorType: "DJ", actorId: "dj-1", country: "MX" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("sin STRIPE_SECRET_KEY → 503 ServiceUnavailableException", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(
      svc.create("per-1", {
        actorType: "PRODUCER",
        actorId: "per-1",
        country: "MX",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe("PayoutDestinationService.listFor", () => {
  function dest(over: Row): Row {
    return {
      id: `pd-${prisma.payoutDestinations.length + 1}`,
      actorType: "PRODUCER",
      actorId: "per-1",
      rail: "STRIPE_CONNECT",
      externalId: "acct_1",
      country: "CL",
      currency: "CLP",
      status: "PENDING",
      lastError: null,
      onboardedAt: null,
      ...over,
    };
  }

  it("lista solo los destinos del actor (propio + academies/venues por ownerId)", async () => {
    prisma.academies.push({ id: "ac-1", ownerId: "per-1" });
    prisma.venues.push({ id: "ven-1", ownerId: "per-1" });
    prisma.payoutDestinations.push(
      dest({ id: "pd-prod" }),
      dest({ id: "pd-ac", actorType: "ACADEMY", actorId: "ac-1" }),
      dest({ id: "pd-ven", actorType: "VENUE", actorId: "ven-1" }),
      dest({ id: "pd-ajena", actorId: "per-ajena" }),
      dest({ id: "pd-acajena", actorType: "ACADEMY", actorId: "ac-ajena" }),
    );
    vi.stubGlobal(
      "fetch",
      mockFetch({ "v1/accounts/": { details_submitted: false, charges_enabled: false } }),
    );
    const list = await svc.listFor("per-1");
    expect(list.map((d) => d.id).sort()).toEqual(["pd-ac", "pd-prod", "pd-ven"]);
  });

  it("refresh: PENDING con cuenta operable → ACTIVE + onboardedAt + currency reportada", async () => {
    prisma.payoutDestinations.push(dest({ externalId: "acct_ok" }));
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "v1/accounts/acct_ok": {
          id: "acct_ok",
          details_submitted: true,
          charges_enabled: true,
          default_currency: "usd",
        },
      }),
    );
    const list = await svc.listFor("per-1");
    const d = list[0]!;
    expect(d.status).toBe("ACTIVE");
    expect(d.onboardedAt).toBeInstanceOf(Date);
    expect(d.currency).toBe("USD");
  });

  it("refresh: cuenta aún no operable → queda PENDING", async () => {
    prisma.payoutDestinations.push(dest({ externalId: "acct_pend" }));
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "v1/accounts/acct_pend": {
          id: "acct_pend",
          details_submitted: false,
          charges_enabled: false,
        },
      }),
    );
    const list = await svc.listFor("per-1");
    expect(list[0]!.status).toBe("PENDING");
    expect(list[0]!.onboardedAt).toBeNull();
  });

  it("fallo de fetch → lastError en el destino sin romper el listado", async () => {
    prisma.payoutDestinations.push(dest({ externalId: "acct_fail" }));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { message: "boom" } }),
            { status: 500 },
          ),
      ),
    );
    const list = await svc.listFor("per-1");
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe("PENDING");
    expect(String(list[0]!.lastError)).toContain("boom");
    expect(prisma.payoutDestinations[0]!.lastError).toBeTruthy();
  });

  it("no refresca destinos no-PENDING ni de otros rails", async () => {
    prisma.payoutDestinations.push(
      dest({ id: "pd-act", status: "ACTIVE", externalId: "acct_a" }),
      dest({ id: "pd-dis", status: "DISABLED", externalId: "acct_d" }),
    );
    const fetchMock = mockFetch({});
    vi.stubGlobal("fetch", fetchMock);
    const list = await svc.listFor("per-1");
    expect(list).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin Stripe configurado devuelve el listado sin refresh", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    prisma.payoutDestinations.push(dest({ externalId: "acct_x" }));
    const fetchMock = mockFetch({});
    vi.stubGlobal("fetch", fetchMock);
    const list = await svc.listFor("per-1");
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe("PENDING");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("PayoutDestinationService.resolveRail", () => {
  const connectDest = (over: Row = {}): Row => ({
    id: "pd-1",
    actorType: "PRODUCER",
    actorId: "per-1",
    rail: "STRIPE_CONNECT",
    externalId: "acct_1",
    country: "CL",
    currency: "CLP",
    status: "ACTIVE",
    lastError: null,
    onboardedAt: new Date(),
    ...over,
  });

  it("destino ACTIVE con moneda calzada → rail Connect + destination", async () => {
    prisma.payoutDestinations.push(connectDest());
    const r = await svc.resolveRail("PRODUCER", "per-1", "CLP");
    expect(r.kind).toBe("STRIPE_CONNECT");
    if (r.kind !== "STRIPE_CONNECT") return;
    expect(r.rail.name).toBe("STRIPE_CONNECT");
    expect(r.destination.externalId).toBe("acct_1");
    // El rail resuelto efectivamente llama /v1/transfers al desembolsar.
    vi.stubGlobal("fetch", mockFetch({ "v1/transfers": { id: "tr_9" } }));
    const out = await r.rail.disburse({
      payoutId: "po-9",
      amount: 5000,
      currency: "CLP",
      destinationRef: r.destination.externalId,
    });
    expect(out.ref).toBe("tr_9");
  });

  it("moneda distinta → MANUAL con CURRENCY_MISMATCH notado", async () => {
    prisma.payoutDestinations.push(connectDest({ currency: "USD" }));
    const r = await svc.resolveRail("PRODUCER", "per-1", "CLP");
    expect(r.kind).toBe("MANUAL");
    if (r.kind !== "MANUAL") return;
    expect(r.reason).toContain("CURRENCY_MISMATCH");
    await expect(
      r.rail.disburse({
        payoutId: "po-1",
        amount: 1,
        currency: "CLP",
        destinationRef: "",
      }),
    ).rejects.toThrowError();
  });

  it("sin destino ACTIVE → MANUAL NO_DESTINATION (PENDING no cuenta)", async () => {
    prisma.payoutDestinations.push(connectDest({ status: "PENDING" }));
    const r = await svc.resolveRail("PRODUCER", "per-1", "CLP");
    expect(r.kind).toBe("MANUAL");
    if (r.kind === "MANUAL") expect(r.reason).toBe("NO_DESTINATION");
    const r2 = await svc.resolveRail("PRODUCER", "per-sin-nada", "CLP");
    expect(r2.kind).toBe("MANUAL");
  });

  it("destino ACTIVE pero sin STRIPE_SECRET_KEY → MANUAL STRIPE_NOT_CONFIGURED", async () => {
    prisma.payoutDestinations.push(connectDest());
    delete process.env.STRIPE_SECRET_KEY;
    const r = await svc.resolveRail("PRODUCER", "per-1", "CLP");
    expect(r.kind).toBe("MANUAL");
    if (r.kind === "MANUAL") expect(r.reason).toBe("STRIPE_NOT_CONFIGURED");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import type { DiscountCode, DiscountRedemption } from "@prisma/client";
import {
  DiscountsService,
  DiscountCodeNotFoundError,
  DiscountForbiddenError,
  DiscountScopeNotFoundError,
  DuplicateDiscountCodeError,
  InvalidDiscountCodeError,
  isRedeemable,
  validateCreateCode,
} from "./discounts.service";
import type {
  CreateDiscountCodeData,
  DiscountCodeFilter,
  DiscountsRepo,
  ListedDiscountCode,
  PagedList,
  ListedRedemption,
} from "./ports";

// ─── Fake repo in-memory ───
class FakeDiscountsRepo implements DiscountsRepo {
  codes: DiscountCode[] = [];
  redemptions: DiscountRedemption[] = [];
  createdWith: CreateDiscountCodeData[] = [];
  /** Scope ownership: evento/serie → producerId dueño. */
  events = new Map<string, { id: string; producerId: string | null }>();
  series = new Map<string, { id: string; producerId: string }>();
  /** RBAC simulado: permisos por personId + superusers. */
  permissions = new Map<string, Set<string>>();
  superusers = new Set<string>();
  private seq = 0;

  async findEventById(id: string) {
    return this.events.get(id) ?? null;
  }

  async findSeriesById(id: string) {
    return this.series.get(id) ?? null;
  }

  async personHasPermission(personId: string, permissionKey: string) {
    return (
      this.superusers.has(personId) ||
      (this.permissions.get(personId)?.has(permissionKey) ?? false)
    );
  }

  async findByCode(code: string) {
    return this.codes.find((c) => c.code === code) ?? null;
  }

  async findById(id: string) {
    return this.codes.find((c) => c.id === id) ?? null;
  }

  async create(data: CreateDiscountCodeData) {
    this.createdWith.push(data);
    const code: DiscountCode = {
      id: `dc-${++this.seq}`,
      code: data.code,
      type: data.type,
      eventId: data.eventId,
      seriesId: data.seriesId,
      percentOff: data.percentOff,
      amountOff: data.amountOff,
      maxUses: data.maxUses,
      usedCount: 0,
      createdById: data.createdById,
      expiresAt: data.expiresAt,
      academySaleAgreementId: null,
      createdAt: new Date(),
    };
    this.codes.push(code);
    return code;
  }

  async list(
    filter: DiscountCodeFilter,
  ): Promise<PagedList<ListedDiscountCode>> {
    const items = this.codes
      .filter(
        (c) =>
          (filter.eventId === undefined || c.eventId === filter.eventId) &&
          (filter.seriesId === undefined || c.seriesId === filter.seriesId) &&
          (filter.createdById === undefined ||
            c.createdById === filter.createdById),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((c) => ({
        id: c.id,
        code: c.code,
        type: c.type,
        eventId: c.eventId,
        seriesId: c.seriesId,
        percentOff: c.percentOff,
        amountOff: c.amountOff,
        usedCount: c.usedCount,
        maxUses: c.maxUses,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
      }));
    return {
      items: items.slice(
        filter.skip ?? 0,
        (filter.skip ?? 0) + (filter.take ?? items.length),
      ),
      total: items.length,
    };
  }

  async listRedemptions(codeId: string): Promise<ListedRedemption[]> {
    return this.redemptions
      .filter((r) => r.codeId === codeId)
      .sort((a, b) => b.redeemedAt.getTime() - a.redeemedAt.getTime())
      .map((r) => ({
        id: r.id,
        personId: r.personId,
        paymentId: r.paymentId,
        redeemedAt: r.redeemedAt,
        person: { personId: r.personId, name: `P ${r.personId}` },
      }));
  }
}

const mkCode = (over: Partial<DiscountCode>): DiscountCode => ({
  id: "dc-1",
  code: "PROMO10",
  type: "CAMPAIGN",
  eventId: null,
  seriesId: null,
  percentOff: 10,
  amountOff: null,
  maxUses: null,
  usedCount: 0,
  createdById: "admin-1",
  expiresAt: null,
  academySaleAgreementId: null,
  createdAt: new Date(),
  ...over,
});

const mkRedemption = (
  over: Partial<DiscountRedemption>,
): DiscountRedemption => ({
  id: "red-1",
  codeId: "dc-1",
  personId: "per-1",
  paymentId: null,
  redeemedAt: new Date(),
  ...over,
});

// ─── validateCreateCode (función pura) ───

describe("validateCreateCode", () => {
  const base = { code: "PROMO10", type: "CAMPAIGN", percentOff: 10 };

  it("acepta un input válido con percentOff y normaliza nulos", () => {
    const out = validateCreateCode(base);
    expect(out).toEqual({
      code: "PROMO10",
      type: "CAMPAIGN",
      eventId: null,
      seriesId: null,
      percentOff: 10,
      amountOff: null,
      maxUses: null,
      expiresAt: null,
    });
  });

  it("acepta amountOff solo (XOR)", () => {
    const out = validateCreateCode({ code: "CORT", type: "CORTESIA", amountOff: 3000 });
    expect(out.amountOff).toBe(3000);
    expect(out.percentOff).toBeNull();
  });

  it("type fuera del enum → InvalidDiscountCodeError", () => {
    expect(() =>
      validateCreateCode({ code: "X", type: "GRATIS", percentOff: 10 }),
    ).toThrow(InvalidDiscountCodeError);
  });

  it("sin percentOff ni amountOff → InvalidDiscountCodeError", () => {
    expect(() =>
      validateCreateCode({ code: "X", type: "CAMPAIGN" }),
    ).toThrow(InvalidDiscountCodeError);
  });

  it("percentOff y amountOff juntos → InvalidDiscountCodeError", () => {
    expect(() =>
      validateCreateCode({
        code: "X",
        type: "CAMPAIGN",
        percentOff: 10,
        amountOff: 500,
      }),
    ).toThrow(InvalidDiscountCodeError);
  });

  it("percentOff fuera de 1..100 → InvalidDiscountCodeError", () => {
    for (const percentOff of [0, 101, -5]) {
      expect(() =>
        validateCreateCode({ code: "X", type: "CAMPAIGN", percentOff }),
      ).toThrow(InvalidDiscountCodeError);
    }
  });

  it("amountOff <= 0 → InvalidDiscountCodeError", () => {
    expect(() =>
      validateCreateCode({ code: "X", type: "CORTESIA", amountOff: 0 }),
    ).toThrow(InvalidDiscountCodeError);
  });

  it("code vacío o solo espacios → InvalidDiscountCodeError", () => {
    for (const code of ["", "   "]) {
      expect(() =>
        validateCreateCode({ code, type: "CAMPAIGN", percentOff: 10 }),
      ).toThrow(InvalidDiscountCodeError);
    }
  });

  it("code se normaliza con trim", () => {
    const out = validateCreateCode({
      code: "  PROMO10  ",
      type: "CAMPAIGN",
      percentOff: 10,
    });
    expect(out.code).toBe("PROMO10");
  });

  it("maxUses < 1 → InvalidDiscountCodeError", () => {
    expect(() =>
      validateCreateCode({
        code: "X",
        type: "CAMPAIGN",
        percentOff: 10,
        maxUses: 0,
      }),
    ).toThrow(InvalidDiscountCodeError);
  });

  it("conserva eventId/seriesId/expiresAt cuando vienen", () => {
    const expiresAt = new Date("2030-01-01");
    const out = validateCreateCode({
      code: "X",
      type: "WINBACK",
      amountOff: 1000,
      eventId: "evt-1",
      seriesId: "ser-1",
      maxUses: 5,
      expiresAt,
    });
    expect(out.eventId).toBe("evt-1");
    expect(out.seriesId).toBe("ser-1");
    expect(out.maxUses).toBe(5);
    expect(out.expiresAt).toBe(expiresAt);
  });
});

// ─── isRedeemable (función pura) ───

describe("isRedeemable", () => {
  const now = new Date("2026-01-15T00:00:00Z");

  it("código global vigente y sin cupo → ok", () => {
    expect(isRedeemable(mkCode({}), { now })).toEqual({ ok: true });
  });

  it("expirado (expiresAt <= now) → EXPIRED", () => {
    const code = mkCode({ expiresAt: new Date("2026-01-14T23:59:59Z") });
    expect(isRedeemable(code, { now })).toEqual({
      ok: false,
      reason: "EXPIRED",
    });
  });

  it("expiresAt en el futuro → ok", () => {
    const code = mkCode({ expiresAt: new Date("2026-01-15T00:00:01Z") });
    expect(isRedeemable(code, { now })).toEqual({ ok: true });
  });

  it("cupo agotado (usedCount >= maxUses) → EXHAUSTED", () => {
    const code = mkCode({ maxUses: 3, usedCount: 3 });
    expect(isRedeemable(code, { now })).toEqual({
      ok: false,
      reason: "EXHAUSTED",
    });
  });

  it("cupo con usos restantes → ok", () => {
    const code = mkCode({ maxUses: 3, usedCount: 2 });
    expect(isRedeemable(code, { now })).toEqual({ ok: true });
  });

  it("scoped a evento: mismo eventId → ok, otro/ausente → SCOPE_MISMATCH", () => {
    const code = mkCode({ eventId: "evt-1" });
    expect(isRedeemable(code, { now, eventId: "evt-1" })).toEqual({
      ok: true,
    });
    expect(isRedeemable(code, { now, eventId: "evt-2" })).toEqual({
      ok: false,
      reason: "SCOPE_MISMATCH",
    });
    expect(isRedeemable(code, { now })).toEqual({
      ok: false,
      reason: "SCOPE_MISMATCH",
    });
  });

  it("scoped a serie: mismo seriesId → ok, otro → SCOPE_MISMATCH", () => {
    const code = mkCode({ seriesId: "ser-1" });
    expect(isRedeemable(code, { now, seriesId: "ser-1" })).toEqual({
      ok: true,
    });
    expect(isRedeemable(code, { now, seriesId: "ser-9" })).toEqual({
      ok: false,
      reason: "SCOPE_MISMATCH",
    });
  });
});

// ─── DiscountsService.create ───

describe("DiscountsService.create", () => {
  let repo: FakeDiscountsRepo;
  let svc: DiscountsService;

  beforeEach(() => {
    repo = new FakeDiscountsRepo();
    repo.superusers.add("admin-1");
    svc = new DiscountsService(repo);
  });

  it("crea código con tracking completo (createdById, scope, cupo)", async () => {
    const code = await svc.create(
      {
        code: "CUMPLE-ANA",
        type: "CUMPLEANOS",
        percentOff: 50,
        eventId: "evt-1",
        maxUses: 10,
      },
      "admin-1",
    );
    expect(code.code).toBe("CUMPLE-ANA");
    expect(code.type).toBe("CUMPLEANOS");
    expect(code.createdById).toBe("admin-1");
    expect(code.eventId).toBe("evt-1");
    expect(code.maxUses).toBe(10);
    expect(code.usedCount).toBe(0);
    expect(repo.createdWith).toHaveLength(1);
  });

  it("code duplicado → DuplicateDiscountCodeError, no crea", async () => {
    repo.codes.push(mkCode({ code: "PROMO10" }));
    await expect(
      svc.create({ code: "PROMO10", type: "CAMPAIGN", percentOff: 10 }, "a"),
    ).rejects.toBeInstanceOf(DuplicateDiscountCodeError);
    expect(repo.createdWith).toHaveLength(0);
  });

  it("input inválido → InvalidDiscountCodeError antes de tocar el repo", async () => {
    await expect(
      svc.create({ code: "X", type: "LIBRE", percentOff: 10 }, "a"),
    ).rejects.toBeInstanceOf(InvalidDiscountCodeError);
    expect(repo.createdWith).toHaveLength(0);
  });

  // ─── scope ownership (spec event-access-scope) ───

  it("scoped a evento propio del productor → crea", async () => {
    repo.events.set("evt-1", { id: "evt-1", producerId: "prod-1" });
    const code = await svc.create(
      { code: "EVT10", type: "CAMPAIGN", percentOff: 10, eventId: "evt-1" },
      "prod-1",
    );
    expect(code.eventId).toBe("evt-1");
    expect(code.createdById).toBe("prod-1");
  });

  it("scoped a evento de otro productor → DiscountForbiddenError, no persiste", async () => {
    repo.events.set("evt-1", { id: "evt-1", producerId: "prod-otro" });
    await expect(
      svc.create(
        { code: "AJENO", type: "CORTESIA", amountOff: 1000, eventId: "evt-1" },
        "prod-1",
      ),
    ).rejects.toBeInstanceOf(DiscountForbiddenError);
    expect(repo.createdWith).toHaveLength(0);
  });

  it("scoped a evento inexistente → DiscountScopeNotFoundError (no-admin)", async () => {
    await expect(
      svc.create(
        { code: "GHOST", type: "CAMPAIGN", percentOff: 10, eventId: "evt-x" },
        "prod-1",
      ),
    ).rejects.toBeInstanceOf(DiscountScopeNotFoundError);
  });

  it("scoped a serie propia → crea; serie ajena → DiscountForbiddenError", async () => {
    repo.series.set("ser-1", { id: "ser-1", producerId: "prod-1" });
    const code = await svc.create(
      { code: "SER10", type: "CAMPAIGN", percentOff: 10, seriesId: "ser-1" },
      "prod-1",
    );
    expect(code.seriesId).toBe("ser-1");

    repo.series.set("ser-9", { id: "ser-9", producerId: "prod-otro" });
    await expect(
      svc.create(
        { code: "SERX", type: "CAMPAIGN", percentOff: 10, seriesId: "ser-9" },
        "prod-1",
      ),
    ).rejects.toBeInstanceOf(DiscountForbiddenError);
  });

  it("admin crea scoped a recurso ajeno o inexistente → OK (bypass)", async () => {
    repo.events.set("evt-1", { id: "evt-1", producerId: "prod-otro" });
    const code = await svc.create(
      { code: "ADMIN10", type: "CAMPAIGN", percentOff: 10, eventId: "evt-1" },
      "admin-1",
    );
    expect(code.eventId).toBe("evt-1");
  });

  it("sin scope no exige ownership → crea igual que antes", async () => {
    const code = await svc.create(
      { code: "GLOBAL", type: "WINBACK", percentOff: 15 },
      "prod-1",
    );
    expect(code.eventId).toBeNull();
    expect(code.createdById).toBe("prod-1");
  });
});

// ─── DiscountsService.list ───

describe("DiscountsService.list", () => {
  let repo: FakeDiscountsRepo;
  let svc: DiscountsService;

  beforeEach(() => {
    repo = new FakeDiscountsRepo();
    repo.superusers.add("admin-1");
    svc = new DiscountsService(repo);
  });

  it("admin lista ordenada por createdAt desc con campos de tracking", async () => {
    repo.codes.push(
      mkCode({ id: "a", code: "OLD", createdAt: new Date("2026-01-01") }),
      mkCode({ id: "b", code: "NEW", createdAt: new Date("2026-02-01") }),
    );
    const list = (await svc.list({}, { id: "admin-1" })).items;
    expect(list.map((c) => c.code)).toEqual(["NEW", "OLD"]);
    expect(list[0]).toMatchObject({
      code: "NEW",
      type: "CAMPAIGN",
      usedCount: 0,
      maxUses: null,
    });
  });

  it("filtra por eventId", async () => {
    repo.codes.push(
      mkCode({ id: "a", code: "EVT", eventId: "evt-1" }),
      mkCode({ id: "b", code: "OTRO", eventId: "evt-2" }),
      mkCode({ id: "c", code: "GLOBAL" }),
    );
    const list = (await svc.list({ eventId: "evt-1" }, { id: "admin-1" }))
      .items;
    expect(list.map((c) => c.code)).toEqual(["EVT"]);
  });

  it("filtra por seriesId", async () => {
    repo.codes.push(
      mkCode({ id: "a", code: "SER", seriesId: "ser-1" }),
      mkCode({ id: "b", code: "GLOBAL" }),
    );
    const list = (await svc.list({ seriesId: "ser-1" }, { id: "admin-1" }))
      .items;
    expect(list.map((c) => c.code)).toEqual(["SER"]);
  });

  it("no-admin ve solo sus códigos (spec event-access-scope)", async () => {
    repo.codes.push(
      mkCode({ id: "a", code: "MIO", createdById: "prod-1" }),
      mkCode({ id: "b", code: "AJENO", createdById: "prod-2" }),
      mkCode({ id: "c", code: "MIO2", createdById: "prod-1" }),
    );
    const list = (await svc.list({}, { id: "prod-1" })).items;
    expect(list.map((c) => c.code).sort()).toEqual(["MIO", "MIO2"]);
  });

  it("admin ve códigos de todos los actores", async () => {
    repo.codes.push(
      mkCode({ id: "a", code: "P1", createdById: "prod-1" }),
      mkCode({ id: "b", code: "P2", createdById: "prod-2" }),
    );
    const list = (await svc.list({}, { id: "admin-1" })).items;
    expect(list).toHaveLength(2);
  });
});

// ─── DiscountsService.listRedemptions ───

describe("DiscountsService.detail / listRedemptions", () => {
  let repo: FakeDiscountsRepo;
  let svc: DiscountsService;

  beforeEach(() => {
    repo = new FakeDiscountsRepo();
    repo.superusers.add("admin-1");
    svc = new DiscountsService(repo);
  });

  it("lista redemptions del código con personId/paymentId/redeemedAt", async () => {
    repo.codes.push(mkCode({ id: "dc-1" }));
    repo.redemptions.push(
      mkRedemption({ id: "r1", codeId: "dc-1", personId: "per-1" }),
      mkRedemption({
        id: "r2",
        codeId: "dc-1",
        personId: "per-2",
        paymentId: "pay-9",
      }),
      mkRedemption({ id: "r3", codeId: "otro", personId: "per-3" }),
    );
    const list = await svc.listRedemptions("dc-1", { id: "admin-1" });
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.personId).sort()).toEqual(["per-1", "per-2"]);
    const withPayment = list.find((r) => r.id === "r2");
    expect(withPayment?.paymentId).toBe("pay-9");
  });

  it("código inexistente → DiscountCodeNotFoundError", async () => {
    await expect(
      svc.listRedemptions("fantasma", { id: "admin-1" }),
    ).rejects.toBeInstanceOf(DiscountCodeNotFoundError);
  });

  it("detail: el creador ve su código; admin también", async () => {
    repo.codes.push(mkCode({ id: "dc-1", createdById: "prod-1" }));
    await expect(
      svc.detail("dc-1", { id: "prod-1" }),
    ).resolves.toMatchObject({ id: "dc-1" });
    await expect(
      svc.detail("dc-1", { id: "admin-1" }),
    ).resolves.toMatchObject({ id: "dc-1" });
  });

  it("detail/redemptions de código ajeno → DiscountCodeNotFoundError (spec event-access-scope)", async () => {
    repo.codes.push(mkCode({ id: "dc-1", createdById: "prod-1" }));
    await expect(svc.detail("dc-1", { id: "prod-2" })).rejects.toBeInstanceOf(
      DiscountCodeNotFoundError,
    );
    await expect(
      svc.listRedemptions("dc-1", { id: "prod-2" }),
    ).rejects.toBeInstanceOf(DiscountCodeNotFoundError);
  });
});

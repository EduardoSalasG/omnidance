import { describe, it, expect, beforeEach } from "vitest";
import type { DiscountCode, DiscountRedemption } from "@prisma/client";
import {
  DiscountsService,
  DiscountCodeNotFoundError,
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
  ListedRedemption,
} from "./ports";

// ─── Fake repo in-memory ───
class FakeDiscountsRepo implements DiscountsRepo {
  codes: DiscountCode[] = [];
  redemptions: DiscountRedemption[] = [];
  createdWith: CreateDiscountCodeData[] = [];
  private seq = 0;

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
      createdAt: new Date(),
    };
    this.codes.push(code);
    return code;
  }

  async list(filter: DiscountCodeFilter): Promise<ListedDiscountCode[]> {
    return this.codes
      .filter(
        (c) =>
          (filter.eventId === undefined || c.eventId === filter.eventId) &&
          (filter.seriesId === undefined || c.seriesId === filter.seriesId),
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
});

// ─── DiscountsService.list ───

describe("DiscountsService.list", () => {
  let repo: FakeDiscountsRepo;
  let svc: DiscountsService;

  beforeEach(() => {
    repo = new FakeDiscountsRepo();
    svc = new DiscountsService(repo);
  });

  it("lista ordenada por createdAt desc con campos de tracking", async () => {
    repo.codes.push(
      mkCode({ id: "a", code: "OLD", createdAt: new Date("2026-01-01") }),
      mkCode({ id: "b", code: "NEW", createdAt: new Date("2026-02-01") }),
    );
    const list = await svc.list({});
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
    const list = await svc.list({ eventId: "evt-1" });
    expect(list.map((c) => c.code)).toEqual(["EVT"]);
  });

  it("filtra por seriesId", async () => {
    repo.codes.push(
      mkCode({ id: "a", code: "SER", seriesId: "ser-1" }),
      mkCode({ id: "b", code: "GLOBAL" }),
    );
    const list = await svc.list({ seriesId: "ser-1" });
    expect(list.map((c) => c.code)).toEqual(["SER"]);
  });
});

// ─── DiscountsService.listRedemptions ───

describe("DiscountsService.listRedemptions", () => {
  let repo: FakeDiscountsRepo;
  let svc: DiscountsService;

  beforeEach(() => {
    repo = new FakeDiscountsRepo();
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
    const list = await svc.listRedemptions("dc-1");
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.personId).sort()).toEqual(["per-1", "per-2"]);
    const withPayment = list.find((r) => r.id === "r2");
    expect(withPayment?.paymentId).toBe("pay-9");
  });

  it("código inexistente → DiscountCodeNotFoundError", async () => {
    await expect(svc.listRedemptions("fantasma")).rejects.toBeInstanceOf(
      DiscountCodeNotFoundError,
    );
  });
});

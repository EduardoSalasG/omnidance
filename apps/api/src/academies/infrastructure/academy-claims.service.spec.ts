import { describe, expect, it, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { AcademyClaimsService } from "./academy-claims.service";
import type { StoredFile } from "../../storage/storage.service";
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";

const ACADEMY = "ac-1";
const PERSON = "per-1";
const PLAN = "plan-1";
const METHOD = "met-1";
const PNG: StoredFile = {
  originalname: "comprobante.png",
  mimetype: "image/png",
  buffer: Buffer.from("img"),
  size: 128,
};

type Row = Record<string, any>;

function mkPrisma() {
  const methods: Row[] = [
    {
      id: METHOD,
      academyId: ACADEMY,
      type: "TRANSFER",
      label: "Transferencia",
      details: { bank: "Estado", rut: "1-2" },
      active: true,
      order: 0,
    },
    {
      id: "met-off",
      academyId: ACADEMY,
      type: "CASH",
      label: "Efectivo",
      details: {},
      active: false,
      order: 1,
    },
  ];
  const plans: Row[] = [
    {
      id: PLAN,
      academyId: ACADEMY,
      name: "Mensual",
      price: 25000,
      active: true,
      type: "MONTHLY",
      periodDays: 30,
    },
    {
      id: "plan-off",
      academyId: ACADEMY,
      name: "Inactivo",
      price: 10000,
      active: false,
      type: "MONTHLY",
      periodDays: 30,
    },
    {
      id: "plan-other",
      academyId: "ac-2",
      name: "Ajeno",
      price: 5000,
      active: true,
      type: "MONTHLY",
      periodDays: 30,
    },
  ];
  const claims: Row[] = [];
  const enrollments: Row[] = [
    { id: "enr-1", academyId: ACADEMY, personId: PERSON, status: "ACTIVE", endsAt: null },
  ];
  const persons: Row[] = [{ id: PERSON, name: "Alumno" }];

  const matchWhere = (row: Row, where: Row | undefined): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([k, cond]) => {
      if (cond !== null && typeof cond === "object") {
        if ("in" in cond) return (cond.in as unknown[]).includes(row[k]);
        if ("not" in cond) return row[k] !== cond.not;
        if ("gt" in cond) return row[k] > cond.gt;
        if ("OR" in cond) {
          return (cond as Row[]).some((w) => matchWhere(row, w));
        }
      }
      if (Array.isArray(cond)) return false;
      return row[k] === cond;
    });
  };

  const matchOr = (row: Row, where: Row): boolean => {
    const { OR, ...rest } = where;
    const base = matchWhere(row, rest);
    if (!OR) return base;
    return base && (OR as Row[]).some((w) => matchWhere(row, w));
  };

  return {
    data: { methods, plans, claims, enrollments, persons },
    prisma: {
      academyPaymentMethod: {
        findMany: vi.fn(async ({ where }: Row = {}) =>
          methods.filter((m) => matchWhere(m, where)),
        ),
        findFirst: vi.fn(
          async ({ where }: Row) =>
            methods.find((m) => matchWhere(m, where)) ?? null,
        ),
      },
      membershipPlan: {
        findFirst: vi.fn(
          async ({ where }: Row) =>
            plans.find((p) => matchWhere(p, where)) ?? null,
        ),
        findUnique: vi.fn(
          async ({ where }: Row) =>
            plans.find((p) => p.id === where.id) ?? null,
        ),
      },
      enrollment: {
        findFirst: vi.fn(
          async ({ where }: Row) =>
            enrollments.find((e) => matchWhere(e, where)) ?? null,
        ),
      },
      paymentClaim: {
        findFirst: vi.fn(async ({ where }: Row) => {
          return claims.find((c) => matchOr(c, where)) ?? null;
        }),
        findMany: vi.fn(async ({ where }: Row = {}) =>
          claims.filter((c) => matchOr(c, where)),
        ),
        create: vi.fn(async ({ data }: Row) => {
          const row = {
            id: `claim-${claims.length + 1}`,
            status: "PENDING",
            createdAt: new Date(claims.length),
            ...data,
          };
          claims.push(row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: Row) => {
          const row = claims.find((c) => c.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        }),
        delete: vi.fn(async ({ where }: Row) => {
          const idx = claims.findIndex((c) => c.id === where.id);
          return claims.splice(idx, 1)[0];
        }),
      },
      person: {
        findUnique: vi.fn(
          async ({ where }: Row) =>
            persons.find((p) => p.id === where.id) ?? null,
        ),
      },
      academy: {
        findUnique: vi.fn(async ({ where }: Row) =>
          where.id === ACADEMY
            ? { id: ACADEMY, name: "Academia", ownerId: "owner-1" }
            : null,
        ),
      },
    },
  };
}

function mkService() {
  const fx = mkPrisma();
  const storage = {
    save: vi.fn(async () => `claims/${ACADEMY}/rcpt.png`),
    read: vi.fn(async () => Buffer.from("img")),
  };
  const notifications = { notifySafe: vi.fn(async () => undefined) };
  const service = new AcademyClaimsService(
    fx.prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    storage as never,
  );
  return { fx, service, storage, notifications };
}

const academy = { name: "Academia", ownerId: "owner-1" };

describe("AcademyClaimsService.createIntent", () => {
  it("crea un claim AWAITING con snapshot de monto y método", async () => {
    const { service, fx } = mkService();
    const claim = await service.createIntent(ACADEMY, PERSON, {
      planId: PLAN,
      methodId: METHOD,
    });
    expect(claim.status).toBe("AWAITING");
    expect(claim.receiptKey ?? null).toBeNull();
    expect(claim.amount).toBe(25000);
    expect(claim.methodType).toBe("TRANSFER");
    expect(claim.methodLabel).toBe("Transferencia");
    expect(claim.planId).toBe(PLAN);
    expect(claim.enrollmentId).toBe("enr-1");
    expect(fx.data.claims).toHaveLength(1);
  });

  it("es idempotente: re-seleccionar devuelve el claim AWAITING existente", async () => {
    const { service, fx } = mkService();
    const first = await service.createIntent(ACADEMY, PERSON, {
      planId: PLAN,
      methodId: METHOD,
    });
    const second = await service.createIntent(ACADEMY, PERSON, {
      planId: PLAN,
      methodId: METHOD,
    });
    expect(second.id).toBe(first.id);
    expect(fx.data.claims).toHaveLength(1);
  });

  it("devuelve el PENDING existente en vez de duplicar", async () => {
    const { service, fx } = mkService();
    fx.data.claims.push({
      id: "claim-x",
      academyId: ACADEMY,
      personId: PERSON,
      planId: PLAN,
      status: "PENDING",
    });
    const claim = await service.createIntent(ACADEMY, PERSON, {
      planId: PLAN,
      methodId: METHOD,
    });
    expect(claim.id).toBe("claim-x");
    expect(fx.data.claims).toHaveLength(1);
  });

  it("permite un intento nuevo si el anterior fue REJECTED", async () => {
    const { service, fx } = mkService();
    fx.data.claims.push({
      id: "claim-old",
      academyId: ACADEMY,
      personId: PERSON,
      planId: PLAN,
      status: "REJECTED",
    });
    const claim = await service.createIntent(ACADEMY, PERSON, {
      planId: PLAN,
      methodId: METHOD,
    });
    expect(claim.id).not.toBe("claim-old");
    expect(claim.status).toBe("AWAITING");
  });

  it("rechaza método inactivo, plan inactivo y plan ajeno", async () => {
    const { service } = mkService();
    await expect(
      service.createIntent(ACADEMY, PERSON, {
        planId: PLAN,
        methodId: "met-off",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createIntent(ACADEMY, PERSON, {
        planId: "plan-off",
        methodId: METHOD,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createIntent(ACADEMY, PERSON, {
        planId: "plan-other",
        methodId: METHOD,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AcademyClaimsService.attachReceipt", () => {
  async function awaitingClaim() {
    const ctx = mkService();
    const claim = await ctx.service.createIntent(ACADEMY, PERSON, {
      planId: PLAN,
      methodId: METHOD,
    });
    return { ...ctx, claim };
  }

  it("guarda el archivo, setea receiptKey y pasa a PENDING", async () => {
    const { service, claim, storage, notifications } =
      await awaitingClaim();
    const updated = await service.attachReceipt(
      ACADEMY,
      claim.id,
      PERSON,
      PNG,
    );
    expect(updated.status).toBe("PENDING");
    expect(updated.receiptKey).toBe(`claims/${ACADEMY}/rcpt.png`);
    expect(storage.save).toHaveBeenCalledOnce();
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({ type: "payment_claim_new" }),
    );
  });

  it("rechaza si el claim no es del alumno o no está AWAITING", async () => {
    const { service, claim, fx } = await awaitingClaim();
    await expect(
      service.attachReceipt(ACADEMY, claim.id, "otro", PNG),
    ).rejects.toBeInstanceOf(NotFoundException);
    // Ya PENDING → 409
    await service.attachReceipt(ACADEMY, claim.id, PERSON, PNG);
    await expect(
      service.attachReceipt(ACADEMY, claim.id, PERSON, PNG),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fx.data.claims[0].status).toBe("PENDING");
  });

  it("rechaza archivo inválido o vacío", async () => {
    const { service, claim } = await awaitingClaim();
    await expect(
      service.attachReceipt(ACADEMY, claim.id, PERSON, {
        ...PNG,
        mimetype: "text/plain",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.attachReceipt(
        ACADEMY,
        claim.id,
        PERSON,
        undefined as unknown as StoredFile,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("AcademyClaimsService.cancel", () => {
  it("elimina el claim AWAITING propio", async () => {
    const { service, fx } = mkService();
    const claim = await service.createIntent(ACADEMY, PERSON, {
      planId: PLAN,
      methodId: METHOD,
    });
    await service.cancel(ACADEMY, claim.id, PERSON);
    expect(fx.data.claims).toHaveLength(0);
  });

  it("409 si ya no es un borrador", async () => {
    const { service, fx } = mkService();
    fx.data.claims.push({
      id: "claim-p",
      academyId: ACADEMY,
      personId: PERSON,
      status: "PENDING",
    });
    await expect(
      service.cancel(ACADEMY, "claim-p", PERSON),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.cancel(ACADEMY, "claim-p", "otro"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AcademyClaimsService.loadClaimForReceipt", () => {
  it("404 si el claim no tiene comprobante aún", async () => {
    const { service } = mkService();
    const claim = await service.createIntent(ACADEMY, PERSON, {
      planId: PLAN,
      methodId: METHOD,
    });
    await expect(
      service.loadClaimForReceipt(ACADEMY, claim.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

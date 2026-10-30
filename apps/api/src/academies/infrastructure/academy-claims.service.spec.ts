import { describe, expect, it, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { AcademyClaimsService } from "./academy-claims.service";
import { AcademyPromosService } from "../../payments/application/academy-promos.service";
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
  const payments: Row[] = [];
  const privateLessons: Row[] = [];
  // Academia vendible por defecto (spec private-class-checkout):
  // activa, con privateLessonPrice y sin bloqueo por mora.
  const academyRow: Row = {
    id: ACADEMY,
    name: "Academia",
    ownerId: "owner-1",
    active: true,
    privateLessonPrice: 30000,
    billingBlockedAt: null,
    city: { country: { currency: "CLP" } },
  };

  const matchWhere = (row: Row, where: Row | undefined): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([k, cond]) => {
      if (cond !== null && typeof cond === "object") {
        if ("in" in cond) return (cond.in as unknown[]).includes(row[k]);
        if ("not" in cond) return row[k] !== cond.not;
        if ("gt" in cond) return row[k] > cond.gt;
        if ("gte" in cond || "lte" in cond) {
          const v = row[k] as Date;
          return (
            (cond.gte === undefined || v >= cond.gte) &&
            (cond.lte === undefined || v <= cond.lte)
          );
        }
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

  const prisma: Row = {
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
        findUniqueOrThrow: vi.fn(async ({ where }: Row) => {
          const e = enrollments.find((x) => x.id === where.id);
          if (!e) throw new Error("enrollment no encontrado");
          return e;
        }),
        update: vi.fn(async ({ where, data }: Row) => {
          const e = enrollments.find((x) => x.id === where.id);
          if (e) Object.assign(e, data);
          return e;
        }),
        create: vi.fn(async ({ data }: Row) => {
          const row = { id: `enr-${enrollments.length + 1}`, ...data };
          enrollments.push(row);
          return row;
        }),
      },
      payment: {
        create: vi.fn(async ({ data }: Row) => {
          const row = {
            id: `pay-${payments.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          payments.push(row);
          return row;
        }),
      },
      privateLesson: {
        create: vi.fn(async ({ data }: Row) => {
          const row = {
            id: `pvl-${privateLessons.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          privateLessons.push(row);
          return row;
        }),
      },
      paymentClaim: {
        findFirst: vi.fn(async ({ where }: Row) => {
          return claims.find((c) => matchOr(c, where)) ?? null;
        }),
        findMany: vi.fn(async ({ where }: Row = {}) =>
          claims.filter((c) => matchOr(c, where)),
        ),
        count: vi.fn(async ({ where }: Row = {}) =>
          claims.filter((c) => matchOr(c, where)).length,
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
          where.id === ACADEMY ? academyRow : null,
        ),
      },
      // Sin promos por defecto (spec member-promos) - el test de promo
      // siembra vía mockResolvedValue.
      academyPromo: { findMany: vi.fn(async () => [] as Row[]) },
  };

  // La tx del approve corre sobre el mismo cliente mockeado: los
  // modelos que usa (payment, privateLesson, enrollment, paymentClaim)
  // ya están implementados arriba.
  prisma.$transaction = vi.fn(
    async (cb: (tx: Row) => unknown) => cb(prisma),
  );

  return {
    data: {
      methods,
      plans,
      claims,
      enrollments,
      persons,
      payments,
      privateLessons,
      academyRow,
    },
    prisma,
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
    new AcademyPromosService(fx.prisma as unknown as PrismaService),
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

// Filtros de la cola (spec analytics/query-console - contrato de
// filtros compartido): status exacto + rango createdAt por día
// inclusivo; la whitelist de status vive en el controller (400).
describe("AcademyClaimsService.listClaims", () => {
  it("status y createdAt (gte/lte) acotan la cola", async () => {
    const { service, fx } = mkService();
    fx.data.claims.push(
      {
        id: "c-pen",
        academyId: ACADEMY,
        personId: PERSON,
        status: "PENDING",
        createdAt: new Date("2026-01-05T10:00:00Z"),
      },
      {
        id: "c-apr",
        academyId: ACADEMY,
        personId: PERSON,
        status: "APPROVED",
        createdAt: new Date("2026-02-10T10:00:00Z"),
      },
    );
    expect((await service.listClaims(ACADEMY)).items).toHaveLength(2);
    expect(
      (await service.listClaims(ACADEMY, "PENDING")).items.map((c) => c.id),
    ).toEqual(["c-pen"]);
    expect(
      (
        await service.listClaims(ACADEMY, undefined, {
          gte: new Date("2026-02-01T00:00:00Z"),
          lte: new Date("2026-02-28T23:59:59.999Z"),
        })
      ).items.map((c) => c.id),
    ).toEqual(["c-apr"]);
  });
});

describe("AcademyClaimsService.createIntent - moneda (spec multipais-currency)", () => {
  it("snapshot de moneda: academy en MXN → claim.currency = MXN", async () => {
    const { service, fx } = mkService();
    // El claim hereda plan.currency - snapshot de la moneda de la
    // academia estampado al crear el plan (spec multipais-currency):
    // una academia MXN vende planes en MXN.
    fx.data.plans.find((p) => p.id === PLAN)!.currency = "MXN";
    const claim = await service.createIntent(ACADEMY, PERSON, {
      planId: PLAN,
      methodId: METHOD,
    });
    expect(claim.currency).toBe("MXN");
  });
});

// Intento de clase particular por método propio (spec
// private-class-checkout): kind PRIVATE_CLASS, planId null, amount =
// privateLessonPrice, sin promo, idempotente por kind.
describe("AcademyClaimsService.createIntent - clase particular", () => {
  it("crea claim kind PRIVATE_CLASS con amount = privateLessonPrice y planId null", async () => {
    const { service, fx } = mkService();
    const claim = await service.createIntent(ACADEMY, PERSON, {
      privateClass: true,
      methodId: METHOD,
    });
    expect(claim.kind).toBe("PRIVATE_CLASS");
    expect(claim.planId ?? null).toBeNull();
    expect(claim.amount).toBe(30000);
    expect(claim.currency).toBe("CLP");
    expect(claim.status).toBe("AWAITING");
    expect(claim.methodLabel).toBe("Transferencia");
    expect(fx.data.claims).toHaveLength(1);
  });

  it("es idempotente por kind: no duplica el claim vivo", async () => {
    const { service, fx } = mkService();
    const first = await service.createIntent(ACADEMY, PERSON, {
      privateClass: true,
      methodId: METHOD,
    });
    const second = await service.createIntent(ACADEMY, PERSON, {
      privateClass: true,
      methodId: METHOD,
    });
    expect(second.id).toBe(first.id);
    expect(fx.data.claims).toHaveLength(1);
  });

  it("devuelve el PENDING existente en vez de duplicar", async () => {
    const { service, fx } = mkService();
    fx.data.claims.push({
      id: "claim-pc",
      academyId: ACADEMY,
      personId: PERSON,
      kind: "PRIVATE_CLASS",
      planId: null,
      status: "PENDING",
    });
    const claim = await service.createIntent(ACADEMY, PERSON, {
      privateClass: true,
      methodId: METHOD,
    });
    expect(claim.id).toBe("claim-pc");
    expect(fx.data.claims).toHaveLength(1);
  });

  it("no colisiona con el claim PLAN vivo del mismo alumno", async () => {
    const { service, fx } = mkService();
    await service.createIntent(ACADEMY, PERSON, {
      planId: PLAN,
      methodId: METHOD,
    });
    const pc = await service.createIntent(ACADEMY, PERSON, {
      privateClass: true,
      methodId: METHOD,
    });
    expect(pc.kind).toBe("PRIVATE_CLASS");
    expect(fx.data.claims).toHaveLength(2);
  });

  it("400 cuando la academia no vende particulares (inactiva o sin precio)", async () => {
    const { service, fx } = mkService();
    fx.data.academyRow.privateLessonPrice = null;
    await expect(
      service.createIntent(ACADEMY, PERSON, {
        privateClass: true,
        methodId: METHOD,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    fx.data.academyRow.privateLessonPrice = 30000;
    fx.data.academyRow.active = false;
    await expect(
      service.createIntent(ACADEMY, PERSON, {
        privateClass: true,
        methodId: METHOD,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("400 cuando la academia está bloqueada por mora", async () => {
    const { service, fx } = mkService();
    fx.data.academyRow.billingBlockedAt = new Date();
    await expect(
      service.createIntent(ACADEMY, PERSON, {
        privateClass: true,
        methodId: METHOD,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("400 con planId + privateClass juntos o sin ninguna forma", async () => {
    const { service } = mkService();
    await expect(
      service.createIntent(ACADEMY, PERSON, {
        planId: PLAN,
        privateClass: true,
        methodId: METHOD,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createIntent(ACADEMY, PERSON, {
        methodId: METHOD,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// Aprobación de claims (spec private-class-checkout): el claim PLAN
// sigue creando el Payment MEMBERSHIP + vigencia; el PRIVATE_CLASS crea
// Payment PRIVATE y materializa la PrivateLesson "por asignar".
describe("AcademyClaimsService.approve", () => {
  it("PRIVATE_CLASS: Payment MANUAL PRIVATE + PrivateLesson por asignar", async () => {
    const { service, fx, notifications } = mkService();
    fx.data.claims.push({
      id: "claim-pc",
      academyId: ACADEMY,
      personId: PERSON,
      kind: "PRIVATE_CLASS",
      planId: null,
      amount: 30000,
      currency: "CLP",
      status: "PENDING",
      receiptKey: "claims/ac-1/rcpt.png",
    });
    const res = await service.approve(ACADEMY, "claim-pc", "owner-1");

    expect(fx.data.payments).toHaveLength(1);
    const pay = fx.data.payments[0];
    expect(pay.orderType).toBe("PRIVATE");
    expect(pay.gateway).toBe("MANUAL");
    expect(pay.status).toBe("PAID");
    expect(pay.refId).toBe("claim-claim-pc");
    expect(pay.amount).toBe(30000);

    expect(fx.data.privateLessons).toHaveLength(1);
    const lesson = fx.data.privateLessons[0];
    expect(lesson.status).toBe("REQUESTED");
    expect(lesson.instructorId).toBeNull();
    expect(lesson.scheduledAt).toBeNull();
    expect(lesson.paymentId).toBe(pay.id);
    expect(lesson.price).toBe(30000);
    expect(lesson.personId).toBe(PERSON);
    expect(lesson.academyId).toBe(ACADEMY);

    // Sin plan: no toca enrollment ni vigencia.
    expect(fx.data.enrollments).toHaveLength(1);
    expect(fx.data.enrollments[0].endsAt).toBeNull();
    expect(res.newEndsAt).toBeNull();
    expect(res.claim.status).toBe("APPROVED");
    expect(res.claim.reviewedById).toBe("owner-1");
    expect(res.lessonId).toBe(lesson.id);
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      PERSON,
      expect.objectContaining({ type: "payment_claim_approved" }),
    );
  });

  it("PLAN: Payment MANUAL MEMBERSHIP + vigencia extendida, sin lección", async () => {
    const { service, fx } = mkService();
    fx.data.claims.push({
      id: "claim-pl",
      academyId: ACADEMY,
      personId: PERSON,
      kind: "PLAN",
      planId: PLAN,
      // El include del approve trae el plan embebido.
      plan: { id: PLAN, type: "MONTHLY", periodDays: 30 },
      enrollmentId: "enr-1",
      amount: 25000,
      currency: "CLP",
      status: "PENDING",
      receiptKey: "claims/ac-1/rcpt.png",
    });
    const res = await service.approve(ACADEMY, "claim-pl", "owner-1");

    expect(fx.data.payments).toHaveLength(1);
    expect(fx.data.payments[0].orderType).toBe("MEMBERSHIP");
    expect(fx.data.payments[0].refId).toBe("claim-claim-pl");
    expect(fx.data.privateLessons).toHaveLength(0);
    const enr = fx.data.enrollments.find((e) => e.id === "enr-1");
    expect(enr?.endsAt).toBeInstanceOf(Date);
    expect(res.newEndsAt).toBeInstanceOf(Date);
    expect(res.claim.status).toBe("APPROVED");
  });
});

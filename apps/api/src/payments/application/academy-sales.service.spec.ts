import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaService } from "../../prisma.service";
import type { AcademyAccess } from "../../academies/infrastructure/academy-access.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import {
  AcademyNotApprovedError,
  AcademySalesService,
  DuplicateAgreementError,
} from "./academy-sales.service";

// AcademySalesService - preventa atribuida a academias (spec
// academy-presale-commission): acuerdo invitado por el productor,
// atribución en checkout solo PRESALE, deuda computada = comisión PAID
// menos marcas de pago persistidas. Prisma se mockea plano con vi.fn().

type Row = Record<string, unknown>;

function mkPrisma() {
  const agreements: Row[] = [];
  const settlements: Row[] = [];
  const payments: Row[] = [];
  const codes: Row[] = [];
  const redemptions: Row[] = [];
  const persons: Row[] = [{ id: "buyer-1", name: "Comprador Uno" }];
  // Las emisiones serializan por advisory lock real
  // (pg_advisory_xact_lock); el fake serializa toda $transaction para
  // que el test de concurrencia vea el re-check de cupo post-commit.
  const prisma = {
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(
      (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
        fn(null as never),
    ),
    event: {
      findUnique: vi.fn(),
      // paymentScope de acuerdos de serie: eventos de la serie por id.
      findMany: vi.fn(async () => [{ id: "evt-1" }, { id: "evt-2" }]),
    },
    eventSeries: { findUnique: vi.fn() },
    academy: { findUnique: vi.fn() },
    personRole: {
      findFirst: vi.fn(
        async (): Promise<{ id: string } | null> => ({ id: "pr-1" }),
      ),
    },
    person: {
      findMany: vi.fn(
        async ({ where }: { where: { id: { in: string[] } } }) =>
          persons.filter((p) => where.id.in.includes(p.id as string)),
      ),
    },
    // Canal código (spec academy-presale-codes): códigos 100% ligados
    // al acuerdo + su redención (comprador + pago).
    discountCode: {
      findMany: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { academySaleAgreementId?: string };
          include?: { redemptions?: boolean };
        }) =>
          codes
            .filter(
              (c) =>
                c.academySaleAgreementId === where.academySaleAgreementId,
            )
            .map((c) =>
              include?.redemptions
                ? {
                    ...c,
                    redemptions: redemptions.filter(
                      (r) => r.codeId === c.id,
                    ),
                  }
                : c,
            ),
      ),
      count: vi.fn(
        async ({
          where,
        }: {
          where: { academySaleAgreementId?: string };
        }) =>
          codes.filter(
            (c) => c.academySaleAgreementId === where.academySaleAgreementId,
          ).length,
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: `dc-${codes.length + 1}`,
          usedCount: 0,
          createdAt: new Date(),
          ...data,
        };
        codes.push(row);
        return row;
      }),
    },
    payment: {
      aggregate: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          const eventFilter = where.eventId as
            | string
            | { in: string[] }
            | undefined;
          // OR de exclusión del canal código: {discountCodeId:null} o
          // {discountCodeId:{notIn:[ids del acuerdo]}}.
          const orOk = (p: Row) =>
            !where.OR ||
            (where.OR as Row[]).some((cond) => {
              if (cond.discountCodeId === null) {
                return p.discountCodeId == null;
              }
              const notIn = (cond.discountCodeId as { notIn?: string[] })
                ?.notIn;
              if (notIn) {
                return (
                  p.discountCodeId != null &&
                  !notIn.includes(p.discountCodeId as string)
                );
              }
              return true;
            });
          const rows = payments.filter(
            (p) =>
              p.status === "PAID" &&
              p.soldByAcademyId === where.soldByAcademyId &&
              (typeof eventFilter === "string"
                ? p.eventId === eventFilter
                : eventFilter
                  ? eventFilter.in.includes(p.eventId as string)
                  : true) &&
              orOk(p),
          );
          return {
            _sum: {
              quantity: rows.reduce((s, r) => s + (r.quantity as number), 0),
              academyCommissionClp: rows.reduce(
                (s, r) => s + ((r.academyCommissionClp as number) ?? 0),
                0,
              ),
            },
          };
        },
      ),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            status?: string;
            discountCodeId?: { in: string[] };
            id?: { in: string[] };
          };
        }) =>
          payments.filter(
            (p) =>
              (!where.status || p.status === where.status) &&
              (!where.discountCodeId ||
                where.discountCodeId.in.includes(
                  p.discountCodeId as string,
                )) &&
              (!where.id || where.id.in.includes(p.id as string)),
          ),
      ),
    },
    academySaleAgreement: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            academyId: string;
            status?: string;
            OR?: { eventId?: string; seriesId?: string }[];
          };
        }) =>
          agreements.find(
            (a) =>
              a.academyId === where.academyId &&
              (!where.status || a.status === where.status) &&
              (!where.OR ||
                where.OR.some(
                  (c) =>
                    (c.eventId != null && a.eventId === c.eventId) ||
                    (c.seriesId != null && a.seriesId === c.seriesId),
                )),
          ) ?? null,
      ),
      findMany: vi.fn(async () => agreements),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: `agr-${agreements.length + 1}`,
          status: "INVITED",
          respondedAt: null,
          createdAt: new Date(),
          academy: { name: "Academia X" },
          ...data,
        };
        agreements.push(row);
        return row;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Row }) => {
          const row = agreements.find((a) => a.id === where.id)!;
          Object.assign(row, data);
          return { ...row, academy: { name: "Academia X" } };
        },
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          agreements.find((a) => a.id === where.id) ?? null,
      ),
    },
    academySaleSettlement: {
      aggregate: vi.fn(async () => ({
        _sum: {
          amountDue: settlements.reduce(
            (s, r) => s + (r.amountDue as number),
            0,
          ),
        },
      })),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: `set-${settlements.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        settlements.push(row);
        return row;
      }),
    },
  };
  let txQueue: Promise<unknown> = Promise.resolve();
  prisma.$transaction.mockImplementation(
    (fn: (tx: unknown) => Promise<unknown>) => {
      const run = txQueue.then(() => fn(prisma));
      txQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  );
  return { prisma, agreements, settlements, payments, codes, redemptions, persons };
}

const producer = { id: "prod-1", roles: [] as string[] };
const academyOwner = { id: "own-1", roles: [] as string[] };

const mkEvent = (over: Row = {}) => ({
  id: "evt-1",
  producerId: "prod-1",
  name: "Noche de Salsa",
  seriesId: null,
  ...over,
});

const mkAgreement = (over: Row = {}) => ({
  id: "agr-1",
  eventId: "evt-1",
  seriesId: null,
  academyId: "ac-1",
  commissionPct: 50,
  maxTickets: null,
  status: "INVITED",
  createdById: "prod-1",
  respondedAt: null,
  createdAt: new Date(),
  academy: { name: "Academia X", ownerId: "own-1" },
  event: { producerId: "prod-1", name: "Noche de Salsa" },
  series: null,
  ...over,
});

describe("AcademySalesService", () => {
  let fx: ReturnType<typeof mkPrisma>;
  let svc: AcademySalesService;
  let access: { requireStaff: ReturnType<typeof vi.fn>; requireCapabilityWrite: ReturnType<typeof vi.fn> };
  let notifications: { notify: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fx = mkPrisma();
    access = {
      requireStaff: vi.fn(async () => ({})),
      requireCapabilityWrite: vi.fn(async () => ({})),
    };
    notifications = { notify: vi.fn(async () => ({})) };
    fx.prisma.academy.findUnique.mockResolvedValue({
      id: "ac-1",
      name: "Academia X",
      active: true,
      ownerId: "own-1",
    });
    svc = new AcademySalesService(
      fx.prisma as unknown as PrismaService,
      access as unknown as AcademyAccess,
      notifications as unknown as NotificationsService,
    );
  });

  // ─── Creación del acuerdo ───

  it("crea INVITED y notifica al owner de la academia", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent());
    const view = await svc.createAgreement(producer, {
      eventId: "evt-1",
      academyId: "ac-1",
      commissionPct: 50,
    });
    expect(view.status).toBe("INVITED");
    expect(notifications.notify).toHaveBeenCalledWith(
      "own-1",
      expect.objectContaining({ type: "academy.sale_deal.invited" }),
    );
  });

  it("productor ajeno sin admin → 403", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent());
    await expect(
      svc.createAgreement(
        { id: "otro", roles: [] },
        { eventId: "evt-1", academyId: "ac-1", commissionPct: 50 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("academia sin rol aprobado → AcademyNotApprovedError", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent());
    fx.prisma.personRole.findFirst.mockResolvedValue(null);
    await expect(
      svc.createAgreement(producer, {
        eventId: "evt-1",
        academyId: "ac-1",
        commissionPct: 50,
      }),
    ).rejects.toBeInstanceOf(AcademyNotApprovedError);
  });

  it("duplicado (evento, academia) → DuplicateAgreementError", async () => {
    fx.prisma.event.findUnique.mockResolvedValue(mkEvent());
    fx.agreements.push(mkAgreement());
    await expect(
      svc.createAgreement(producer, {
        eventId: "evt-1",
        academyId: "ac-1",
        commissionPct: 50,
      }),
    ).rejects.toBeInstanceOf(DuplicateAgreementError);
  });

  it("comisión fuera de 1-90 o alcance ambiguo → 400", async () => {
    await expect(
      svc.createAgreement(producer, {
        eventId: "evt-1",
        academyId: "ac-1",
        commissionPct: 95,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.createAgreement(producer, {
        eventId: "evt-1",
        seriesId: "ser-1",
        academyId: "ac-1",
        commissionPct: 50,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ─── Atribución en checkout ───

  it("resolveAttribution: acuerdo ACTIVE del evento congela comisión sobre lista × quantity", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE" }));
    const att = await svc.resolveAttribution({
      eventId: "evt-1",
      seriesId: null,
      academyId: "ac-1",
      unitListPrice: 6000,
      quantity: 2,
      channel: "PRESALE",
    });
    expect(att).toEqual({
      soldByAcademyId: "ac-1",
      academyCommissionClp: 6000, // 2 × round(6000 × 50%)
    });
  });

  it("resolveAttribution: acuerdo de la SERIE atribuye en el evento", async () => {
    fx.agreements.push(
      mkAgreement({ eventId: null, seriesId: "ser-1", status: "ACTIVE" }),
    );
    const att = await svc.resolveAttribution({
      eventId: "evt-1",
      seriesId: "ser-1",
      academyId: "ac-1",
      unitListPrice: 10000,
      quantity: 1,
      channel: "PRESALE",
    });
    expect(att?.academyCommissionClp).toBe(5000);
  });

  it("resolveAttribution: INVITED/DECLINED/sin acuerdo → null", async () => {
    fx.agreements.push(mkAgreement({ status: "INVITED" }));
    const att = await svc.resolveAttribution({
      eventId: "evt-1",
      seriesId: null,
      academyId: "ac-1",
      unitListPrice: 6000,
      quantity: 1,
      channel: "PRESALE",
    });
    expect(att).toBeNull();
  });

  it("resolveAttribution: canal DOOR o sin academyId → null sin consultar", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE" }));
    expect(
      await svc.resolveAttribution({
        eventId: "evt-1",
        seriesId: null,
        academyId: "ac-1",
        unitListPrice: 6000,
        quantity: 1,
        channel: "DOOR",
      }),
    ).toBeNull();
    expect(
      await svc.resolveAttribution({
        eventId: "evt-1",
        seriesId: null,
        unitListPrice: 6000,
        quantity: 1,
        channel: "PRESALE",
      }),
    ).toBeNull();
    expect(
      fx.prisma.academySaleAgreement.findFirst,
    ).not.toHaveBeenCalled();
  });

  it("resolveAttribution: cupo maxTickets agotado → null", async () => {
    fx.agreements.push(
      mkAgreement({ status: "ACTIVE", maxTickets: 10 }),
    );
    fx.payments.push(
      {
        status: "PAID",
        soldByAcademyId: "ac-1",
        eventId: "evt-1",
        quantity: 10,
        academyCommissionClp: 30000,
      },
    );
    const att = await svc.resolveAttribution({
      eventId: "evt-1",
      seriesId: null,
      academyId: "ac-1",
      unitListPrice: 6000,
      quantity: 1,
      channel: "PRESALE",
    });
    expect(att).toBeNull();
  });

  // ─── Respuesta de la academia ───

  it("academia acepta INVITED → ACTIVE + notifica al productor", async () => {
    fx.agreements.push(mkAgreement());
    const view = await svc.patchAgreement("agr-1", academyOwner, {
      action: "accept",
    });
    expect(view.status).toBe("ACTIVE");
    expect(access.requireCapabilityWrite).toHaveBeenCalledWith(
      "ac-1",
      academyOwner,
      "payments",
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      "prod-1",
      expect.objectContaining({ type: "academy.sale_deal.responded" }),
    );
  });

  it("academia responde acuerdo ya ACTIVE → 409", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE" }));
    await expect(
      svc.patchAgreement("agr-1", academyOwner, { action: "accept" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ─── Deuda y regularización ───

  it("deuda = comisión PAID atribuida menos marcas de pago", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE" }));
    fx.payments.push(
      {
        status: "PAID",
        soldByAcademyId: "ac-1",
        eventId: "evt-1",
        quantity: 4,
        academyCommissionClp: 12000,
      },
      {
        status: "PAID",
        soldByAcademyId: "ac-1",
        eventId: "evt-1",
        quantity: 6,
        academyCommissionClp: 18000,
      },
      // No atribuida ni pendiente - no cuenta.
      {
        status: "PENDING",
        soldByAcademyId: "ac-1",
        eventId: "evt-1",
        quantity: 3,
        academyCommissionClp: 9000,
      },
      { status: "PAID", soldByAcademyId: null, eventId: "evt-1", quantity: 5 },
    );
    const view = await svc.patchAgreement("agr-1", producer, {
      commissionPct: 40,
    });
    expect(view.stats.commissionAccruedClp).toBe(30000);
    expect(view.stats.pendingClp).toBe(30000);
    expect(view.stats.soldTickets).toBe(10);
  });

  it("markPaid materializa el settlement con la deuda del momento", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE" }));
    fx.payments.push({
      status: "PAID",
      soldByAcademyId: "ac-1",
      eventId: "evt-1",
      quantity: 4,
      academyCommissionClp: 12000,
    });
    const settlement = await svc.markPaid("agr-1", producer, "https://x/y.pdf");
    expect(settlement.amountDue).toBe(12000);
    expect(settlement.producerId).toBe("prod-1");
    // Venta posterior → remanente nuevo pendiente.
    fx.payments.push({
      status: "PAID",
      soldByAcademyId: "ac-1",
      eventId: "evt-1",
      quantity: 2,
      academyCommissionClp: 6000,
    });
    const view = await svc.patchAgreement("agr-1", producer, {
      commissionPct: 50,
    });
    expect(view.stats.pendingClp).toBe(6000);
    expect(view.stats.settledClp).toBe(12000);
  });

  it("markPaid sin deuda pendiente → 409", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE" }));
    await expect(svc.markPaid("agr-1", producer)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("markPaid por no-productor → 403", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE" }));
    fx.payments.push({
      status: "PAID",
      soldByAcademyId: "ac-1",
      eventId: "evt-1",
      quantity: 1,
      academyCommissionClp: 3000,
    });
    await expect(
      svc.markPaid("agr-1", { id: "otro", roles: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ─── Canal código (spec academy-presale-codes) ───
  // La academia cobra la preventa en efectivo y emite un código 100%
  // por venta; el redeem deja cuenta por cobrar academia→productor.

  it("createPresaleCode: emite código 100% un solo uso con scope del acuerdo", async () => {
    fx.agreements.push(
      mkAgreement({
        status: "ACTIVE",
        event: {
          producerId: "prod-1",
          name: "Noche de Salsa",
          startsAt: new Date("2026-11-15T21:00:00Z"),
        },
      }),
    );
    const code = await svc.createPresaleCode("agr-1", academyOwner);
    expect(access.requireCapabilityWrite).toHaveBeenCalledWith(
      "ac-1",
      academyOwner,
      "payments",
    );
    expect(code.type).toBe("ACADEMY_PRESALE");
    expect(code.percentOff).toBe(100);
    expect(code.maxUses).toBe(1);
    expect(code.eventId).toBe("evt-1");
    expect(code.academySaleAgreementId).toBe("agr-1");
    // Formato legible: SLUGACADEMIA-DDMMM-XXXX
    expect(code.code).toMatch(/^ACADEMIA-15NOV-[A-Z0-9]{4}$/);
  });

  it("createPresaleCode: acuerdo no ACTIVE → 409", async () => {
    fx.agreements.push(mkAgreement({ status: "INVITED" }));
    await expect(
      svc.createPresaleCode("agr-1", academyOwner),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("createPresaleCode: cupo = códigos emitidos + tickets por link → 409", async () => {
    fx.agreements.push(
      mkAgreement({ status: "ACTIVE", maxTickets: 3 }),
    );
    // 2 códigos ya emitidos + 1 ticket PAID por link = cupo lleno.
    fx.codes.push(
      { id: "dc-1", academySaleAgreementId: "agr-1", code: "A" },
      { id: "dc-2", academySaleAgreementId: "agr-1", code: "B" },
    );
    fx.payments.push({
      status: "PAID",
      soldByAcademyId: "ac-1",
      eventId: "evt-1",
      quantity: 1,
      discountCodeId: null,
      academyCommissionClp: 5000,
    });
    await expect(
      svc.createPresaleCode("agr-1", academyOwner),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("createPresaleCode: emisiones concurrentes serializan bajo el advisory lock", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE", maxTickets: 1 }));
    const results = await Promise.allSettled([
      svc.createPresaleCode("agr-1", academyOwner),
      svc.createPresaleCode("agr-1", academyOwner),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(
      (failed[0] as PromiseRejectedResult).reason,
    ).toBeInstanceOf(ConflictException);
    // El lock toma la tx por acuerdo y el cupo se re-chequea dentro.
    expect(fx.prisma.$executeRaw).toHaveBeenCalled();
    expect(fx.codes).toHaveLength(1);
  });

  it("resolveAttribution (link): los códigos emitidos también consumen cupo", async () => {
    fx.agreements.push(
      mkAgreement({ status: "ACTIVE", maxTickets: 2 }),
    );
    fx.codes.push(
      { id: "dc-1", academySaleAgreementId: "agr-1", code: "A" },
      { id: "dc-2", academySaleAgreementId: "agr-1", code: "B" },
    );
    const att = await svc.resolveAttribution({
      eventId: "evt-1",
      seriesId: null,
      academyId: "ac-1",
      unitListPrice: 6000,
      quantity: 1,
      channel: "PRESALE",
    });
    expect(att).toBeNull();
  });

  it("deuda bidireccional: redeem de código = cuenta por cobrar lista − comisión", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE" }));
    fx.codes.push({
      id: "dc-1",
      academySaleAgreementId: "agr-1",
      code: "ACADEMIAX-15NOV-AAAA",
    });
    // Orden $0 FREE del código: atribuida (soldByAcademyId) con comisión
    // congelada 50% de 10.000.
    fx.payments.push({
      id: "pay-1",
      status: "PAID",
      soldByAcademyId: "ac-1",
      eventId: "evt-1",
      quantity: 1,
      discountCodeId: "dc-1",
      unitListPrice: 10000,
      academyCommissionClp: 5000,
      amount: 0,
    });
    const view = await svc.patchAgreement("agr-1", producer, {
      commissionPct: 50,
    });
    expect(view.stats.codeReceivableClp).toBe(5000); // 10.000 − 5.000
    expect(view.stats.commissionAccruedClp).toBe(0); // no es canal link
    expect(view.stats.pendingClp).toBe(-5000); // la academia le debe al productor
    expect(view.stats.codesEmitted).toBe(1);
    expect(view.stats.soldTickets).toBe(1);
  });

  it("saldo neto: comisión por link menos por cobrar por códigos", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE" }));
    fx.codes.push({ id: "dc-1", academySaleAgreementId: "agr-1", code: "A" });
    fx.payments.push(
      // Link: 2 tickets, comisión devengada 10.000.
      {
        status: "PAID",
        soldByAcademyId: "ac-1",
        eventId: "evt-1",
        quantity: 2,
        discountCodeId: null,
        academyCommissionClp: 10000,
      },
      // Código redimido: academia cobró 10.000, debe 5.000.
      {
        status: "PAID",
        soldByAcademyId: "ac-1",
        eventId: "evt-1",
        quantity: 1,
        discountCodeId: "dc-1",
        unitListPrice: 10000,
        academyCommissionClp: 5000,
      },
    );
    const view = await svc.patchAgreement("agr-1", producer, {
      commissionPct: 50,
    });
    expect(view.stats.commissionAccruedClp).toBe(10000);
    expect(view.stats.codeReceivableClp).toBe(5000);
    expect(view.stats.pendingClp).toBe(5000); // 10.000 − 5.000
  });

  it("markPaid con saldo a favor del productor → settlement negativo", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE" }));
    fx.codes.push({ id: "dc-1", academySaleAgreementId: "agr-1", code: "A" });
    fx.payments.push({
      status: "PAID",
      soldByAcademyId: "ac-1",
      eventId: "evt-1",
      quantity: 1,
      discountCodeId: "dc-1",
      unitListPrice: 10000,
      academyCommissionClp: 5000,
    });
    const settlement = await svc.markPaid("agr-1", producer);
    expect(settlement.amountDue).toBe(-5000); // la academia pagó al productor
    const view = await svc.patchAgreement("agr-1", producer, {
      commissionPct: 50,
    });
    expect(view.stats.pendingClp).toBe(0);
    expect(view.stats.settledClp).toBe(-5000);
  });

  it("listPresaleCodes: códigos con comprador y ref de pago", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE" }));
    fx.codes.push(
      { id: "dc-1", academySaleAgreementId: "agr-1", code: "A", usedCount: 1, maxUses: 1, createdAt: new Date() },
      { id: "dc-2", academySaleAgreementId: "agr-1", code: "B", usedCount: 0, maxUses: 1, createdAt: new Date() },
    );
    fx.redemptions.push({
      id: "red-1",
      codeId: "dc-1",
      personId: "buyer-1",
      paymentId: "pay-1",
      redeemedAt: new Date(),
    });
    fx.payments.push({ id: "pay-1", refId: "tkt_evt-1_x", status: "PAID" });
    const rows = await svc.listPresaleCodes("agr-1", academyOwner);
    expect(rows).toHaveLength(2);
    const used = rows.find((r) => r.code === "A")!;
    expect(used.redemption?.buyerName).toBe("Comprador Uno");
    expect(used.redemption?.paymentRefId).toBe("tkt_evt-1_x");
    expect(rows.find((r) => r.code === "B")!.redemption).toBeNull();
  });

  it("listPresaleCodes: el productor dueño también audita", async () => {
    fx.agreements.push(mkAgreement({ status: "ACTIVE" }));
    access.requireStaff.mockRejectedValueOnce(new ForbiddenException());
    const rows = await svc.listPresaleCodes("agr-1", producer);
    expect(rows).toEqual([]);
  });
});

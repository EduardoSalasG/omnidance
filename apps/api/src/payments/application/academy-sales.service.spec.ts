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
  const prisma = {
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
    payment: {
      aggregate: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          const eventFilter = where.eventId as
            | string
            | { in: string[] }
            | undefined;
          const rows = payments.filter(
            (p) =>
              p.status === "PAID" &&
              p.soldByAcademyId === where.soldByAcademyId &&
              (typeof eventFilter === "string"
                ? p.eventId === eventFilter
                : eventFilter
                  ? eventFilter.in.includes(p.eventId as string)
                  : true),
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
  return { prisma, agreements, settlements, payments };
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
});

import { describe, expect, it, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ProducerClaimsService } from "./producer-claims.service";
import type { StoredFile } from "../../storage/storage.service";
import type { PrismaClient } from "@prisma/client";
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { PaymentSettlementService } from "../application/payment-settlement.service";

const PRODUCER = "prod-1";
const BUYER = "buyer-1";
const PNG: StoredFile = {
  originalname: "comprobante.png",
  mimetype: "image/png",
  buffer: Buffer.from("img"),
  size: 128,
};

type Row = Record<string, any>;

/** Fake prisma acotado a las tablas del service: métodos, claims,
 *  payment/event/series para la resolución del productor. */
function mkPrisma() {
  const methods: Row[] = [];
  const claims: Row[] = [];
  const payments: Row[] = [];
  const events: Row[] = [{ id: "evt-1", producerId: PRODUCER }];
  const series: Row[] = [{ id: "ser-1", producerId: PRODUCER }];
  const plans: Row[] = [
    {
      id: "plan-1",
      academyId: "ac-1",
      academy: { ownerId: "owner-1" },
    },
  ];
  const academyMethods: Row[] = [
    {
      id: "amet-1",
      academyId: "ac-1",
      type: "TRANSFER",
      label: "Cta Corriente",
      active: true,
    },
  ];
  const adminRoles: Row[] = [{ personId: "adm-1", role: "ADMIN", status: "APPROVED" }];

  const matchWhere = (row: Row, where: Row | undefined): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([k, cond]) =>
      cond !== null && typeof cond === "object" && "in" in cond
        ? cond.in.includes(row[k])
        : row[k] === cond,
    );
  };

  return {
    data: { methods, claims, payments, events, series, plans, academyMethods, adminRoles },
    prisma: {
      membershipPlan: {
        findUnique: vi.fn(
          async ({ where }: Row) => plans.find((p) => p.id === where.id) ?? null,
        ),
      },
      academyPaymentMethod: {
        findFirst: vi.fn(
          async ({ where }: Row) =>
            academyMethods.find((m) => matchWhere(m, where)) ?? null,
        ),
      },
      personRole: {
        findMany: vi.fn(
          async ({ where }: Row = {}) =>
            adminRoles.filter((r) => matchWhere(r, where)),
        ),
      },
      producerPaymentMethod: {
        findMany: vi.fn(async ({ where, orderBy }: Row = {}) => {
          const rows = methods.filter((m) => matchWhere(m, where));
          if (orderBy) {
            rows.sort(
              (a, b) =>
                a.order - b.order || a.createdAt - b.createdAt,
            );
          }
          return rows;
        }),
        findFirst: vi.fn(
          async ({ where }: Row) =>
            methods.find((m) => matchWhere(m, where)) ?? null,
        ),
        create: vi.fn(async ({ data }: Row) => {
          const row = {
            id: `met-${methods.length + 1}`,
            active: true,
            createdAt: methods.length,
            ...data,
          };
          methods.push(row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: Row) => {
          const row = methods.find((m) => m.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        }),
        delete: vi.fn(async ({ where }: Row) => {
          const idx = methods.findIndex((m) => m.id === where.id);
          return methods.splice(idx, 1)[0];
        }),
      },
      ticketClaim: {
        create: vi.fn(async ({ data }: Row) => {
          const row = {
            id: `clm-${claims.length + 1}`,
            status: "PENDING",
            domain: "PRODUCER",
            createdAt: new Date(),
            ...data,
          };
          claims.push(row);
          return row;
        }),
        findFirst: vi.fn(
          async ({ where }: Row) =>
            claims.find((c) => matchWhere(c, where)) ?? null,
        ),
        findUnique: vi.fn(
          async ({ where }: Row) =>
            claims.find((c) => c.id === where.id) ?? null,
        ),
        findMany: vi.fn(async ({ where }: Row = {}) =>
          claims.filter((c) => matchWhere(c, where)),
        ),
        update: vi.fn(async ({ where, data }: Row) => {
          const row = claims.find((c) => c.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        }),
        updateMany: vi.fn(async ({ where, data }: Row) => {
          const rows = claims.filter((c) => matchWhere(c, where));
          rows.forEach((c) => Object.assign(c, data));
          return { count: rows.length };
        }),
      },
      payment: {
        findUnique: vi.fn(
          async ({ where }: Row) =>
            payments.find((p) => p.id === where.id) ?? null,
        ),
        findUniqueOrThrow: vi.fn(
          async ({ where }: Row) => payments.find((p) => p.id === where.id),
        ),
      },
      event: {
        findUnique: vi.fn(
          async ({ where }: Row) =>
            events.find((e) => e.id === where.id) ?? null,
        ),
      },
      eventSeries: {
        findUnique: vi.fn(
          async ({ where }: Row) =>
            series.find((s) => s.id === where.id) ?? null,
        ),
      },
      person: {
        findUnique: vi.fn(async () => ({ name: "Comprador" })),
      },
    } as unknown as PrismaClient,
  };
}

function mkService() {
  const { prisma, data } = mkPrisma();
  const storage = {
    save: vi.fn(async (_f: StoredFile, folder: string) =>
      `${folder}/receipt.png`,
    ),
    read: vi.fn(async (key: string) => Buffer.from(key)),
    delete: vi.fn(),
  };
  const notifications = {
    notifySafe: vi.fn(async () => {}),
  };
  const settlement = {
    settle: vi.fn(async () => ({ id: "pay-1", status: "PAID" })),
  };
  const svc = new ProducerClaimsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    settlement as unknown as PaymentSettlementService,
    storage,
  );
  return { svc, prisma, data, storage, notifications, settlement };
}

function manualPayment(over: Row = {}): Row {
  return {
    id: "pay-1",
    refId: `to_evt-1_${Math.random().toString(36).slice(2)}`,
    personId: BUYER,
    eventId: "evt-1",
    gateway: "MANUAL",
    status: "PENDING",
    amount: 6000,
    ...over,
  };
}

describe("ProducerClaimsService; métodos", () => {
  it("crea método con type válido y lista solo activos", async () => {
    const { svc } = mkService();
    await svc.createMethod(PRODUCER, {
      type: "TRANSFER",
      label: "BancoEstado",
      details: { bank: "Estado" },
    });
    const m2 = await svc.createMethod(PRODUCER, {
      type: "CASH",
      label: "Efectivo",
      details: {},
    });
    await svc.updateMethod(PRODUCER, m2.id, { active: false });

    const all = await svc.listMethods(PRODUCER, { includeInactive: true });
    const active = await svc.listMethods(PRODUCER);
    expect(all).toHaveLength(2);
    expect(active).toHaveLength(1);
    expect(active[0].label).toBe("BancoEstado");
  });

  it("rechaza type fuera del catálogo", async () => {
    const { svc } = mkService();
    await expect(
      svc.createMethod(PRODUCER, {
        type: "CRYPTO",
        label: "x",
        details: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("update/delete de método ajeno → 404", async () => {
    const { svc, data } = mkService();
    data.methods.push({
      id: "met-ajeno",
      producerId: "otro",
      type: "CASH",
      active: true,
    });
    await expect(
      svc.updateMethod(PRODUCER, "met-ajeno", { label: "x" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.deleteMethod(PRODUCER, "met-ajeno"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ProducerClaimsService; createClaim", () => {
  it("requiere archivo, ≤5MB y mimetype imagen/pdf", async () => {
    const { svc, data } = mkService();
    data.payments.push(manualPayment());
    await expect(
      svc.createClaim("pay-1", BUYER, undefined as any, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.createClaim(
        "pay-1",
        BUYER,
        { ...PNG, size: 6 * 1024 * 1024 },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.createClaim(
        "pay-1",
        BUYER,
        { ...PNG, mimetype: "text/html" },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("orden ajena → 404 (no revelar existencia)", async () => {
    const { svc, data } = mkService();
    data.payments.push(manualPayment({ personId: "otro-buyer" }));
    await expect(
      svc.createClaim("pay-1", BUYER, PNG, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("orden de pasarela o ya resuelta → 409", async () => {
    const { svc, data } = mkService();
    data.payments.push(manualPayment({ gateway: "FLOW" }));
    await expect(
      svc.createClaim("pay-1", BUYER, PNG, {}),
    ).rejects.toBeInstanceOf(ConflictException);
    data.payments[0].gateway = "MANUAL";
    data.payments[0].status = "PAID";
    await expect(
      svc.createClaim("pay-1", BUYER, PNG, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("crea claim con snapshot del método, guarda bajo claims/<prod> y notifica", async () => {
    const { svc, data, storage, notifications } = mkService();
    data.payments.push(manualPayment());
    data.methods.push({
      id: "met-1",
      producerId: PRODUCER,
      type: "TRANSFER",
      label: "Mi transferencia",
      active: true,
    });
    const claim = await svc.createClaim("pay-1", BUYER, PNG, {
      methodId: "met-1",
      note: "pagado",
    });
    expect(claim.methodType).toBe("TRANSFER");
    expect(claim.methodLabel).toBe("Mi transferencia");
    expect(claim.producerId).toBe(PRODUCER);
    expect(storage.save).toHaveBeenCalledWith(
      PNG,
      `claims/${PRODUCER}`,
    );
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      PRODUCER,
      expect.objectContaining({ type: "payment_claim_new" }),
    );
  });

  it("series pass: resuelve el productor desde el refId", async () => {
    const { svc, data } = mkService();
    // refId real: sp_<seriesId>_<month>_<uuid>
    data.payments.push(
      manualPayment({
        eventId: null,
        refId: "sp_ser-1_2026-11_ab12cd34",
      }),
    );
    const claim = await svc.createClaim("pay-1", BUYER, PNG, {});
    expect(claim.producerId).toBe(PRODUCER);
  });
});

describe("ProducerClaimsService; approve/reject", () => {
  function claimPendiente(data: { claims: Row[]; payments: Row[] }) {
    data.payments.push(manualPayment());
    data.claims.push({
      id: "clm-1",
      paymentId: "pay-1",
      personId: BUYER,
      producerId: PRODUCER,
      domain: "PRODUCER",
      receiptKey: "claims/prod-1/r.png",
      methodType: "TRANSFER",
      methodLabel: "Banco",
      status: "PENDING",
    });
  }

  it("approve: flip atómico + settle de la orden + notificación al comprador", async () => {
    const { svc, data, settlement, notifications } = mkService();
    claimPendiente(data);
    const res = await svc.approve(PRODUCER, "clm-1", "rev-1");
    expect(res.claim.status).toBe("APPROVED");
    expect(settlement.settle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pay-1" }),
      "PAID",
      expect.anything(),
    );
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      BUYER,
      expect.objectContaining({ type: "payment_claim_approved" }),
    );
  });

  it("segunda aprobación (idempotente/concurrencia) → 409", async () => {
    const { svc, data } = mkService();
    claimPendiente(data);
    await svc.approve(PRODUCER, "clm-1", "rev-1");
    await expect(
      svc.approve(PRODUCER, "clm-1", "rev-1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("claim de otro productor → 404", async () => {
    const { svc, data } = mkService();
    claimPendiente(data);
    await expect(
      svc.approve("otro-prod", "clm-1", "rev-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reject requiere motivo, deja la orden PENDING y notifica", async () => {
    const { svc, data, settlement, notifications } = mkService();
    claimPendiente(data);
    await expect(svc.reject(PRODUCER, "clm-1", "rev-1", " ")).rejects
      .toBeInstanceOf(BadRequestException);
    const res = await svc.reject(PRODUCER, "clm-1", "rev-1", "monto no calza");
    expect(res.claim.status).toBe("REJECTED");
    expect(res.claim.reviewNote).toBe("monto no calza");
    expect(data.payments[0].status).toBe("PENDING");
    expect(settlement.settle).not.toHaveBeenCalled();
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      BUYER,
      expect.objectContaining({ type: "payment_claim_rejected" }),
    );
  });
});

describe("ProducerClaimsService; receipt privacy", () => {
  const claim = { personId: BUYER, producerId: PRODUCER };
  it.each([
    [BUYER, false],
    [PRODUCER, false],
    ["otro-user", true],
    ["otro-user", false],
  ])("viewer=%s admin=%s", (viewer, isAdmin) => {
    const { svc } = mkService();
    const pass = isAdmin || viewer === BUYER || viewer === PRODUCER;
    if (pass) {
      expect(() => svc.assertCanView(claim, viewer, isAdmin)).not.toThrow();
    } else {
      expect(() => svc.assertCanView(claim, viewer, isAdmin)).toThrow(
        ForbiddenException,
      );
    }
  });
});

describe("ProducerClaimsService; dominios de suscripción (subscription-manual-transfer)", () => {
  const memPayment = (over: Row = {}): Row => ({
    id: "pay-mem",
    refId: "mem_plan-1_manual_1",
    personId: BUYER,
    orderType: "MEMBERSHIP",
    eventId: null,
    gateway: "MANUAL",
    status: "PENDING",
    amount: 10000,
    ...over,
  });
  const platPayment = (over: Row = {}): Row => ({
    id: "pay-plat",
    refId: "platsub_sub-1_manual_1",
    personId: BUYER,
    orderType: "PLATFORM_SUB",
    eventId: null,
    gateway: "MANUAL",
    status: "PENDING",
    amount: 50000,
    ...over,
  });

  it("claim sobre orden MEMBERSHIP manual → dominio ACADEMY + academyId + aviso al owner", async () => {
    const { svc, data, storage, notifications } = mkService();
    data.payments.push(memPayment());
    const claim = await svc.createClaim("pay-mem", BUYER, PNG, {
      methodId: "amet-1",
      note: "pagué hoy",
    });
    expect(claim.domain).toBe("ACADEMY");
    expect(claim.academyId).toBe("ac-1");
    expect(claim.producerId).toBeNull();
    expect(claim.methodLabel).toBe("Cta Corriente");
    expect(storage.save).toHaveBeenCalledWith(PNG, "claims/academies/ac-1");
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({ type: "payment_claim_new" }),
    );
  });

  it("claim sobre orden PLATFORM_SUB manual → dominio PLATFORM + aviso a admins", async () => {
    const { svc, data, storage, notifications } = mkService();
    data.payments.push(platPayment());
    const claim = await svc.createClaim("pay-plat", BUYER, PNG, {});
    expect(claim.domain).toBe("PLATFORM");
    expect(claim.producerId).toBeNull();
    expect(storage.save).toHaveBeenCalledWith(PNG, "claims/platform");
    expect(notifications.notifySafe).toHaveBeenCalledWith(
      "adm-1",
      expect.objectContaining({ type: "payment_claim_new" }),
    );
  });

  it("approveAcademyClaim → APPROVED + settle de la orden (actor claim)", async () => {
    const { svc, data, settlement } = mkService();
    data.payments.push(memPayment());
    data.claims.push({
      id: "clm-ac",
      paymentId: "pay-mem",
      personId: BUYER,
      producerId: null,
      domain: "ACADEMY",
      academyId: "ac-1",
      status: "PENDING",
    });
    await svc.approveAcademyClaim("ac-1", "clm-ac", "owner-1");
    expect(data.claims[0].status).toBe("APPROVED");
    expect(data.claims[0].reviewedById).toBe("owner-1");
    expect(settlement.settle).toHaveBeenCalledWith(
      data.payments[0],
      "PAID",
      { actor: "claim" },
    );
  });

  it("approvePlatformClaim → APPROVED + settle; claim de otro dominio → 404", async () => {
    const { svc, data, settlement } = mkService();
    data.payments.push(platPayment());
    data.claims.push({
      id: "clm-pl",
      paymentId: "pay-plat",
      personId: BUYER,
      producerId: null,
      domain: "PLATFORM",
      status: "PENDING",
    });
    await svc.approvePlatformClaim("clm-pl", "adm-1");
    expect(data.claims[0].status).toBe("APPROVED");
    expect(settlement.settle).toHaveBeenCalled();
    // Un claim PLATFORM no entra a la cola del productor ni de la academia.
    await expect(
      svc.approve("prod-x", "clm-pl", "prod-x"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.approveAcademyClaim("ac-1", "clm-pl", "o"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejectAcademyClaim → REJECTED, la orden sigue PENDING y admite re-subida", async () => {
    const { svc, data, settlement } = mkService();
    data.payments.push(memPayment());
    data.claims.push({
      id: "clm-ac",
      paymentId: "pay-mem",
      personId: BUYER,
      producerId: null,
      domain: "ACADEMY",
      academyId: "ac-1",
      status: "PENDING",
    });
    const res = await svc.rejectAcademyClaim(
      "ac-1",
      "clm-ac",
      "owner-1",
      "monto no calza",
    );
    expect(res.claim.status).toBe("REJECTED");
    expect(data.payments[0].status).toBe("PENDING");
    expect(settlement.settle).not.toHaveBeenCalled();
    // Re-subida sobre la misma orden: crea un claim nuevo PENDING.
    const again = await svc.createClaim("pay-mem", BUYER, PNG, {});
    expect(again.id).not.toBe("clm-ac");
    expect(again.status).toBe("PENDING");
  });
});

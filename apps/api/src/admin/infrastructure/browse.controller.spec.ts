import { describe, it, expect, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../../prisma.service";
// Ciclo session.guard ⇄ auth.controller (ver payouts.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { BrowseController } from "./browse.controller";
import { emitPaymentEvent } from "../../payments/domain/payment-ledger";

// Cobertura de las vistas de auditoría de BrowseController:
// - GET /admin/payments/:id/verify-chain → verifyPaymentChain (ok /
//   firstBadSeq / 404).
// - browse/:entity → payment-events, gateway-transactions y
//   membership-subscriptions con sus filtros whitelists.
// La autorización (admin.access) la impone RolesGuard a nivel de clase —
// acá se ejercita la lógica del handler con prisma in-memory.

type Row = Record<string, unknown>;

function matchWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      if (!(cond as Row[]).some((c) => matchWhere(row, c))) return false;
      continue;
    }
    const v = row[key];
    if (cond !== null && typeof cond === "object") {
      const c = cond as Row;
      if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
      if (
        "contains" in c &&
        !(typeof v === "string" && v.includes(c.contains as string))
      )
        return false;
      if ("gte" in c && (!(v instanceof Date) || v < (c.gte as Date)))
        return false;
      if ("lte" in c && (!(v instanceof Date) || v > (c.lte as Date)))
        return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

class FakePrisma {
  payments: Row[] = [{ id: "p1" }];
  paymentEvents: Row[] = [];
  gatewayTxs: Row[] = [];
  subscriptions: Row[] = [];
  people: Row[] = [];
  academies: Row[] = [];

  payment = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.payments.find((p) => p.id === where.id) ?? null,
  };

  // El ledger emite con pg_advisory_xact_lock ($executeRaw) — no-op en fake.
  $executeRaw = async () => 0;

  paymentEvent = {
    // API completa del ledger: emit (fixture) + verify/browse.
    findFirst: async ({ where }: { where: { paymentId: string } }) =>
      this.paymentEvents
        .filter((e) => e.paymentId === where.paymentId)
        .sort((a, b) => (b.seq as number) - (a.seq as number))[0] ?? null,
    create: async ({ data }: { data: Row }) => {
      // Round-trip JSON como jsonb real (ver payment-ledger.spec.ts).
      const stored = JSON.parse(JSON.stringify(data)) as Row;
      this.paymentEvents.push(stored);
      return stored;
    },
    findMany: async ({ where, orderBy }: { where: Row; orderBy?: unknown }) => {
      const rows = this.paymentEvents.filter((e) => matchWhere(e, where));
      // verify-chain ordena por seq asc; browse por createdAt desc — el
      // fake respeta seq asc si el caller lo pide y desc si no.
      const asc = JSON.stringify(orderBy).includes('"asc"');
      return rows.sort((a, b) =>
        asc
          ? (a.seq as number) - (b.seq as number)
          : (b.seq as number) - (a.seq as number),
      );
    },
  };

  gatewayTransaction = {
    findMany: async ({ where }: { where: Row }) =>
      this.gatewayTxs
        .filter((t) => matchWhere(t, where))
        .sort(
          (a, b) =>
            (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
        ),
  };

  membershipSubscription = {
    findMany: async ({ where }: { where: Row }) =>
      this.subscriptions
        .filter((s) => matchWhere(s, where))
        .sort(
          (a, b) =>
            (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
        ),
  };

  person = {
    findMany: async ({ where }: { where: Row }) =>
      this.people.filter((p) => matchWhere(p, where)),
  };

  academy = {
    findMany: async ({ where }: { where: Row }) =>
      this.academies.filter((a) => matchWhere(a, where)),
  };
}

describe("BrowseController — auditoría", () => {
  let prisma: FakePrisma;
  let ctrl: BrowseController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new BrowseController(prisma as unknown as PrismaService);
  });

  describe("GET /admin/payments/:id/verify-chain", () => {
    it("cadena íntegra → {ok:true, events:n}", async () => {
      await emitPaymentEvent(
        prisma as never,
        "p1",
        "ORDER_CREATED",
        "system",
        { amount: 10000 },
      );
      await emitPaymentEvent(prisma as never, "p1", "SETTLED", "webhook", {});
      const r = await ctrl.verifyChain("p1");
      expect(r).toEqual({ ok: true, events: 2 });
    });

    it("fila adulterada → ok:false con firstBadSeq", async () => {
      await emitPaymentEvent(prisma as never, "p1", "ORDER_CREATED", "system", {
        amount: 10000,
      });
      await emitPaymentEvent(prisma as never, "p1", "SETTLED", "webhook", {});
      prisma.paymentEvents[0].payload = { amount: 1 };
      const r = await ctrl.verifyChain("p1");
      expect(r.ok).toBe(false);
      expect(r.firstBadSeq).toBe(1);
    });

    it("pago inexistente → 404", async () => {
      await expect(ctrl.verifyChain("p-x")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("browse payment-events", () => {
    beforeEach(async () => {
      await emitPaymentEvent(prisma as never, "p1", "ORDER_CREATED", "system", {
        amount: 10000,
      });
      await emitPaymentEvent(
        prisma as never,
        "p1",
        "WEBHOOK_RECEIVED",
        "webhook",
        {},
      );
      await emitPaymentEvent(prisma as never, "p2", "IMPORTED", "migration", {});
    });

    it("filtra por paymentId y devuelve la evidencia completa", async () => {
      const rows = (await ctrl.browse("payment-events", {
        paymentId: "p1",
      })) as Row[];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveProperty("payloadHash");
      expect(rows[0]).toHaveProperty("payload");
    });

    it("filtra por type y actor", async () => {
      const rows = (await ctrl.browse("payment-events", {
        type: "IMPORTED",
        actor: "migration",
      })) as Row[];
      expect(rows).toHaveLength(1);
      expect(rows[0].paymentId).toBe("p2");
    });
  });

  describe("browse gateway-transactions", () => {
    beforeEach(() => {
      prisma.gatewayTxs.push(
        {
          id: "tx-1",
          provider: "FLOW",
          direction: "OUTBOUND",
          endpoint: "payment/create",
          correlationId: "c-1",
          paymentId: "p1",
          ok: true,
          httpStatus: 200,
          createdAt: new Date("2025-11-10T12:00:00Z"),
        },
        {
          id: "tx-2",
          provider: "FLOW",
          direction: "INBOUND_WEBHOOK",
          endpoint: "payments/webhook",
          correlationId: "c-2",
          paymentId: "p1",
          ok: false,
          httpStatus: 500,
          createdAt: new Date("2025-11-10T12:05:00Z"),
        },
        {
          id: "tx-3",
          provider: "FLOW",
          direction: "OUTBOUND",
          endpoint: "subscription/get",
          correlationId: "c-3",
          paymentId: null,
          ok: true,
          createdAt: new Date("2025-11-10T12:10:00Z"),
        },
      );
    });

    it("filtra por paymentId / endpoint (contains) / direction / ok", async () => {
      const byPayment = (await ctrl.browse("gateway-transactions", {
        paymentId: "p1",
      })) as Row[];
      expect(byPayment.map((t) => t.id).sort()).toEqual(["tx-1", "tx-2"]);

      const byEndpoint = (await ctrl.browse("gateway-transactions", {
        endpoint: "subscription",
      })) as Row[];
      expect(byEndpoint.map((t) => t.id)).toEqual(["tx-3"]);

      const failedInbound = (await ctrl.browse("gateway-transactions", {
        direction: "INBOUND_WEBHOOK",
        ok: "false",
      })) as Row[];
      expect(failedInbound.map((t) => t.id)).toEqual(["tx-2"]);

      const byCorrelation = (await ctrl.browse("gateway-transactions", {
        correlationId: "c-1",
      })) as Row[];
      expect(byCorrelation.map((t) => t.id)).toEqual(["tx-1"]);
    });

    it("direction/ok fuera de whitelist → 400", async () => {
      await expect(
        ctrl.browse("gateway-transactions", { direction: "SIDEBAND" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        ctrl.browse("gateway-transactions", { ok: "yes" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("browse membership-subscriptions", () => {
    beforeEach(() => {
      prisma.people.push({ id: "u1", name: "Alumna Uno" });
      prisma.academies.push({ id: "ac-1", name: "Academia X" });
      prisma.subscriptions.push(
        {
          id: "sub-1",
          personId: "u1",
          academyId: "ac-1",
          status: "ACTIVE",
          flowSubscriptionId: "fw-1",
          nextInvoiceAt: new Date("2025-12-01T00:00:00Z"),
          lastInvoiceId: "inv-1",
          canceledAt: null,
          createdAt: new Date("2025-11-01T00:00:00Z"),
          plan: { id: "plan-1", name: "Mensual" },
        },
        {
          id: "sub-2",
          personId: "u1",
          academyId: "ac-1",
          status: "CANCELED",
          flowSubscriptionId: null,
          nextInvoiceAt: null,
          lastInvoiceId: null,
          canceledAt: new Date("2025-11-15T00:00:00Z"),
          createdAt: new Date("2025-10-01T00:00:00Z"),
          plan: { id: "plan-1", name: "Mensual" },
        },
      );
    });

    it("resuelve person/academy/plan y filtra por status", async () => {
      const rows = (await ctrl.browse("membership-subscriptions", {
        academyId: "ac-1",
        status: "ACTIVE",
      })) as Row[];
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("sub-1");
      expect(rows[0].person).toEqual({ id: "u1", name: "Alumna Uno" });
      expect(rows[0].academy).toEqual({ id: "ac-1", name: "Academia X" });
      expect(rows[0].plan).toEqual({ id: "plan-1", name: "Mensual" });
    });

    it("status fuera de whitelist → 400", async () => {
      await expect(
        ctrl.browse("membership-subscriptions", { status: "WHATEVER" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it("entidad desconocida → 400 con la lista válida", async () => {
    await expect(ctrl.browse("wat", {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

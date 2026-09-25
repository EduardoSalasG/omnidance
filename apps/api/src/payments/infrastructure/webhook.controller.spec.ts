import { describe, it, expect, beforeEach } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import type { PaymentGateway } from "../domain/ports";
import type { PaymentSettlementService } from "../application/payment-settlement.service";
import type { SubscriptionsService } from "../application/subscriptions.service";
// Ciclo session.guard ⇄ auth.controller (SESSION_COOKIE): cargar
// auth.controller antes rompe el ciclo a favor del test (mismo patrón
// que payouts.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { PaymentsController } from "./webhook.controller";
import {
  encodeMembershipRef,
  encodeSeriesPassRef,
  encodeTicketOrderRef,
} from "../domain/order-ref";

// Vistas de auditoría de PaymentsController:
// - GET /payments/mine → solo pagos propios, con contexto resuelto.
// - GET /payments/by-event/:eventId → productor del evento o admin.access.
// - GET /payments/by-academy/:academyId → owner de la academia o
//   admin.access; solo MEMBERSHIP cuyo refId decodifica a plan propio.
// - GET /payments/:id/events → ledger por seq; owner o admin (ajeno → 404).
// PrismaService se simula in-memory con matching mínimo de `where`
// (incluye OR / in / startsWith, que usan los filtros nuevos).

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
        "startsWith" in c &&
        !(typeof v === "string" && v.startsWith(c.startsWith as string))
      )
        return false;
      if (
        "contains" in c &&
        !(typeof v === "string" && v.includes(c.contains as string))
      )
        return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

class FakePrisma {
  payments: Row[] = [];
  events: Row[] = [];
  series: Row[] = [];
  academies: Row[] = [];
  plans: Row[] = [];
  paymentEvents: Row[] = [];
  // Catálogo RBAC mínimo — roleKeysHavePermission lo consulta vía
  // role.findMany (cache de 30s compartido, los roles son estáticos).
  roles: Row[] = [
    { key: "ADMIN", isSuperuser: true, permissions: [] },
    {
      key: "PRODUCER",
      isSuperuser: false,
      permissions: [
        { permissionKey: "events.manage" },
        { permissionKey: "crm.manage" },
      ],
    },
    {
      key: "ACADEMY_OWNER",
      isSuperuser: false,
      permissions: [
        { permissionKey: "academies.create" },
        { permissionKey: "crm.manage" },
      ],
    },
    { key: "DANCER", isSuperuser: false, permissions: [] },
  ];

  role = {
    findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
      this.roles.filter((r) => where.key.in.includes(r.key as string)),
  };

  payment = {
    findMany: async (args: { where: Row; take?: number }) => {
      let rows = this.payments.filter((p) => matchWhere(p, args.where));
      rows = [...rows].sort(
        (a, b) =>
          (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
      );
      if (args.take) rows = rows.slice(0, args.take);
      return rows.map((p) => ({
        ...p,
        _count: {
          events: this.paymentEvents.filter((e) => e.paymentId === p.id)
            .length,
        },
      }));
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.payments.find((p) => p.id === where.id) ?? null,
  };

  event = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.events.find((e) => e.id === where.id) ?? null,
    findMany: async ({ where }: { where: Row }) =>
      this.events.filter((e) => matchWhere(e, where)),
  };

  eventSeries = {
    findMany: async ({ where }: { where: Row }) =>
      this.series.filter((s) => matchWhere(s, where)),
  };

  academy = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.academies.find((a) => a.id === where.id) ?? null,
    findMany: async ({ where }: { where: Row }) =>
      this.academies.filter((a) => matchWhere(a, where)),
  };

  membershipPlan = {
    findMany: async ({ where }: { where: Row }) =>
      this.plans.filter((p) => matchWhere(p, where)),
  };

  paymentEvent = {
    findMany: async ({ where }: { where: { paymentId: string } }) =>
      this.paymentEvents
        .filter((e) => e.paymentId === where.paymentId)
        .sort((a, b) => (a.seq as number) - (b.seq as number)),
  };
}

const req = (id: string, roles: string[] = ["DANCER"]) =>
  ({ person: { id, roles } }) as unknown as Request;

let seq = 0;
const BASE_TS = new Date("2025-11-10T12:00:00Z").getTime();
const mkPayment = (over: Row): Row => ({
  id: `pay-${++seq}`,
  orderType: "TICKET",
  refId: encodeTicketOrderRef("evt-1"),
  personId: "u1",
  eventId: null,
  amount: 10000,
  fee: 300,
  net: 9700,
  status: "PAID",
  // un minuto por pago — el orden desc es determinista sin depender
  // del clock real ni de cuántos tests corrieron antes.
  createdAt: new Date(BASE_TS + seq * 60_000),
  gatewayFeeClp: 319,
  gatewayReportedAmount: 10000,
  gatewayMedia: "WebPay",
  gatewayPaidAt: new Date("2025-11-10T12:01:00Z"),
  // Evidencia interna — nunca debe salir por los endpoints de auditoría.
  gatewayRaw: { raw: "full-getStatus" },
  ...over,
});

function mkCtrl(prisma: FakePrisma) {
  return new PaymentsController(
    prisma as unknown as PrismaService,
    {} as unknown as PaymentGateway,
    {} as unknown as PaymentSettlementService,
    {} as unknown as SubscriptionsService,
  );
}

describe("PaymentsController — vistas de auditoría", () => {
  let prisma: FakePrisma;
  let ctrl: PaymentsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = mkCtrl(prisma);

    prisma.events.push(
      { id: "evt-1", name: "Noche SBK", producerId: "prod-1" },
      { id: "evt-2", name: "Ajeno", producerId: "prod-2" },
    );
    prisma.series.push({ id: "ser-1", name: "La Gozadera" });
    prisma.academies.push(
      { id: "ac-1", name: "Academia X", ownerId: "u-owner" },
      { id: "ac-2", name: "Academia Y", ownerId: "u-other-owner" },
    );
    prisma.plans.push(
      { id: "plan-1", name: "Mensual Full", academyId: "ac-1" },
      { id: "plan-2", name: "Trimestral", academyId: "ac-2" },
    );
    prisma.payments.push(
      mkPayment({ id: "p-tkt", eventId: "evt-1" }),
      mkPayment({
        id: "p-mem",
        orderType: "MEMBERSHIP",
        refId: encodeMembershipRef("plan-1"),
        eventId: null,
        amount: 25000,
      }),
      mkPayment({
        id: "p-sp",
        orderType: "SERIES_PASS",
        refId: encodeSeriesPassRef("ser-1", "2025-11"),
        eventId: null,
      }),
      mkPayment({ id: "p-ajeno", personId: "u2", eventId: "evt-2" }),
      mkPayment({
        id: "p-mem-ajena",
        personId: "u2",
        orderType: "MEMBERSHIP",
        refId: encodeMembershipRef("plan-2"),
        eventId: null,
      }),
      // TICKET legacy sin eventId — el contexto sale del refId tkt_.
      mkPayment({
        id: "p-legacy",
        eventId: null,
        refId: encodeTicketOrderRef("evt-2"),
      }),
    );
    prisma.paymentEvents.push(
      {
        id: "ev-1",
        paymentId: "p-tkt",
        seq: 1,
        type: "ORDER_CREATED",
        actor: "system",
        prevHash: "GENESIS",
        payloadHash: "h1",
        payload: { amount: 10000 },
        createdAt: new Date(),
      },
      {
        id: "ev-2",
        paymentId: "p-tkt",
        seq: 2,
        type: "SETTLED",
        actor: "webhook",
        prevHash: "h1",
        payloadHash: "h2",
        payload: {},
        createdAt: new Date(),
      },
    );
  });

  describe("myPayments (GET /payments/mine)", () => {
    it("devuelve solo los pagos del autenticado, recientes primero", async () => {
      const rows = await ctrl.myPayments(req("u1"));
      expect(rows.map((r) => r.id)).toEqual([
        "p-legacy",
        "p-sp",
        "p-mem",
        "p-tkt",
      ]);
    });

    it("resuelve contexto por orderType y trae eventCount del ledger", async () => {
      const rows = await ctrl.myPayments(req("u1"));
      const tkt = rows.find((r) => r.id === "p-tkt")!;
      const mem = rows.find((r) => r.id === "p-mem")!;
      const sp = rows.find((r) => r.id === "p-sp")!;
      const legacy = rows.find((r) => r.id === "p-legacy")!;

      expect(tkt.eventName).toBe("Noche SBK");
      expect(tkt.eventCount).toBe(2);
      expect(mem.academyName).toBe("Academia X");
      expect(mem.planName).toBe("Mensual Full");
      expect(sp.seriesName).toBe("La Gozadera");
      // legacy sin eventId → decode del refId tkt_.
      expect(legacy.eventName).toBe("Ajeno");
    });

    it("expone la verdad monetaria del gateway pero jamás gatewayRaw", async () => {
      const rows = await ctrl.myPayments(req("u1"));
      const tkt = rows.find((r) => r.id === "p-tkt")!;
      expect(tkt.gatewayFeeClp).toBe(319);
      expect(tkt.gatewayReportedAmount).toBe(10000);
      expect(tkt.gatewayMedia).toBe("WebPay");
      expect(tkt).not.toHaveProperty("gatewayRaw");
      expect(tkt).not.toHaveProperty("personId");
    });
  });

  describe("paymentsByEvent (GET /payments/by-event/:eventId)", () => {
    it("productor del evento ve sus ventas (eventId directo)", async () => {
      const rows = await ctrl.paymentsByEvent(req("prod-1", ["PRODUCER"]), "evt-1");
      expect(rows.map((r) => r.id)).toEqual(["p-tkt"]);
    });

    it("otro productor (events.manage) NO ve el evento ajeno → 403", async () => {
      await expect(
        ctrl.paymentsByEvent(req("prod-2", ["PRODUCER"]), "evt-1"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("bailarín → 403", async () => {
      await expect(
        ctrl.paymentsByEvent(req("u1", ["DANCER"]), "evt-1"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("admin.access ve cualquier evento", async () => {
      const rows = await ctrl.paymentsByEvent(req("adm", ["ADMIN"]), "evt-1");
      expect(rows).toHaveLength(1);
    });

    it("evento inexistente → 404", async () => {
      await expect(
        ctrl.paymentsByEvent(req("prod-1", ["PRODUCER"]), "evt-x"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("paymentsByAcademy (GET /payments/by-academy/:academyId)", () => {
    it("owner ve solo MEMBERSHIP de sus planes (decode mem_<planId>_)", async () => {
      const rows = await ctrl.paymentsByAcademy(
        req("u-owner", ["ACADEMY_OWNER"]),
        "ac-1",
      );
      expect(rows.map((r) => r.id)).toEqual(["p-mem"]);
      expect(rows[0].academyName).toBe("Academia X");
    });

    it("no-owner → 403 (aunque sea owner de otra academia)", async () => {
      await expect(
        ctrl.paymentsByAcademy(req("u-other-owner", ["ACADEMY_OWNER"]), "ac-1"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("admin.access ve cualquier academia", async () => {
      const rows = await ctrl.paymentsByAcademy(req("adm", ["ADMIN"]), "ac-1");
      expect(rows).toHaveLength(1);
    });

    it("academia inexistente → 404; sin planes → []", async () => {
      await expect(
        ctrl.paymentsByAcademy(req("u-owner", ["ACADEMY_OWNER"]), "ac-x"),
      ).rejects.toBeInstanceOf(NotFoundException);
      prisma.academies.push({ id: "ac-3", name: "Sin planes", ownerId: "u-owner" });
      const rows = await ctrl.paymentsByAcademy(
        req("u-owner", ["ACADEMY_OWNER"]),
        "ac-3",
      );
      expect(rows).toEqual([]);
    });
  });

  describe("paymentEvents (GET /payments/:id/events)", () => {
    it("owner ve el ledger ordenado por seq con payloadHash", async () => {
      const events = await ctrl.paymentEvents(req("u1"), "p-tkt");
      expect(events.map((e) => e.seq)).toEqual([1, 2]);
      expect(events[0].payloadHash).toBe("h1");
    });

    it("ajeno → 404 (anti-enumeración, como GET /payments/:id)", async () => {
      await expect(ctrl.paymentEvents(req("u2"), "p-tkt")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("admin.access ve el ledger de cualquier pago", async () => {
      const events = await ctrl.paymentEvents(req("adm", ["ADMIN"]), "p-tkt");
      expect(events).toHaveLength(2);
    });

    it("pago inexistente → 404", async () => {
      await expect(ctrl.paymentEvents(req("u1"), "p-x")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

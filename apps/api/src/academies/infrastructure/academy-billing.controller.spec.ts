import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Academy } from "@prisma/client";
import type { Request } from "express";
import type { AcademyAccess } from "./academy-access.service";
import type { PlatformSubscriptionsService } from "../../payments/application/platform-subscriptions.service";
// Ciclo session.guard ⇄ auth.controller (SESSION_COOKIE): cargar
// auth.controller antes rompe el ciclo a favor del test (mismo patrón
// que webhook.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { AcademyBillingController } from "./academy-billing.controller";

// AcademyBillingController - gate de acceso (capacidad billing → 403/404
// propagado, el service no se toca), shape del subscribe
// (needs_card → {paymentUrl}, subscribed → status ACTIVE) y la
// propagación del 400 tier_limit del dominio (body {error,active,max}
// intacto para que el front muestre el copy honesto).

const ACADEMY = { id: "ac1", name: "Academia X", ownerId: "p1" } as Academy;
const req = (id: string) =>
  ({ person: { id, roles: [] } }) as unknown as Request;

function mkAccess(behavior: "ok" | "forbidden" | "notfound" = "ok") {
  return {
    requireCapability: vi.fn(async () => {
      if (behavior === "forbidden") {
        throw new ForbiddenException("requiere ser owner o ADMIN");
      }
      if (behavior === "notfound") {
        throw new NotFoundException("academia no encontrada");
      }
      return { academy: ACADEMY, ctx: { ownerId: "p1", instructorIds: [] } };
    }),
  };
}

function mkService() {
  return {
    subscribeAcademy: vi.fn(
      async (): Promise<
        | { kind: "needs_card"; paymentUrl: string; subscriptionId: string }
        | { kind: "subscribed"; subscriptionId: string }
      > => ({
        kind: "needs_card",
        paymentUrl: "https://flow.example/register?token=rt1",
        subscriptionId: "psub-1",
      }),
    ),
    updateAcademySubscription: vi.fn(async () => ({
      id: "psub-1",
      status: "CANCEL_PENDING",
      tierCode: "PRO",
      billingCycle: "MONTHLY",
      pendingTierCode: "STARTER",
      pendingBillingCycle: "MONTHLY",
      nextInvoiceAt: new Date("2026-11-05"),
    })),
    cancelAcademySubscription: vi.fn(async () => ({
      ok: true,
      status: "CANCEL_PENDING",
      subscriptionId: "psub-1",
    })),
    academyBillingView: vi.fn(async () => ({
      tier: "PRO",
      status: "ACTIVE",
      activeStudents: 10,
      maxStudents: 120,
      invoices: [],
    })),
  };
}

describe("AcademyBillingController", () => {
  let access: ReturnType<typeof mkAccess>;
  let service: ReturnType<typeof mkService>;
  let ctrl: AcademyBillingController;

  beforeEach(() => {
    access = mkAccess();
    service = mkService();
    ctrl = new AcademyBillingController(
      access as unknown as AcademyAccess,
      service as unknown as PlatformSubscriptionsService,
    );
  });

  it("POST /subscribe - needs_card → {paymentUrl, subscriptionId, PENDING_CARD}", async () => {
    const r = await ctrl.subscribe(
      "ac1",
      { tier: "STARTER", cycle: "MONTHLY", acceptRecurring: true },
      req("p1"),
    );
    expect(access.requireCapability).toHaveBeenCalledWith(
      "ac1",
      expect.objectContaining({ id: "p1" }),
      "billing",
    );
    expect(service.subscribeAcademy).toHaveBeenCalledWith(
      "p1",
      ACADEMY,
      { tier: "STARTER", cycle: "MONTHLY", acceptRecurring: true },
    );
    expect(r).toEqual({
      paymentUrl: "https://flow.example/register?token=rt1",
      subscriptionId: "psub-1",
      status: "PENDING_CARD",
    });
  });

  it("POST /subscribe - ya con tarjeta → {paymentUrl:null, status:ACTIVE}", async () => {
    service.subscribeAcademy.mockResolvedValue({
      kind: "subscribed",
      subscriptionId: "psub-1",
    });
    const r = await ctrl.subscribe(
      "ac1",
      { tier: "PRO", cycle: "ANNUAL", acceptRecurring: true },
      req("p1"),
    );
    expect(r).toEqual({
      paymentUrl: null,
      subscriptionId: "psub-1",
      status: "ACTIVE",
    });
  });

  it("POST /subscribe - sin ser owner → 403 y el service no corre", async () => {
    access = mkAccess("forbidden");
    ctrl = new AcademyBillingController(
      access as unknown as AcademyAccess,
      service as unknown as PlatformSubscriptionsService,
    );
    await expect(
      ctrl.subscribe(
        "ac1",
        { tier: "STARTER", cycle: "MONTHLY", acceptRecurring: true },
        req("otro"),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(service.subscribeAcademy).not.toHaveBeenCalled();
  });

  it("POST /subscribe - academia inexistente → 404", async () => {
    access = mkAccess("notfound");
    ctrl = new AcademyBillingController(
      access as unknown as AcademyAccess,
      service as unknown as PlatformSubscriptionsService,
    );
    await expect(
      ctrl.subscribe(
        "ac-x",
        { tier: "STARTER", cycle: "MONTHLY", acceptRecurring: true },
        req("p1"),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("POST /subscribe - 400 tier_limit del dominio llega intacto", async () => {
    service.subscribeAcademy.mockRejectedValue(
      new BadRequestException({
        error: "tier_limit",
        message: "no cabe",
        active: 200,
        max: 120,
      }),
    );
    const err = await ctrl
      .subscribe(
        "ac1",
        { tier: "PRO", cycle: "MONTHLY", acceptRecurring: true },
        req("p1"),
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({
      error: "tier_limit",
      active: 200,
      max: 120,
    });
  });

  it("PATCH /subscription - devuelve el estado + cambio pendiente", async () => {
    const r = await ctrl.update(
      "ac1",
      { tier: "STARTER" },
      req("p1"),
    );
    expect(r).toMatchObject({
      subscriptionId: "psub-1",
      status: "CANCEL_PENDING",
      pendingTier: "STARTER",
    });
    expect(service.updateAcademySubscription).toHaveBeenCalledWith(
      "p1",
      ACADEMY,
      { tier: "STARTER", cycle: undefined },
    );
  });

  it("POST /subscription/cancel - delega y devuelve ok", async () => {
    const r = await ctrl.cancel("ac1", req("p1"));
    expect(r).toEqual({
      ok: true,
      status: "CANCEL_PENDING",
      subscriptionId: "psub-1",
    });
    expect(service.cancelAcademySubscription).toHaveBeenCalledWith("ac1");
  });

  it("GET /billing - devuelve la vista del service", async () => {
    const r = await ctrl.billing("ac1", req("p1"));
    expect(r).toMatchObject({
      tier: "PRO",
      status: "ACTIVE",
      activeStudents: 10,
    });
  });

  it("GET /billing - ajeno → 403", async () => {
    access = mkAccess("forbidden");
    ctrl = new AcademyBillingController(
      access as unknown as AcademyAccess,
      service as unknown as PlatformSubscriptionsService,
    );
    await expect(ctrl.billing("ac1", req("otro"))).rejects.toThrow(
      ForbiddenException,
    );
    expect(service.academyBillingView).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
// Ciclo session.guard ⇄ auth.controller (SESSION_COOKIE): cargar
// auth.controller antes rompe el ciclo a favor del test (mismo patrón
// que payouts.controller.spec.ts).
import "../../auth/infrastructure/auth.controller";
import { AcademySalesController } from "./academy-sales.controller";
import {
  AcademyNotApprovedError,
  DuplicateAgreementError,
} from "../application/academy-sales.service";

// AcademySalesController - spec academy-presale-commission. El service va
// stubbed: acá se verifica routing de DTO→service y el mapeo de errores
// de dominio a HTTP (404/400/409); ForbiddenException pasa tal cual.

const req = (id = "prod-1") =>
  ({ person: { id, roles: ["PRODUCER"] } }) as unknown as Request;

describe("AcademySalesController", () => {
  let ctrl: AcademySalesController;
  let sales: {
    createAgreement: ReturnType<typeof vi.fn>;
    listForEvent: ReturnType<typeof vi.fn>;
    patchAgreement: ReturnType<typeof vi.fn>;
    listForAcademy: ReturnType<typeof vi.fn>;
    markPaid: ReturnType<typeof vi.fn>;
    createPresaleCode: ReturnType<typeof vi.fn>;
    listPresaleCodes: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    sales = {
      createAgreement: vi.fn(async () => ({ id: "agr-1" })),
      listForEvent: vi.fn(async () => []),
      patchAgreement: vi.fn(async () => ({ id: "agr-1" })),
      listForAcademy: vi.fn(async () => []),
      markPaid: vi.fn(async () => ({ id: "set-1", amountDue: 12000 })),
      createPresaleCode: vi.fn(async () => ({ code: "AC-15NOV-AAAA" })),
      listPresaleCodes: vi.fn(async () => []),
    };
    ctrl = new AcademySalesController(sales as never);
  });

  it("POST /events/:id/academy-deals → createAgreement con el evento del path", async () => {
    await ctrl.create("evt-1", req(), {
      academyId: "ac-1",
      commissionPct: 50,
      maxTickets: 30,
    });
    expect(sales.createAgreement).toHaveBeenCalledWith(
      expect.objectContaining({ id: "prod-1" }),
      {
        eventId: "evt-1",
        seriesId: undefined,
        academyId: "ac-1",
        commissionPct: 50,
        maxTickets: 30,
      },
    );
  });

  it("GET /events/:id/academy-deals → listForEvent", async () => {
    await ctrl.listForEvent("evt-1", req());
    expect(sales.listForEvent).toHaveBeenCalledWith(
      "evt-1",
      expect.objectContaining({ id: "prod-1" }),
    );
  });

  it("PATCH /academy-deals/:id → patchAgreement con action y campos", async () => {
    await ctrl.patch("agr-1", req(), { action: "accept" });
    expect(sales.patchAgreement).toHaveBeenCalledWith(
      "agr-1",
      expect.objectContaining({ id: "prod-1" }),
      { action: "accept", commissionPct: undefined, maxTickets: undefined },
    );
    await ctrl.patch("agr-1", req(), { commissionPct: 40 });
    expect(sales.patchAgreement).toHaveBeenLastCalledWith(
      "agr-1",
      expect.anything(),
      { action: undefined, commissionPct: 40, maxTickets: undefined },
    );
  });

  it("GET /academies/:id/sale-deals → listForAcademy", async () => {
    await ctrl.listForAcademy("ac-1", req("own-1"));
    expect(sales.listForAcademy).toHaveBeenCalledWith(
      "ac-1",
      expect.objectContaining({ id: "own-1" }),
    );
  });

  it("POST /academy-deals/:id/mark-paid → markPaid con evidenceUrl opcional", async () => {
    await ctrl.markPaid("agr-1", req(), {
      evidenceUrl: "https://drive/x.pdf",
    });
    expect(sales.markPaid).toHaveBeenCalledWith(
      "agr-1",
      expect.objectContaining({ id: "prod-1" }),
      "https://drive/x.pdf",
    );
    // Sin body no explota - evidenceUrl undefined.
    await ctrl.markPaid("agr-1", req(), undefined);
    expect(sales.markPaid).toHaveBeenLastCalledWith(
      "agr-1",
      expect.anything(),
      undefined,
    );
  });

  it("errores de dominio → HTTP: 404/400/409 y 403 pasa directo", async () => {
    sales.createAgreement.mockRejectedValueOnce(
      new NotFoundException("evento no encontrado"),
    );
    await expect(ctrl.create("evt-9", req(), {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    sales.createAgreement.mockRejectedValueOnce(new AcademyNotApprovedError());
    await expect(ctrl.create("evt-1", req(), {} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    sales.createAgreement.mockRejectedValueOnce(new DuplicateAgreementError());
    await expect(ctrl.create("evt-1", req(), {} as never)).rejects.toBeInstanceOf(
      ConflictException,
    );

    sales.patchAgreement.mockRejectedValueOnce(
      new ForbiddenException("solo el productor del evento o un admin"),
    );
    await expect(
      ctrl.patch("agr-1", req(), { action: "disable" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("POST /academy-deals/:id/codes → createPresaleCode", async () => {
    const res = await ctrl.createCode("agr-1", req("ac-9"));
    expect(sales.createPresaleCode).toHaveBeenCalledWith(
      "agr-1",
      expect.objectContaining({ id: "ac-9" }),
    );
    expect(res).toEqual({ code: "AC-15NOV-AAAA" });
  });

  it("GET /academy-deals/:id/codes → listPresaleCodes", async () => {
    await ctrl.listCodes("agr-1", req("ac-9"));
    expect(sales.listPresaleCodes).toHaveBeenCalledWith(
      "agr-1",
      expect.objectContaining({ id: "ac-9" }),
    );
  });

  it("rechazos async del listado se capturan (métodos async + await)", async () => {
    sales.listForEvent.mockRejectedValueOnce(
      new NotFoundException("evento no encontrado"),
    );
    await expect(ctrl.listForEvent("evt-9", req())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    sales.listForAcademy.mockRejectedValueOnce(
      new ForbiddenException("sin acceso a la academia"),
    );
    await expect(
      ctrl.listForAcademy("ac-1", req("otro")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

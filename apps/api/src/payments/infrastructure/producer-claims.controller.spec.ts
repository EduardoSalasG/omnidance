import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { Request, Response } from "express";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller
import { ProducerClaimsController } from "./producer-claims.controller";
import type { PrismaService } from "../../prisma.service";
import type { ProducerClaimsService } from "./producer-claims.service";

// Gate y delegación del controller de métodos/claims propios (spec
// producer-own-methods): solo productor APPROVED o admin.access
// administran; el comprador crea claims sobre su orden; el stream del
// comprobante es privado (comprador dueño, productor o admin).

const req = (id: string, roles: string[] = []) =>
  ({ person: { id, roles } }) as unknown as Request;

function mk(over: {
  producer?: boolean;
  admin?: boolean;
  eventProducer?: string | null;
  claim?: { personId: string; producerId: string; receiptKey: string } | null;
}) {
  const prisma = {
    personRole: {
      findUnique: vi.fn(async () =>
        over.producer ? { status: "APPROVED" } : null,
      ),
    },
    role: {
      findMany: vi.fn(async () =>
        over.admin
          ? [
              {
                key: "ADMIN",
                isSuperuser: false,
                permissions: [{ permissionKey: "admin.access" }],
              },
            ]
          : [],
      ),
    },
    event: {
      findUnique: vi.fn(async () =>
        over.eventProducer === undefined
          ? { producerId: "prod-1" }
          : over.eventProducer === null
            ? { producerId: null }
            : { producerId: over.eventProducer },
      ),
    },
  };
  const claims = {
    listMethods: vi.fn(async () => [{ id: "m1" }]),
    createMethod: vi.fn(async (_p: string, dto: unknown) => ({
      id: "m1",
      ...(dto as Record<string, unknown>),
    })),
    updateMethod: vi.fn(async () => ({ id: "m1", label: "nuevo" })),
    deleteMethod: vi.fn(async () => ({ ok: true })),
    createClaim: vi.fn(async () => ({ id: "clm-1", status: "PENDING" })),
    listClaimsOfPayment: vi.fn(async () => []),
    listClaims: vi.fn(async () => ({
      items: [{ id: "clm-1" }],
      total: 1,
      page: 1,
      pageSize: 25,
    })),
    claimDetail: vi.fn(async () => ({ id: "clm-1", status: "PENDING" })),
    approve: vi.fn(async () => ({ claim: { id: "clm-1" } })),
    reject: vi.fn(async () => ({ claim: { id: "clm-1" } })),
    loadClaimForReceipt: vi.fn(async () => over.claim),
    assertCanView: vi.fn(
      (
        claim: { personId: string; producerId: string },
        viewerId: string,
        isAdmin: boolean,
      ) => {
        if (
          !isAdmin &&
          claim.personId !== viewerId &&
          claim.producerId !== viewerId
        ) {
          throw new ForbiddenException();
        }
      },
    ),
    readReceipt: vi.fn(async () => Buffer.from("png")),
  };
  const ctrl = new ProducerClaimsController(
    prisma as unknown as PrismaService,
    claims as unknown as ProducerClaimsService,
  );
  return { ctrl, claims };
}

describe("ProducerClaimsController — gate", () => {
  it("sin productor APPROVED ni admin → 403 en todas las rutas de gestión", async () => {
    const { ctrl } = mk({});
    await expect(ctrl.listMyMethods(req("me"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      ctrl.createMethod(req("me"), { type: "TRANSFER", label: "x", details: {} }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctrl.listClaims({}, req("me"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(ctrl.approve("clm-1", req("me"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      ctrl.reject("clm-1", { note: "x" }, req("me")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("productor APPROVED administra métodos y cola", async () => {
    const { ctrl, claims } = mk({ producer: true });
    await ctrl.createMethod(req("me"), {
      type: "TRANSFER",
      label: "Banco",
      details: { bank: "Estado" },
    });
    expect(claims.createMethod).toHaveBeenCalledWith("me", {
      type: "TRANSFER",
      label: "Banco",
      details: { bank: "Estado" },
    });
    const out = await ctrl.listClaims({ status: "PENDING" }, req("me"));
    expect(out).toEqual({
      claims: [{ id: "clm-1" }],
      total: 1,
      page: 1,
      pageSize: 25,
    });
    expect(claims.listClaims).toHaveBeenCalledWith(
      "me",
      {
        status: "PENDING",
        from: undefined,
        to: undefined,
      },
      expect.objectContaining({ page: 1, pageSize: 25 }),
    );
    // Filtros opcionales del contrato compartido: from/to se parsean a Date.
    await ctrl.listClaims(
      { from: "2026-10-01", to: "2026-10-31" },
      req("me"),
    );
    expect(claims.listClaims).toHaveBeenCalledWith(
      "me",
      {
        status: undefined,
        from: new Date("2026-10-01"),
        to: new Date("2026-10-31"),
      },
      expect.objectContaining({ page: 1 }),
    );
    const detail = await ctrl.claimDetail("clm-1", req("me"));
    expect(detail).toEqual({ id: "clm-1", status: "PENDING" });
    expect(claims.claimDetail).toHaveBeenCalledWith("me", "clm-1");
    await ctrl.approve("clm-1", req("me"));
    expect(claims.approve).toHaveBeenCalledWith("me", "clm-1", "me");
    await ctrl.reject("clm-1", { note: "monto no calza" }, req("me"));
    expect(claims.reject).toHaveBeenCalledWith(
      "me",
      "clm-1",
      "me",
      "monto no calza",
    );
  });

  it("admin.access pasa el gate sin ser productor", async () => {
    const { ctrl } = mk({ admin: true });
    const out = await ctrl.listMyMethods(req("admin-1", ["ADMIN"]));
    expect(out).toEqual([{ id: "m1" }]);
  });
});

describe("ProducerClaimsController — métodos públicos del evento", () => {
  it("evento con productor → métodos activos de ESE productor", async () => {
    const { ctrl, claims } = mk({});
    const out = await ctrl.methodsForEvent("evt-1");
    expect(claims.listMethods).toHaveBeenCalledWith("prod-1");
    expect(out.methods).toEqual([{ id: "m1" }]);
  });

  it("evento sin productor → [] sin tocar el service", async () => {
    const { ctrl, claims } = mk({ eventProducer: null });
    const out = await ctrl.methodsForEvent("evt-1");
    expect(out.methods).toEqual([]);
    expect(claims.listMethods).not.toHaveBeenCalled();
  });
});

describe("ProducerClaimsController — claims del comprador", () => {
  it("delega archivo + methodId/note al service con el personId de sesión", async () => {
    const { ctrl, claims } = mk({});
    const file = { mimetype: "image/png", size: 10 } as Express.Multer.File;
    await ctrl.createClaim("pay-1", file, "met-1", "pagado", req("buyer-1"));
    expect(claims.createClaim).toHaveBeenCalledWith(
      "pay-1",
      "buyer-1",
      file,
      { methodId: "met-1", note: "pagado" },
    );
  });

  it("receipt: el comprador dueño ve su comprobante", async () => {
    const { ctrl, claims } = mk({
      claim: { personId: "buyer-1", producerId: "prod-1", receiptKey: "k.png" },
    });
    const res = {
      setHeader: vi.fn(),
      send: vi.fn(),
    } as unknown as Response;
    await ctrl.receipt("clm-1", req("buyer-1"), res);
    expect(claims.readReceipt).toHaveBeenCalledWith("k.png");
    expect(res.send).toHaveBeenCalled();
  });

  it("receipt: usuario ajeno → 403 (service decide)", async () => {
    const { ctrl } = mk({
      claim: { personId: "buyer-1", producerId: "prod-1", receiptKey: "k.png" },
    });
    const res = { setHeader: vi.fn(), send: vi.fn() } as unknown as Response;
    await expect(ctrl.receipt("clm-1", req("otro"), res)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

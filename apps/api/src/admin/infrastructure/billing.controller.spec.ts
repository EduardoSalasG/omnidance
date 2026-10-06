import { describe, expect, it, vi } from "vitest";
import "../../auth/infrastructure/auth.controller"; // rompe el ciclo session.guard ⇄ auth.controller
import {
  AdminBillingController,
  MeBillingController,
} from "./billing.controller";
import type { AdminBillingService } from "../application/billing.service";

// Billing controllers (spec admin-billing-documents): wiring de rutas —
// generate delega payoutId+actor, pdf responde stream con headers, void
// pasa motivo+actor, /me/billing acota al person de la sesión.

const req = (id = "adm-1") => ({ person: { id } }) as never;

function mkBilling() {
  return {
    generate: vi.fn(async () => ({ id: "d1", folio: 7 })),
    candidates: vi.fn(async () => [{ id: "po-1" }]),
    list: vi.fn(async () => []),
    listMine: vi.fn(async () => [{ id: "d1" }]),
    pdfBuffer: vi.fn(async () => ({
      doc: { folio: 7 },
      buffer: Buffer.from("pdf"),
    })),
    void: vi.fn(async () => ({ id: "d1", status: "VOID" })),
  } as unknown as AdminBillingService;
}

const mkRes = () => {
  const res = {
    headers: {} as Record<string, string>,
    body: null as Buffer | null,
    setHeader(k: string, v: string) {
      res.headers[k] = v;
    },
    end(b: Buffer) {
      res.body = b;
    },
  };
  return res as never as import("express").Response & typeof res;
};

describe("AdminBillingController", () => {
  it("generate delega payoutId y actor de sesión", async () => {
    const billing = mkBilling();
    const ctrl = new AdminBillingController(billing);
    await ctrl.generate({ payoutId: "po-1" }, req());
    expect(billing.generate).toHaveBeenCalledWith("po-1", "adm-1");
  });

  it("pdf responde el stream con headers de documento", async () => {
    const billing = mkBilling();
    const ctrl = new AdminBillingController(billing);
    const res = mkRes();
    await ctrl.pdf("d1", res);
    expect(res.headers["Content-Type"]).toBe("application/pdf");
    expect(res.headers["Content-Disposition"]).toContain(
      "nota-cobro-7.pdf",
    );
    expect(res.headers["Cache-Control"]).toBe("private, no-store");
    expect(res.body?.toString()).toBe("pdf");
  });

  it("void pasa motivo y actor", async () => {
    const billing = mkBilling();
    const ctrl = new AdminBillingController(billing);
    await ctrl.void("d1", { reason: "duplicada" }, req("adm-9"));
    expect(billing.void).toHaveBeenCalledWith("d1", "duplicada", "adm-9");
  });
});

describe("MeBillingController", () => {
  it("list acota al person de sesión", async () => {
    const billing = mkBilling();
    const ctrl = new MeBillingController(billing);
    await ctrl.list(req("p-1"));
    expect(billing.listMine).toHaveBeenCalledWith("p-1");
  });

  it("pdf propio pasa el personId como filtro de ownership", async () => {
    const billing = mkBilling();
    const ctrl = new MeBillingController(billing);
    const res = mkRes();
    await ctrl.pdf("d1", req("p-1"), res);
    expect(billing.pdfBuffer).toHaveBeenCalledWith("d1", "p-1");
  });
});

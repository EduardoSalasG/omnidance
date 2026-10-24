import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma.service";
import { AcademyPromosService } from "./academy-promos.service";
import { promoChargeClp } from "../domain/academy-promos";

// AcademyPromosService (spec member-promos): resolución de la promo
// vigente para (academia, alumno, plan) - fake prisma con store de
// promos + conteo de Payment PAID marcados (base de maxCycles).

type Row = Record<string, unknown>;

const NOW = new Date();
const PAST = new Date(NOW.getTime() - 86_400_000);
const FUTURE = new Date(NOW.getTime() + 30 * 86_400_000);

function mkPromo(over: Partial<Row> = {}): Row {
  return {
    id: "pr1",
    academyId: "ac1",
    name: "Beca",
    discountType: "PERCENT",
    percentOff: 50,
    amountOffClp: null,
    validFrom: PAST,
    validUntil: FUTURE,
    maxCycles: null,
    enabled: true,
    plans: [],
    persons: [],
    ...over,
  };
}

function matchWhere(row: Row, where: Row): boolean {
  for (const [k, cond] of Object.entries(where)) {
    const v = row[k];
    if (cond != null && typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Row;
      if ("lte" in c) {
        if (!(v instanceof Date) || v.getTime() > (c.lte as Date).getTime())
          return false;
      } else if ("gte" in c) {
        if (!(v instanceof Date) || v.getTime() < (c.gte as Date).getTime())
          return false;
      } else if (v !== cond) {
        return false;
      }
    } else if (v !== cond) {
      return false;
    }
  }
  return true;
}

function mkSvc(promos: Row[], payments: Row[] = []) {
  const prisma = {
    academyPromo: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        promos.filter((p) => matchWhere(p, where)),
      ),
    },
    payment: {
      count: vi.fn(async ({ where }: { where: Row }) =>
        payments.filter((p) => matchWhere(p, where)).length,
      ),
    },
  };
  return {
    svc: new AcademyPromosService(prisma as unknown as PrismaService),
    prisma,
  };
}

const PAID_MARKED = (promoId: string, personId: string): Row => ({
  id: `pay-${promoId}-${personId}-${Math.random()}`,
  academyPromoId: promoId,
  personId,
  status: "PAID",
});

describe("AcademyPromosService.resolveApplicable", () => {
  it("sin promos o deshabilitada → null", async () => {
    expect(
      await mkSvc([]).svc.resolveApplicable("ac1", "p1", "plan1", 10000),
    ).toBeNull();
    const { svc } = mkSvc([mkPromo({ enabled: false })]);
    expect(await svc.resolveApplicable("ac1", "p1", "plan1", 10000)).toBeNull();
  });

  it("fuera de ventana (expirada o no iniciada) → null", async () => {
    const expired = mkPromo({ validUntil: PAST });
    const scheduled = mkPromo({ id: "pr2", validFrom: FUTURE });
    const { svc } = mkSvc([expired, scheduled]);
    expect(await svc.resolveApplicable("ac1", "p1", "plan1", 10000)).toBeNull();
  });

  it("plan scope: lista vacía = todos; plan fuera del scope → null", async () => {
    const scoped = mkPromo({ plans: [{ id: "plan1" }] });
    const { svc } = mkSvc([scoped]);
    expect(
      await svc.resolveApplicable("ac1", "p1", "plan1", 10000),
    ).not.toBeNull();
    expect(
      await svc.resolveApplicable("ac1", "p1", "plan2", 10000),
    ).toBeNull();
    // Vacío = todos los planes de la academia
    const { svc: svcAll } = mkSvc([mkPromo()]);
    expect(
      await svcAll.resolveApplicable("ac1", "p1", "plan2", 10000),
    ).not.toBeNull();
  });

  it("whitelist: match aplica, miss no; vacía = todos", async () => {
    const whitelisted = mkPromo({ persons: [{ id: "p1" }] });
    const { svc } = mkSvc([whitelisted]);
    expect(
      await svc.resolveApplicable("ac1", "p1", "plan1", 10000),
    ).not.toBeNull();
    expect(await svc.resolveApplicable("ac1", "p2", "plan1", 10000)).toBeNull();
  });

  it("preventa: persona en whitelist sin inscripción aplica igual", async () => {
    // La resolución no consulta Enrollment - un registrado sin inscribirse
    // ya califica (spec: "Preventa sin inscripción").
    const promo = mkPromo({ persons: [{ id: "nuevo" }] });
    const { svc } = mkSvc([promo]);
    const r = await svc.resolveApplicable("ac1", "nuevo", "plan1", 10000);
    expect(r?.id).toBe("pr1");
  });

  it("maxCycles agotado → null (vuelve a precio lleno)", async () => {
    const promo = mkPromo({ maxCycles: 2 });
    const payments = [PAID_MARKED("pr1", "p1"), PAID_MARKED("pr1", "p1")];
    const { svc } = mkSvc([promo], payments);
    expect(await svc.resolveApplicable("ac1", "p1", "plan1", 10000)).toBeNull();
    // Otro alumno sin cobros sí aplica
    expect(
      await svc.resolveApplicable("ac1", "p2", "plan1", 10000),
    ).not.toBeNull();
  });

  it("varias promos califican → gana la de mayor ahorro", async () => {
    const pct = mkPromo({ percentOff: 50 });
    const fixed = mkPromo({
      id: "pr2",
      discountType: "FIXED_CLP",
      percentOff: null,
      amountOffClp: 9000,
    });
    const { svc } = mkSvc([pct, fixed]);
    const r = await svc.resolveApplicable("ac1", "p1", "plan1", 10000);
    expect(r?.id).toBe("pr2"); // −9000 > −5000
  });

  it("academia distinta no cruza", async () => {
    const other = mkPromo({ academyId: "ac2" });
    const { svc } = mkSvc([other]);
    expect(await svc.resolveApplicable("ac1", "p1", "plan1", 10000)).toBeNull();
  });
});

describe("promoChargeClp (reuso del dominio platform-promos)", () => {
  it("PERCENT rebaja el % del cargo con piso $0", () => {
    expect(
      promoChargeClp(10000, {
        discountType: "PERCENT",
        percentOff: 50,
        amountOffClp: null,
      }),
    ).toBe(5000);
    expect(
      promoChargeClp(10000, {
        discountType: "PERCENT",
        percentOff: 100,
        amountOffClp: null,
      }),
    ).toBe(0);
  });

  it("FIXED_CLP descuenta el monto con piso $0", () => {
    expect(
      promoChargeClp(10000, {
        discountType: "FIXED_CLP",
        percentOff: null,
        amountOffClp: 3000,
      }),
    ).toBe(7000);
    expect(
      promoChargeClp(10000, {
        discountType: "FIXED_CLP",
        percentOff: null,
        amountOffClp: 25000,
      }),
    ).toBe(0);
  });
});

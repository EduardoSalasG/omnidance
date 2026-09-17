import { describe, it, expect } from "vitest";
import { PricingService } from "./pricing.service";

// PricingService — cálculo puro del quote de checkout (omni-dance.md §10):
// serviceFee = SERVICE_FEE_PCT % sobre la lista post-descuento.
describe("PricingService.quote", () => {
  const pricing = new PricingService();

  it("sin descuento: total = lista + fee del % sobre lista", () => {
    const q = pricing.quote({ listPrice: 10000, serviceFeePct: 8 });
    expect(q).toEqual({
      listPrice: 10000,
      discount: 0,
      serviceFee: 800,
      total: 10800,
    });
  });

  it("percentOff aplica sobre lista y el fee se calcula post-descuento", () => {
    const q = pricing.quote({
      listPrice: 10000,
      serviceFeePct: 8,
      discount: { percentOff: 50 },
    });
    expect(q.discount).toBe(5000);
    expect(q.serviceFee).toBe(400); // 8% de 5000
    expect(q.total).toBe(5400);
  });

  it("amountOff descuenta monto fijo", () => {
    const q = pricing.quote({
      listPrice: 10000,
      serviceFeePct: 8,
      discount: { amountOff: 3000 },
    });
    expect(q.discount).toBe(3000);
    expect(q.serviceFee).toBe(560); // 8% de 7000
    expect(q.total).toBe(7560);
  });

  it("amountOff no excede la lista (cap) → total 0", () => {
    const q = pricing.quote({
      listPrice: 5000,
      serviceFeePct: 8,
      discount: { amountOff: 99999 },
    });
    expect(q.discount).toBe(5000);
    expect(q.serviceFee).toBe(0);
    expect(q.total).toBe(0);
  });

  it("percentOff 100 → gratis, fee 0", () => {
    const q = pricing.quote({
      listPrice: 8000,
      serviceFeePct: 8,
      discount: { percentOff: 100 },
    });
    expect(q.discount).toBe(8000);
    expect(q.total).toBe(0);
  });

  it("percentOff + amountOff combinados quedan capeados en la lista", () => {
    const q = pricing.quote({
      listPrice: 10000,
      serviceFeePct: 8,
      discount: { percentOff: 60, amountOff: 6000 },
    });
    expect(q.discount).toBe(10000); // 6000 + 6000 → cap 10000
    expect(q.total).toBe(0);
  });

  it("el fee redondea al entero más cercano (CLP)", () => {
    const q = pricing.quote({ listPrice: 9999, serviceFeePct: 8 });
    expect(q.serviceFee).toBe(800); // 799.92 → 800
    expect(q.total).toBe(10799);
  });

  it("serviceFeePct 0 → sin cargo", () => {
    const q = pricing.quote({ listPrice: 10000, serviceFeePct: 0 });
    expect(q.serviceFee).toBe(0);
    expect(q.total).toBe(10000);
  });

  it("discount null/undefined equivale a sin descuento", () => {
    expect(
      pricing.quote({ listPrice: 1000, serviceFeePct: 8, discount: null })
        .discount,
    ).toBe(0);
    expect(pricing.quote({ listPrice: 1000, serviceFeePct: 8 }).discount).toBe(
      0,
    );
  });
});

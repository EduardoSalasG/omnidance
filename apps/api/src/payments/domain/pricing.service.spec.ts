import { describe, it, expect } from "vitest";
import { PricingService } from "./pricing.service";

// PricingService - cálculo puro del quote de checkout
// (omni-dance.md §10, spec producer-fee-model): el comprador paga
// exactamente el precio publicado - no existe fee al comprador.
describe("PricingService.quote", () => {
  const pricing = new PricingService();

  it("sin descuento: total = lista exacta", () => {
    const q = pricing.quote({ listPrice: 10000 });
    expect(q).toEqual({ listPrice: 10000, discount: 0, total: 10000 });
  });

  it("percentOff aplica sobre lista", () => {
    const q = pricing.quote({
      listPrice: 10000,
      discount: { percentOff: 50 },
    });
    expect(q.discount).toBe(5000);
    expect(q.total).toBe(5000);
  });

  it("amountOff descuenta monto fijo", () => {
    const q = pricing.quote({
      listPrice: 10000,
      discount: { amountOff: 3000 },
    });
    expect(q.discount).toBe(3000);
    expect(q.total).toBe(7000);
  });

  it("amountOff no excede la lista (cap) → entrada gratis", () => {
    const q = pricing.quote({
      listPrice: 5000,
      discount: { amountOff: 99999 },
    });
    expect(q.discount).toBe(5000);
    expect(q.total).toBe(0);
  });

  it("percentOff 100 → cortesía gratis", () => {
    const q = pricing.quote({
      listPrice: 8000,
      discount: { percentOff: 100 },
    });
    expect(q.discount).toBe(8000);
    expect(q.total).toBe(0);
  });

  it("percentOff + amountOff combinados quedan capeados en la lista", () => {
    const q = pricing.quote({
      listPrice: 10000,
      discount: { percentOff: 60, amountOff: 6000 },
    });
    expect(q.discount).toBe(10000); // 6000 + 6000 → cap 10000
    expect(q.total).toBe(0);
  });

  it("discount null/undefined equivale a sin descuento", () => {
    expect(pricing.quote({ listPrice: 1000, discount: null }).discount).toBe(0);
    expect(pricing.quote({ listPrice: 1000 }).discount).toBe(0);
  });
});

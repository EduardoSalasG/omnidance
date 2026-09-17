import { describe, it, expect } from "vitest";
import { PricingService } from "./pricing.service";

// PricingService — cálculo puro del quote de checkout (omni-dance.md §10):
// serviceFee = cargo fijo por ticket (SERVICE_FEE.PRESALE_CLP = 500 en shared).
describe("PricingService.quote", () => {
  const pricing = new PricingService();
  const FEE = 500;

  it("sin descuento: total = lista + fee fijo", () => {
    const q = pricing.quote({ listPrice: 10000, serviceFeeClp: FEE });
    expect(q).toEqual({
      listPrice: 10000,
      discount: 0,
      serviceFee: 500,
      total: 10500,
    });
  });

  it("percentOff aplica sobre lista y el fee se mantiene fijo", () => {
    const q = pricing.quote({
      listPrice: 10000,
      serviceFeeClp: FEE,
      discount: { percentOff: 50 },
    });
    expect(q.discount).toBe(5000);
    expect(q.serviceFee).toBe(500);
    expect(q.total).toBe(5500);
  });

  it("amountOff descuenta monto fijo sin afectar el fee", () => {
    const q = pricing.quote({
      listPrice: 10000,
      serviceFeeClp: FEE,
      discount: { amountOff: 3000 },
    });
    expect(q.discount).toBe(3000);
    expect(q.serviceFee).toBe(500);
    expect(q.total).toBe(7500);
  });

  it("amountOff no excede la lista (cap) → entrada gratis, fee 0", () => {
    const q = pricing.quote({
      listPrice: 5000,
      serviceFeeClp: FEE,
      discount: { amountOff: 99999 },
    });
    expect(q.discount).toBe(5000);
    expect(q.serviceFee).toBe(0);
    expect(q.total).toBe(0);
  });

  it("percentOff 100 → cortesía gratis, fee 0", () => {
    const q = pricing.quote({
      listPrice: 8000,
      serviceFeeClp: FEE,
      discount: { percentOff: 100 },
    });
    expect(q.discount).toBe(8000);
    expect(q.serviceFee).toBe(0);
    expect(q.total).toBe(0);
  });

  it("percentOff + amountOff combinados quedan capeados en la lista", () => {
    const q = pricing.quote({
      listPrice: 10000,
      serviceFeeClp: FEE,
      discount: { percentOff: 60, amountOff: 6000 },
    });
    expect(q.discount).toBe(10000); // 6000 + 6000 → cap 10000
    expect(q.total).toBe(0);
  });

  it("el fee es independiente del precio de lista", () => {
    expect(pricing.quote({ listPrice: 9999, serviceFeeClp: FEE }).serviceFee).toBe(500);
    expect(pricing.quote({ listPrice: 1000, serviceFeeClp: FEE }).serviceFee).toBe(500);
  });

  it("serviceFeeClp 0 → sin cargo", () => {
    const q = pricing.quote({ listPrice: 10000, serviceFeeClp: 0 });
    expect(q.serviceFee).toBe(0);
    expect(q.total).toBe(10000);
  });

  it("discount null/undefined equivale a sin descuento", () => {
    expect(
      pricing.quote({ listPrice: 1000, serviceFeeClp: FEE, discount: null })
        .discount,
    ).toBe(0);
    expect(
      pricing.quote({ listPrice: 1000, serviceFeeClp: FEE }).discount,
    ).toBe(0);
  });
});

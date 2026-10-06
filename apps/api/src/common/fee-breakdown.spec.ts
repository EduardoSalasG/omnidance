import { describe, expect, it } from "vitest";
import {
  academyFeeBreakdown,
  managedFeeBreakdown,
  ownMethodBreakdown,
  ownMethodRate,
  resolvePlatformFeeRate,
} from "./fee-breakdown";

// Spec producer-fee-model: comisión "todo incluido" cobrada al actor
// (productor), descontada en liquidación. El comprador paga lista exacta.

describe("resolvePlatformFeeRate", () => {
  it("override del evento gana sobre productor y global", () => {
    expect(resolvePlatformFeeRate({ platformFeePct: 5 }, { platformFeePct: 8 }, 10)).toBe(5);
  });
  it("default del productor gana sobre el global", () => {
    expect(resolvePlatformFeeRate({ platformFeePct: null }, { platformFeePct: 8 }, 10)).toBe(8);
  });
  it("fallback global cuando nadie sobreescribe", () => {
    expect(resolvePlatformFeeRate({ platformFeePct: null }, null, 10)).toBe(10);
  });
});

describe("managedFeeBreakdown", () => {
  // $6.000 a 10% lista / card 3.19% / iva 19%
  it("descompone deduction = pasarela al costo + neto + IVA", () => {
    const b = managedFeeBreakdown(6000, 10, 3.19, 19);
    expect(b.feeMode).toBe("MANAGED");
    expect(b.platformFeeRate).toBe(10);
    expect(b.gatewayFeeExpected).toBe(191); // round(6000*0.0319)
    expect(b.platformFeeNetClp! + b.platformFeeVatClp! + b.gatewayFeeExpected!).toBe(600);
    expect(b.platformFeeNetClp).toBe(344); // round(409/1.19)
    expect(b.platformFeeVatClp).toBe(65); // 409-344
    expect(b.producerNetClp).toBe(5400); // amount - deduction
  });

  it("promo 8% → producerNet 5520 en $6.000", () => {
    const b = managedFeeBreakdown(6000, 8, 3.19, 19);
    expect(b.platformFeeRate).toBe(8);
    expect(b.producerNetClp).toBe(5520);
    expect(b.platformFeeNetClp).toBe(243); // round((480-191)/1.19)=round(242.86)
    expect(b.platformFeeVatClp).toBe(46);
  });

  it("monto $0 → FREE, todo en 0", () => {
    const b = managedFeeBreakdown(0, 10, 3.19, 19);
    expect(b.feeMode).toBe("FREE");
    expect(b.platformFeeNetClp).toBe(0);
    expect(b.platformFeeVatClp).toBe(0);
    expect(b.gatewayFeeExpected).toBe(0);
    expect(b.producerNetClp).toBe(0);
  });

  it("amount chico donde la deducción < pasarela → fee nuestro no negativo", () => {
    // $100 a 10% = $10 deducción; pasarela esperada $3 → ourGross $7 ok.
    // Caso patológico: deducción menor al costo → neto 0 y el passthrough
    // se cubre igual (el productor lo absorbe, no nosotros).
    const b = managedFeeBreakdown(100, 1, 3.19, 19);
    expect(b.platformFeeNetClp).toBeGreaterThanOrEqual(0);
    expect(b.platformFeeVatClp).toBeGreaterThanOrEqual(0);
  });
});

describe("ownMethodRate / ownMethodBreakdown", () => {
  it("deriva all-in menos costo de tarjeta", () => {
    expect(ownMethodRate(10, 3.19)).toBeCloseTo(6.81, 2);
    expect(ownMethodRate(8, 3.19)).toBeCloseTo(4.81, 2);
  });
  it("nunca negativa (tasa promo extrema → 0)", () => {
    expect(ownMethodRate(3, 3.19)).toBe(0);
  });
  it("descompone sin línea de pasarela", () => {
    const b = ownMethodBreakdown(50000, 10, 3.19, 19);
    expect(b.feeMode).toBe("OWN_METHOD");
    expect(b.platformFeeRate).toBeCloseTo(6.81, 2);
    expect(b.gatewayFeeExpected).toBe(0);
    // fee bruto nuestro = round(50000 * 6.81/100) = 3405 → neto 2861 + iva 544
    expect(b.platformFeeNetClp).toBe(2861);
    expect(b.platformFeeVatClp).toBe(544);
    expect(b.producerNetClp).toBe(50000 - 3405);
  });
});

describe("academyFeeBreakdown", () => {
  it("sin comisión - solo pasarela esperada; producerNet = amount (spec)", () => {
    const b = academyFeeBreakdown(15000, 3.19);
    expect(b.feeMode).toBe("ACADEMY");
    expect(b.platformFeeRate).toBeNull();
    expect(b.platformFeeNetClp).toBe(0);
    expect(b.platformFeeVatClp).toBe(0);
    expect(b.gatewayFeeExpected).toBe(479); // round(15000*3.19%)
    expect(b.producerNetClp).toBe(15000);
  });

  it("monto $0 → esperada 0, neto 0", () => {
    const b = academyFeeBreakdown(0, 3.19);
    expect(b.gatewayFeeExpected).toBe(0);
    expect(b.producerNetClp).toBe(0);
  });
});

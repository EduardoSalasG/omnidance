// Descomposición del fee "todo incluido" cobrado al actor (spec
// producer-fee-model, trazabilidad BIAN). Puro, sin Nest/Prisma - los
// resultados se congelan en Payment al crear la orden y el payout solo
// lee filas, nunca recalcula tasas.
//
// Estructura del all-in %: pasarela al costo + nuestro fee bruto, donde
// fee bruto = neto + IVA(tax.iva_pct sobre el neto).

export interface FeeBreakdown {
  feeMode: "MANAGED" | "OWN_METHOD" | "OWN_GATEWAY" | "FREE" | "ACADEMY";
  platformFeeRate: number | null;
  platformFeeNetClp: number | null;
  platformFeeVatClp: number | null;
  gatewayFeeExpected: number | null;
  producerNetClp: number | null;
}

/** Cadena evento → productor → global (misma de fees/corte de preventa). */
export function resolvePlatformFeeRate(
  event: { platformFeePct?: number | null },
  producerParams: { platformFeePct?: number | null } | null,
  globalPct: number,
): number {
  return event.platformFeePct ?? producerParams?.platformFeePct ?? globalPct;
}

function decompose(amount: number, feeRatePct: number, gatewayPct: number, ivaPct: number) {
  const deduction = Math.round((amount * feeRatePct) / 100);
  const gateway = Math.round((amount * gatewayPct) / 100);
  // Nuestro fee bruto = deducción − pasarela (clamp ≥0: en montos
  // patológicos el productor absorbe el costo, nunca genera neto negativo).
  const ourGross = Math.max(0, deduction - gateway);
  const net = Math.round(ourGross / (1 + ivaPct / 100));
  return { deduction, gateway, net, vat: ourGross - net };
}

/** Orden cobrada por nuestra pasarela (tickets, pases de serie, puerta app). */
export function managedFeeBreakdown(
  amount: number,
  allInPct: number,
  cardPct: number,
  ivaPct: number,
): FeeBreakdown {
  if (amount <= 0) {
    return {
      feeMode: "FREE",
      platformFeeRate: null,
      platformFeeNetClp: 0,
      platformFeeVatClp: 0,
      gatewayFeeExpected: 0,
      producerNetClp: 0,
    };
  }
  const { gateway, net, vat } = decompose(amount, allInPct, cardPct, ivaPct);
  return {
    feeMode: "MANAGED",
    platformFeeRate: allInPct,
    platformFeeNetClp: net,
    platformFeeVatClp: vat,
    gatewayFeeExpected: gateway,
    producerNetClp: amount - Math.round((amount * allInPct) / 100),
  };
}

/** Tasa derivada para cobros por métodos/pasarela propios del actor. */
export function ownMethodRate(allInPct: number, cardPct: number): number {
  return Math.max(0, allInPct - cardPct);
}

/**
 * Orden de academia (modelo SaaS): sin comisión de plataforma - la
 * academia ya paga suscripción. El costo de pasarela se liquida como
 * línea GATEWAY_FEE_PASSTHROUGH en su payout (real reportada o
 * estimada); acá se congela el esperado por card_pct para auditoría.
 */
export function academyFeeBreakdown(
  amount: number,
  cardPct: number,
): FeeBreakdown {
  return {
    feeMode: "ACADEMY",
    platformFeeRate: null,
    platformFeeNetClp: 0,
    platformFeeVatClp: 0,
    gatewayFeeExpected:
      amount > 0 ? Math.round((amount * cardPct) / 100) : 0,
    producerNetClp: amount,
  };
}

/** Venta por métodos propios: sin pasarela nuestra → fee = all-in − card%. */
export function ownMethodBreakdown(
  amount: number,
  allInPct: number,
  cardPct: number,
  ivaPct: number,
  mode: "OWN_METHOD" | "OWN_GATEWAY" = "OWN_METHOD",
): FeeBreakdown {
  const rate = ownMethodRate(allInPct, cardPct);
  if (amount <= 0 || rate <= 0) {
    return {
      feeMode: mode,
      platformFeeRate: rate,
      platformFeeNetClp: 0,
      platformFeeVatClp: 0,
      gatewayFeeExpected: 0,
      producerNetClp: amount,
    };
  }
  const { net, vat, deduction } = decompose(amount, rate, 0, ivaPct);
  return {
    feeMode: mode,
    platformFeeRate: rate,
    platformFeeNetClp: net,
    platformFeeVatClp: vat,
    gatewayFeeExpected: 0,
    producerNetClp: amount - deduction,
  };
}

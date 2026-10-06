// Reglas de precio del checkout (omni-dance.md §10, spec producer-fee-model)
// - servicio puro, sin Nest/Prisma.
//
// El comprador paga exactamente el precio publicado: no existe fee al
// comprador. La monetización es la comisión "todo incluido" cobrada al
// actor, descontada en su liquidación (ver src/common/fee-breakdown.ts).
// amountOff queda capeado en la lista; el total nunca es negativo.

export interface QuoteDiscount {
  percentOff?: number | null;
  amountOff?: number | null;
}

export interface QuoteInput {
  listPrice: number;
  discount?: QuoteDiscount | null;
}

export interface Quote {
  listPrice: number;
  discount: number;
  total: number;
}

export class PricingService {
  quote({ listPrice, discount }: QuoteInput): Quote {
    const percentCut = Math.round(
      (listPrice * Math.max(0, discount?.percentOff ?? 0)) / 100,
    );
    const cut = Math.min(
      listPrice,
      percentCut + Math.max(0, discount?.amountOff ?? 0),
    );
    return { listPrice, discount: cut, total: Math.max(0, listPrice - cut) };
  }
}

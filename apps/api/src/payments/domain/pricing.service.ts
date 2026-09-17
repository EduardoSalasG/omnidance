// Reglas de precio del checkout (omni-dance.md §10) — servicio puro, sin Nest/Prisma.
//
// serviceFee = SERVICE_FEE_PCT % sobre la lista POST-descuento.
// amountOff queda capeado en la lista; el total nunca es negativo.

export interface QuoteDiscount {
  percentOff?: number | null;
  amountOff?: number | null;
}

export interface QuoteInput {
  listPrice: number;
  serviceFeePct: number;
  discount?: QuoteDiscount | null;
}

export interface Quote {
  listPrice: number;
  discount: number;
  serviceFee: number;
  total: number;
}

export class PricingService {
  quote({ listPrice, serviceFeePct, discount }: QuoteInput): Quote {
    const percentCut = Math.round(
      (listPrice * Math.max(0, discount?.percentOff ?? 0)) / 100,
    );
    const cut = Math.min(
      listPrice,
      percentCut + Math.max(0, discount?.amountOff ?? 0),
    );
    const net = Math.max(0, listPrice - cut);
    const serviceFee = Math.round((net * Math.max(0, serviceFeePct)) / 100);
    return {
      listPrice,
      discount: cut,
      serviceFee,
      total: net + serviceFee,
    };
  }
}

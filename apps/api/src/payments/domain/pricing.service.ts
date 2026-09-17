// Reglas de precio del checkout (omni-dance.md §10) — servicio puro, sin Nest/Prisma.
//
// serviceFee = cargo fijo por ticket (SERVICE_FEE.PRESALE_CLP en @omnidance/shared).
// El fee no depende del descuento; una entrada que queda en $0 no cobra fee.
// amountOff queda capeado en la lista; el total nunca es negativo.

export interface QuoteDiscount {
  percentOff?: number | null;
  amountOff?: number | null;
}

export interface QuoteInput {
  listPrice: number;
  serviceFeeClt: number;
  discount?: QuoteDiscount | null;
}

export interface Quote {
  listPrice: number;
  discount: number;
  serviceFee: number;
  total: number;
}

export class PricingService {
  quote({ listPrice, serviceFeeClt, discount }: QuoteInput): Quote {
    const percentCut = Math.round(
      (listPrice * Math.max(0, discount?.percentOff ?? 0)) / 100,
    );
    const cut = Math.min(
      listPrice,
      percentCut + Math.max(0, discount?.amountOff ?? 0),
    );
    const net = Math.max(0, listPrice - cut);
    const serviceFee = net > 0 ? Math.max(0, serviceFeeClt) : 0;
    return {
      listPrice,
      discount: cut,
      serviceFee,
      total: net + serviceFee,
    };
  }
}

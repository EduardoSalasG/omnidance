import type {
  DiscountCode,
  DiscountCodeType,
  DiscountRedemption,
} from "@prisma/client";

export const DISCOUNTS_REPO = "DISCOUNTS_REPO";

/** Data ya validada por el dominio, lista para persistir. */
export interface CreateDiscountCodeData {
  code: string;
  type: DiscountCodeType;
  eventId: string | null;
  seriesId: string | null;
  percentOff: number | null;
  amountOff: number | null;
  maxUses: number | null;
  expiresAt: Date | null;
  createdById: string;
}

/**
 * Filtros del listado - incluye el contrato compartido de la barra de
 * filtros (spec analytics/query-console): `q` calza el código (contains,
 * insensible), `status` es derivado de expiresAt (ACTIVE = vigente o sin
 * expiración; EXPIRED = expiresAt <= ahora), `from`/`to` sobre createdAt.
 */
export interface DiscountCodeFilter {
  eventId?: string;
  seriesId?: string;
  q?: string;
  status?: "ACTIVE" | "EXPIRED";
  from?: Date;
  to?: Date;
  /** Corte de página - siempre después de los filtros. */
  skip?: number;
  take?: number;
}

/** Envelope del contrato compartido de listados. */
export interface PagedList<T> {
  items: T[];
  total: number;
}

export type ListedDiscountCode = Pick<
  DiscountCode,
  | "id"
  | "code"
  | "type"
  | "eventId"
  | "seriesId"
  | "percentOff"
  | "amountOff"
  | "usedCount"
  | "maxUses"
  | "expiresAt"
  | "createdAt"
>;

export type ListedRedemption = Pick<
  DiscountRedemption,
  "id" | "personId" | "paymentId" | "redeemedAt"
> & { person: { personId: string; name: string } };

export interface DiscountsRepo {
  findByCode(code: string): Promise<DiscountCode | null>;
  findById(id: string): Promise<DiscountCode | null>;
  create(data: CreateDiscountCodeData): Promise<DiscountCode>;
  /** Ordenado por createdAt desc, con total del universo filtrado. */
  list(filter: DiscountCodeFilter): Promise<PagedList<ListedDiscountCode>>;
  /** Ordenado por redeemedAt desc. */
  listRedemptions(codeId: string): Promise<ListedRedemption[]>;
}

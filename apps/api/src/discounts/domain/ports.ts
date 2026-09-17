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

export interface DiscountCodeFilter {
  eventId?: string;
  seriesId?: string;
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
>;

export interface DiscountsRepo {
  findByCode(code: string): Promise<DiscountCode | null>;
  findById(id: string): Promise<DiscountCode | null>;
  create(data: CreateDiscountCodeData): Promise<DiscountCode>;
  /** Ordenado por createdAt desc. */
  list(filter: DiscountCodeFilter): Promise<ListedDiscountCode[]>;
  /** Ordenado por redeemedAt desc. */
  listRedemptions(codeId: string): Promise<ListedRedemption[]>;
}

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import type {
  CreateDiscountCodeData,
  DiscountCodeFilter,
  DiscountsRepo,
} from "../domain/ports";

const LIST_SELECT = {
  id: true,
  code: true,
  type: true,
  eventId: true,
  seriesId: true,
  percentOff: true,
  amountOff: true,
  usedCount: true,
  maxUses: true,
  expiresAt: true,
  createdAt: true,
} as const;

@Injectable()
export class PrismaDiscountsRepo implements DiscountsRepo {
  constructor(private readonly prisma: PrismaService) {}

  findByCode(code: string) {
    return this.prisma.discountCode.findUnique({ where: { code } });
  }

  findById(id: string) {
    return this.prisma.discountCode.findUnique({ where: { id } });
  }

  create(data: CreateDiscountCodeData) {
    return this.prisma.discountCode.create({ data });
  }

  list(filter: DiscountCodeFilter) {
    return this.prisma.discountCode.findMany({
      where: {
        ...(filter.eventId !== undefined ? { eventId: filter.eventId } : {}),
        ...(filter.seriesId !== undefined ? { seriesId: filter.seriesId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: LIST_SELECT,
    });
  }

  listRedemptions(codeId: string) {
    return this.prisma.discountRedemption.findMany({
      where: { codeId },
      orderBy: { redeemedAt: "desc" },
      select: {
        id: true,
        personId: true,
        paymentId: true,
        redeemedAt: true,
      },
    });
  }
}

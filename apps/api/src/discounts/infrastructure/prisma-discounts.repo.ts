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
    const q = filter.q?.trim();
    const now = new Date();
    return this.prisma.discountCode.findMany({
      where: {
        ...(filter.eventId !== undefined ? { eventId: filter.eventId } : {}),
        ...(filter.seriesId !== undefined ? { seriesId: filter.seriesId } : {}),
        ...(q ? { code: { contains: q, mode: "insensitive" as const } } : {}),
        // EXPIRED: expiresAt <= ahora; ACTIVE: vigente o sin expiración.
        ...(filter.status === "EXPIRED"
          ? { expiresAt: { lte: now } }
          : filter.status === "ACTIVE"
            ? { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
            : {}),
        ...(filter.from || filter.to
          ? {
              createdAt: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lte: filter.to } : {}),
              },
            }
          : {}),
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

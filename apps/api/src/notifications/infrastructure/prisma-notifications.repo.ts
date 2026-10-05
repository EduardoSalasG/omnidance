import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  NOTIFICATION_LENS_TYPES,
  type NotificationLensFilter,
} from "@omnidance/shared";
import { PrismaService } from "../../prisma.service";
import type {
  CreateNotificationData,
  NotificationsRepo,
  ResolvedListOptions,
} from "../domain/ports";

// Filtro por lente: excluye los `type` de la lente opuesta - los "any"
// (sin dominio propio: account.*, crm.*, lead.*) cuentan en ambas.
function lensWhere(
  lens?: NotificationLensFilter,
): Prisma.NotificationWhereInput {
  if (!lens) return {};
  const other =
    NOTIFICATION_LENS_TYPES[lens === "academy" ? "social" : "academy"];
  return {
    NOT: {
      OR: [
        ...other.prefixes.map((p) => ({ type: { startsWith: p } })),
        ...other.exact.map((t) => ({ type: t as string })),
      ],
    },
  };
}

@Injectable()
export class PrismaNotificationsRepo implements NotificationsRepo {
  constructor(private readonly prisma: PrismaService) {}

  createNotification(data: CreateNotificationData) {
    return this.prisma.notification.create({
      data: {
        personId: data.personId,
        category: data.category,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data,
      },
    });
  }

  findNotificationById(id: string) {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  listNotifications(personId: string, opts: ResolvedListOptions) {
    return this.prisma.notification.findMany({
      where: {
        personId,
        ...(opts.unread ? { readAt: null } : {}),
        ...lensWhere(opts.lens),
      },
      orderBy: { createdAt: "desc" },
      take: opts.limit,
    });
  }

  countUnread(personId: string, lens?: NotificationLensFilter) {
    return this.prisma.notification.count({
      where: { personId, readAt: null, ...lensWhere(lens) },
    });
  }

  markRead(id: string, readAt: Date) {
    return this.prisma.notification.update({
      where: { id },
      data: { readAt },
    });
  }

  async markAllRead(personId: string, readAt: Date) {
    const res = await this.prisma.notification.updateMany({
      where: { personId, readAt: null },
      data: { readAt },
    });
    return res.count;
  }

  upsertPushToken(
    personId: string,
    token: string,
    payload: Prisma.InputJsonValue,
  ) {
    return this.prisma.pushToken.upsert({
      where: { token },
      create: { personId, token, payload },
      update: { personId, payload },
    });
  }

  findPushTokenByToken(token: string) {
    return this.prisma.pushToken.findUnique({ where: { token } });
  }

  async deletePushToken(id: string) {
    await this.prisma.pushToken.delete({ where: { id } });
  }
}

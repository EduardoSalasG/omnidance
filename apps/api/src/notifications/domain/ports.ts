import type { Notification, Prisma, PushToken } from "@prisma/client";

export const NOTIFICATIONS_REPO = "NOTIFICATIONS_REPO";

export interface CreateNotificationData {
  personId: string;
  category: string;
  type: string;
  title: string;
  body?: string;
  data?: Prisma.InputJsonValue;
}

export interface ListNotificationsOptions {
  /** true → solo no leídas (readAt null). */
  unread?: boolean;
  /** tope de resultados — el servicio aplica default/clamp. */
  limit?: number;
}

export interface NotificationsRepo {
  createNotification(data: CreateNotificationData): Promise<Notification>;
  findNotificationById(id: string): Promise<Notification | null>;
  listNotifications(
    personId: string,
    opts: Required<ListNotificationsOptions>,
  ): Promise<Notification[]>;
  countUnread(personId: string): Promise<number>;
  markRead(id: string, readAt: Date): Promise<Notification>;
  /** Marca todas las no leídas del usuario; retorna cuántas se actualizaron. */
  markAllRead(personId: string, readAt: Date): Promise<number>;
  /** Upsert por token único; payload guarda { platform } (schema v1 no tiene columna platform). */
  upsertPushToken(
    personId: string,
    token: string,
    payload: Prisma.InputJsonValue,
  ): Promise<PushToken>;
  findPushTokenByToken(token: string): Promise<PushToken | null>;
  deletePushToken(id: string): Promise<void>;
}

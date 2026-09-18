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

// ─── Puertos de fan-out (opcionales) ───
// Los implementa la infraestructura (gateway WS / sender web-push). El dominio
// los invoca best-effort tras persistir la notificación; si no hay provider
// registrado el servicio funciona igual (inyección @Optional).

export const REALTIME_PORT = "REALTIME_PORT";

/** Emisión en tiempo real (WebSocket) hacia la room `person:{personId}`. */
export interface RealtimePort {
  emitToPerson(personId: string, event: string, payload: unknown): void;
}

export const PUSH_PORT = "PUSH_PORT";

export interface PushNotificationPayload {
  type: string;
  title?: string | null;
  body?: string | null;
  data?: unknown;
}

/** Web Push best-effort — el adaptador es no-op sin VAPID keys configuradas. */
export interface PushPort {
  sendToPerson(
    personId: string,
    notification: PushNotificationPayload,
  ): Promise<void>;
}

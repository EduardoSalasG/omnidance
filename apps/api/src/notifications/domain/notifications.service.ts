import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Notification, Prisma, PushToken } from "@prisma/client";
import {
  PUSH_PORT,
  REALTIME_PORT,
  type ListNotificationsOptions,
  type NotificationsRepo,
  type PushPort,
  type RealtimePort,
} from "./ports";

// Centro de notificaciones (omni-dance.md — sistema) — servicio de dominio puro.

export const NOTIFICATION_CATEGORIES = [
  "SOCIAL",
  "TRANSACTIONAL",
  "MARKETING",
  "OPERATIONAL",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const PUSH_PLATFORMS = ["WEB", "IOS", "ANDROID"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

export type NotificationErrorCode =
  | "INVALID_CATEGORY"
  | "INVALID_PLATFORM"
  | "NOT_FOUND"
  | "FORBIDDEN";

export class NotificationDomainError extends Error {
  constructor(
    readonly code: NotificationErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "NotificationDomainError";
  }
}

export interface NotifyInput {
  category: NotificationCategory;
  type: string;
  title: string;
  body?: string;
  data?: Prisma.InputJsonValue;
}

export interface NotificationsPage {
  notifications: Notification[];
  unreadCount: number;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: NotificationsRepo,
    @Optional()
    @Inject(REALTIME_PORT)
    private readonly realtime?: RealtimePort,
    @Optional()
    @Inject(PUSH_PORT)
    private readonly push?: PushPort,
  ) {}

  /**
   * Crea una notificación in-app para `personId`.
   * `type` es libre ("session_invite", "ticket_paid", "prime_unlocked"…);
   * `category` debe ser una de las 4 del schema.
   * Tras persistir dispara fan-out realtime (WS) y web push — ambos
   * best-effort: un fallo del socket o de push nunca rompe notify().
   */
  async notify(personId: string, input: NotifyInput): Promise<Notification> {
    if (!NOTIFICATION_CATEGORIES.includes(input.category)) {
      throw new NotificationDomainError(
        "INVALID_CATEGORY",
        `category inválida: ${input.category}`,
      );
    }
    const notification = await this.repo.createNotification({
      personId,
      category: input.category,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data,
    });
    try {
      this.realtime?.emitToPerson(personId, "notification", notification);
    } catch {
      /* gateway ausente o socket caído — la notificación ya quedó persistida */
    }
    try {
      await this.push?.sendToPerson(personId, notification);
    } catch {
      /* web push opcional — nunca propaga */
    }
    return notification;
  }

  /**
   * Notificación best-effort: un fallo del centro nunca rompe el flujo de
   * dominio del caller (webhook de pago, sesiones, waitlist, friends).
   */
  async notifySafe(personId: string, input: NotifyInput): Promise<void> {
    try {
      await this.notify(personId, input);
    } catch {
      /* notificación no crítica */
    }
  }

  async listForPerson(
    personId: string,
    opts: ListNotificationsOptions,
  ): Promise<NotificationsPage> {
    const limit = this.clampLimit(opts.limit);
    const [notifications, unreadCount] = await Promise.all([
      this.repo.listNotifications(personId, {
        unread: opts.unread ?? false,
        limit,
      }),
      this.repo.countUnread(personId),
    ]);
    return { notifications, unreadCount };
  }

  /**
   * Marca leída una notificación del usuario.
   * Inexistente → NOT_FOUND; de otra persona → FORBIDDEN.
   * Idempotente: ya leída conserva su readAt original.
   */
  async markRead(personId: string, id: string): Promise<Notification> {
    const notification = await this.repo.findNotificationById(id);
    if (!notification) {
      throw new NotificationDomainError(
        "NOT_FOUND",
        "notificación no encontrada",
      );
    }
    if (notification.personId !== personId) {
      throw new NotificationDomainError(
        "FORBIDDEN",
        "la notificación no te pertenece",
      );
    }
    if (notification.readAt) return notification;
    return this.repo.markRead(id, new Date());
  }

  /** Marca todas las no leídas del usuario; retorna cuántas se actualizaron. */
  markAllRead(personId: string): Promise<number> {
    return this.repo.markAllRead(personId, new Date());
  }

  /**
   * Registra/actualiza el push token del dispositivo.
   * Schema v1: no hay columna `platform` — se guarda dentro de `payload`
   * junto a las claves VAPID del navegador ({ p256dh, auth }) cuando vienen.
   */
  async registerPushToken(
    personId: string,
    token: string,
    platform: PushPlatform,
    keys?: { p256dh: string; auth: string },
  ): Promise<PushToken> {
    if (!PUSH_PLATFORMS.includes(platform)) {
      throw new NotificationDomainError(
        "INVALID_PLATFORM",
        `platform inválida: ${platform}`,
      );
    }
    return this.repo.upsertPushToken(personId, token, {
      platform,
      ...(keys ?? {}),
    });
  }

  /**
   * Elimina el push token si pertenece al usuario.
   * Inexistente → NOT_FOUND; de otra persona → FORBIDDEN.
   */
  async removePushToken(personId: string, token: string): Promise<void> {
    const existing = await this.repo.findPushTokenByToken(token);
    if (!existing) {
      throw new NotificationDomainError(
        "NOT_FOUND",
        "push token no encontrado",
      );
    }
    if (existing.personId !== personId) {
      throw new NotificationDomainError(
        "FORBIDDEN",
        "el push token no te pertenece",
      );
    }
    await this.repo.deletePushToken(existing.id);
  }

  private clampLimit(limit: number | undefined): number {
    if (limit == null) return DEFAULT_LIST_LIMIT;
    return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIST_LIMIT);
  }
}

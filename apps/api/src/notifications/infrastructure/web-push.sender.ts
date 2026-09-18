import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PushToken } from "@prisma/client";
import { sendNotification, setVapidDetails } from "web-push";
import type { PushSubscription } from "web-push";
import { PrismaService } from "../../prisma.service";
import type { PushNotificationPayload, PushPort } from "../domain/ports";

// El push service invalida suscripciones con 404/410 → el endpoint está muerto.
const DEAD_ENDPOINT_STATUS = new Set([404, 410]);

/**
 * Web Push best-effort (puerto PUSH_PORT).
 * Sin VAPID keys en env es no-op (dev/local): avisa una vez en onModuleInit y
 * luego calla — nunca lanza por falta de config ni por errores del push service.
 */
@Injectable()
export class WebPushSender implements PushPort, OnModuleInit {
  private readonly logger = new Logger(WebPushSender.name);
  private enabled = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      this.logger.warn(
        "WEB_PUSH_VAPID_PUBLIC_KEY/PRIVATE_KEY ausentes — Web Push deshabilitado (no-op)",
      );
      return;
    }
    setVapidDetails(
      process.env.WEB_PUSH_SUBJECT ?? "mailto:admin@omnidance.cl",
      publicKey,
      privateKey,
    );
    this.enabled = true;
  }

  async sendToPerson(
    personId: string,
    notification: PushNotificationPayload,
  ): Promise<void> {
    if (!this.enabled) return;
    const tokens = await this.prisma.pushToken.findMany({
      where: { personId },
    });
    const payload = JSON.stringify({
      type: notification.type,
      title: notification.title ?? null,
      body: notification.body ?? null,
      data: notification.data ?? null,
    });
    await Promise.all(tokens.map((t) => this.deliver(t, payload)));
  }

  private async deliver(token: PushToken, payload: string): Promise<void> {
    // PushToken.token = endpoint; payload guarda { platform, p256dh, auth }.
    const keys = (token.payload ?? {}) as {
      p256dh?: string;
      auth?: string;
    };
    const subscription: PushSubscription = {
      endpoint: token.token,
      keys: { p256dh: keys.p256dh ?? "", auth: keys.auth ?? "" },
    };
    try {
      await sendNotification(subscription, payload);
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)
        ?.statusCode;
      if (statusCode != null && DEAD_ENDPOINT_STATUS.has(statusCode)) {
        // Endpoint muerto → limpieza del PushToken huérfano.
        await this.prisma.pushToken
          .delete({ where: { id: token.id } })
          .catch(() => undefined);
        return;
      }
      this.logger.warn(
        `web push a pushToken ${token.id} falló (status ${
          statusCode ?? "?"
        }): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

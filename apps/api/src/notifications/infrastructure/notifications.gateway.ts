import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { AuthService } from "../../auth/domain/auth.service";
import { SESSION_COOKIE } from "../../auth/infrastructure/auth.controller";
import type { RealtimePort } from "../domain/ports";

// Misma whitelist que main.ts: auth por cookie no puede reflejar cualquier origen.
const corsOrigins = (
  process.env.CORS_ORIGINS ??
  process.env.WEB_URL ??
  "http://localhost:3000"
)
  .split(",")
  .map((o) => o.trim());

/**
 * Fan-out realtime de notificaciones.
 * Cada socket se autentica con la cookie de sesión (`omnidance_session`,
 * mismo JWT que verifica AuthService) y se une a la room `person:{personId}`.
 * Implementa RealtimePort — el dominio emite con emitToPerson (token
 * REALTIME_PORT). Sin auth válida el socket se desconecta.
 */
@WebSocketGateway({ cors: { origin: corsOrigins, credentials: true } })
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, RealtimePort
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer() server!: Server;

  constructor(private readonly auth: AuthService) {}

  async handleConnection(socket: Socket): Promise<void> {
    const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    if (!token) {
      socket.disconnect(true);
      return;
    }
    try {
      const { personId } = await this.auth.verifySession(token);
      socket.data.personId = personId;
      await socket.join(`person:${personId}`);
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    const personId = socket.data?.personId as string | undefined;
    if (personId) {
      this.logger.debug(`socket desconectado person:${personId}`);
    }
  }

  emitToPerson(personId: string, event: string, payload: unknown): void {
    this.server?.to(`person:${personId}`).emit(event, payload);
  }
}

/** Parseo manual del header Cookie — no hay dependencia `cookie` instalada. */
function readCookie(
  header: string | undefined,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

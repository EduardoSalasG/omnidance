import type { Socket } from "socket.io-client";

/**
 * Singleton lazy del cliente socket.io — fan-out realtime de notificaciones.
 *
 * Backend verificado (apps/api/src/notifications/infrastructure/notifications.gateway.ts):
 * - @WebSocketGateway sin `path`/`namespace` custom → path por defecto
 *   `/socket.io`, namespace `/`.
 * - Auth: el gateway lee la cookie `omnidance_session` del handshake HTTP y
 *   verifica el JWT con AuthService. Por eso `withCredentials: true` — sin
 *   credenciales el polling no adjunta la cookie y el gateway desconecta.
 * - Sin sesión válida el servidor hace `socket.disconnect(true)` → el cliente
 *   recibe disconnect "io server disconnect" y socket.io NO reintenta
 *   (comportamiento deseado: no reintentar auth fallida infinitamente).
 * - CORS del gateway usa la misma whitelist de main.ts con credentials:true.
 *
 * El servidor emite `emitToPerson(personId, "notification", notification)`
 * (notifications.service.ts:92) — payload = Notification de Prisma completo.
 *
 * `connectRealtime()` es no-op en SSR (guarda typeof window) y memoriza el
 * socket: llamadas repetidas devuelven la misma instancia. El import de
 * socket.io-client es dinámico para no inflar el bundle del primer render.
 */

// Mismo origen que lib/api.ts (apiFetch) — duplicado porque api.ts no lo exporta.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Shape del payload del evento `notification` (model Notification de Prisma). */
export type RealtimeNotification = {
  id: string;
  personId: string;
  /** SOCIAL | TRANSACTIONAL | MARKETING | OPERATIONAL */
  category: string;
  /** Libre: "session_invite", "ticket_paid", "prime_unlocked"… */
  type: string;
  title: string;
  body?: string | null;
  data?: unknown;
  readAt: string | null;
  createdAt: string;
};

let socket: Socket | null = null;
let connecting: Promise<Socket | null> | null = null;
/** true tras un "io server disconnect" — el gateway rechazó la sesión. */
let authRejected = false;

/**
 * Conecta (o devuelve) el socket singleton. `null` en SSR o si el gateway ya
 * rechazó la sesión en esta carga de página — en ese caso no se reintenta
 * hasta que la app pida explícitamente `disconnectRealtime()` + reconexión
 * (p. ej. tras un nuevo login).
 */
export function connectRealtime(): Promise<Socket | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (authRejected) return Promise.resolve(null);
  if (socket) return Promise.resolve(socket);
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      const { io } = await import("socket.io-client");
      const s = io(API_URL, {
        withCredentials: true,
        // Reconnect automático de socket.io ante caídas de transporte/red.
        // El "io server disconnect" (auth) no dispara reconnect — ver handler.
      });
      s.on("disconnect", (reason) => {
        if (reason === "io server disconnect") {
          // Gateway cerró el socket: cookie ausente o JWT inválido/expirado.
          authRejected = true;
        }
      });
      socket = s;
      return s;
    } catch {
      // Import del chunk falló (p. ej. deploy nuevo con chunk viejo) — la
      // próxima llamada a connectRealtime() reintenta limpio.
      return null;
    }
  })().finally(() => {
    connecting = null;
  });

  return connecting;
}

/** Cierra el singleton y resetea el flag de auth — usar tras login/logout. */
export function disconnectRealtime(): void {
  authRejected = false;
  socket?.disconnect();
  socket = null;
}

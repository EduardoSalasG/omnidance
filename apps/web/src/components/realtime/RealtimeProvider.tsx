"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  connectRealtime,
  disconnectRealtime,
  type RealtimeNotification,
} from "@/lib/realtime";
import { NotificationToast } from "./NotificationToast";
import { PushOptIn } from "./PushOptIn";

/**
 * Contexto realtime del centro de notificaciones.
 *
 * Uso: envolver el árbol una sola vez en el root layout —
 *
 *   <RealtimeProvider>{children}</RealtimeProvider>
 *
 * El provider es self-contained: conecta el socket al montar, renderiza el
 * toast de notificaciones entrantes y el banner de opt-in de Web Push.
 *
 * Estrategia de sesión (la más simple, por spec): intenta conectar siempre.
 * Sin cookie de sesión el gateway hace `socket.disconnect(true)` →
 * `connectRealtime()` marca el rechazo y no reintenta en esta carga.
 *
 * Evento DOM — `omnidance:notification`:
 * Cada `notification` del socket además se re-emite como CustomEvent en
 * `window` (detail = RealtimeNotification) para que piezas fuera de este
 * sub-árbol React (badge del bottom nav, página /notificaciones, widgets)
 * puedan reaccionar sin importar el contexto:
 *
 *   window.addEventListener("omnidance:notification", (e) => {
 *     const n = (e as CustomEvent<RealtimeNotification>).detail;
 *   });
 *
 * `unreadDelta` cuenta solo las llegadas por socket desde el mount — la
 * página /notificaciones calcula su propio baseline con GET /notifications.
 */
export const NOTIFICATION_EVENT = "omnidance:notification";

export type RealtimeContextValue = {
  /** true mientras el socket está conectado y autenticado. */
  connected: boolean;
  /** Última notificación recibida por el socket (null hasta la primera). */
  latestNotification: RealtimeNotification | null;
  /** Cantidad de notificaciones recibidas por socket desde el mount/reset. */
  unreadDelta: number;
  /** Pone unreadDelta en 0 — llamar al visitar /notificaciones. */
  resetUnreadDelta: () => void;
};

const defaultValue: RealtimeContextValue = {
  connected: false,
  latestNotification: null,
  unreadDelta: 0,
  resetUnreadDelta: () => {},
};

const RealtimeContext = createContext<RealtimeContextValue>(defaultValue);

/** Hook del contexto realtime — seguro fuera del provider (devuelve defaults). */
export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [latestNotification, setLatestNotification] =
    useState<RealtimeNotification | null>(null);
  const [unreadDelta, setUnreadDelta] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | undefined;

    void connectRealtime().then((socket) => {
      if (!socket || cancelled) return;

      const onConnect = () => setConnected(true);
      const onDisconnect = () => setConnected(false);
      const onNotification = (n: RealtimeNotification) => {
        setLatestNotification(n);
        setUnreadDelta((d) => d + 1);
        window.dispatchEvent(
          new CustomEvent<RealtimeNotification>(NOTIFICATION_EVENT, {
            detail: n,
          }),
        );
      };

      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("notification", onNotification);
      if (socket.connected) setConnected(true);

      detach = () => {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("notification", onNotification);
      };
    });

    return () => {
      cancelled = true;
      detach?.();
      disconnectRealtime();
    };
  }, []);

  const resetUnreadDelta = useCallback(() => setUnreadDelta(0), []);

  const value = useMemo<RealtimeContextValue>(
    () => ({ connected, latestNotification, unreadDelta, resetUnreadDelta }),
    [connected, latestNotification, unreadDelta, resetUnreadDelta],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
      <NotificationToast />
      <PushOptIn />
    </RealtimeContext.Provider>
  );
}

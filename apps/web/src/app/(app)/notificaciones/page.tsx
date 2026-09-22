"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useActiveRole } from "@/lib/active-role";
import { useViewMode } from "@/lib/view-mode";
import { notificationLens } from "@/lib/notification-lens";
import { Badge, Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";

type NotificationItem = {
  id: string;
  category: string;
  type: string;
  title: string;
  body?: string | null;
  readAt: string | null;
  createdAt: string;
  /** Contexto estructurado del emisor (eventId, eventStartsAt, …). */
  data?: {
    eventId?: string | null;
    eventName?: string | null;
    eventStartsAt?: string | null;
    seriesId?: string | null;
    sessionId?: string | null;
    [k: string]: unknown;
  } | null;
};

type PageState = "loading" | "ready" | "unauth" | "error";

// El backend puede devolver el array directo o envuelto en { notifications, unreadCount }
function parseNotifications(json: unknown): NotificationItem[] {
  if (Array.isArray(json)) return json as NotificationItem[];
  if (json && typeof json === "object") {
    const inner = (json as { notifications?: unknown }).notifications;
    if (Array.isArray(inner)) return inner as NotificationItem[];
  }
  return [];
}

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
const dateFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
});
// Meta de los cards con evento: "sáb 15 jun · 21:00".
const eventDateFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** Deep link por tipo — el tap marca leída y navega al contexto. */
function hrefFor(n: NotificationItem): string | null {
  const eventId =
    typeof n.data?.eventId === "string" ? n.data.eventId : null;
  switch (n.type) {
    case "payment.paid":
      return "/eventos?view=mios";
    case "ticket.gifted":
    case "ticket.claimed":
    case "waitlist.promoted":
      return eventId ? `/eventos/${eventId}` : "/eventos";
    case "payment.failed":
      return eventId ? `/eventos/${eventId}` : null;
    case "session.invite":
    case "session.confirmed":
    case "session.declined":
      return "/bailes";
    case "friend.request":
      return "/amigos";
    default:
      return null;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((then - Date.now()) / 1000);
  const absSeconds = Math.abs(seconds);
  if (absSeconds < 60) return rtf.format(0, "second"); // "ahora"
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return rtf.format(days, "day");
  return dateFmt.format(new Date(then));
}

export default function NotificacionesPage() {
  const t = useTranslations("notifications");
  const tc = useTranslations("common");
  const router = useRouter();
  const [state, setState] = useState<PageState>("loading");
  const [items, setItems] = useState<NotificationItem[]>([]);
  // Lente: roles de /me + modo consumer — el centro filtra por dominio
  // (social ↔ academia); lo transversal (account.*, crm.*) va en ambas.
  const [meRoles, setMeRoles] = useState<string[] | null>(null);
  const activeRole = useActiveRole(meRoles);
  const viewMode = useViewMode();
  const lens: "social" | "academy" =
    activeRole === "ACADEMY_OWNER" ||
    activeRole === "INSTRUCTOR" ||
    (activeRole === "DANCER" && viewMode === "academy")
      ? "academy"
      : "social";

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/notifications?limit=50");
      if (res.status === 401) {
        setState("unauth");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const list = parseNotifications(await res.json());
      setItems(list);
      setState("ready");
      // Leer al entrar: todo queda leído en el servidor, pero la lista
      // conserva el highlight de no-leída durante esta visita (ves qué
      // llegó nuevo; a la próxima visita ya está todo leído).
      if (list.some((n) => !n.readAt)) {
        apiFetch("/notifications/read-all", { method: "POST" }).catch(
          () => {},
        );
      }
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
    apiFetch("/me")
      .then(async (res) =>
        res.ok ? setMeRoles(((await res.json()) as { roles?: string[] }).roles ?? []) : null,
      )
      .catch(() => {});
  }, [load]);

  async function markRead(n: NotificationItem) {
    if (!n.readAt) {
      const now = new Date().toISOString();
      // Optimista: marcar leída de inmediato
      setItems((prev) =>
        prev.map((it) => (it.id === n.id ? { ...it, readAt: now } : it)),
      );
      try {
        await apiFetch(`/notifications/${n.id}/read`, { method: "POST" });
      } catch {
        // Si falla, el próximo load() restaura el estado real
      }
    }
    const href = hrefFor(n);
    if (href) router.push(href);
  }

  async function markAll() {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((it) => ({ ...it, readAt: it.readAt ?? now })));
    try {
      await apiFetch("/notifications/read-all", { method: "POST" });
    } catch {
      void load();
    }
  }

  // Solo las notificaciones de la lente activa (transversales = "any").
  const visible = items.filter((n) => {
    const l = notificationLens(n.type);
    return l === "any" || l === lens;
  });
  const unreadCount = visible.filter((it) => !it.readAt).length;

  if (state === "unauth") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <Button href="/login">{tc("login")}</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        {unreadCount > 0 && <Badge variant="neon">{unreadCount}</Badge>}
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAll}>
            {t("markAll")}
          </Button>
        )}
      </header>

      {state === "loading" && <PageLoading />}
      {state === "error" && (
        <p role="alert" className="text-white/50">
          {tc("error")}
        </p>
      )}

      {state === "ready" &&
        (visible.length === 0 ? (
          <Card className="py-12 text-center">
            <p role="status" className="text-white/60">
              {t("empty")}
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((n) => {
              const unread = !n.readAt;
              const href = hrefFor(n);
              const eventAt =
                typeof n.data?.eventStartsAt === "string"
                  ? n.data.eventStartsAt
                  : null;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => markRead(n)}
                    className={`flex min-h-11 w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors transition-transform active:scale-[0.99] ${
                      unread
                        ? "border-neon/40 bg-night-900"
                        : "border-night-700 bg-night-900/60"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        unread ? "bg-neon" : "bg-night-700"
                      }`}
                    />
                    {unread && (
                      <span className="sr-only">{t("unread")}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block ${
                          unread ? "font-semibold text-white" : "text-white/70"
                        }`}
                      >
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block text-sm text-white/50">
                          {n.body}
                        </span>
                      )}
                      {eventAt && (
                        <span className="mt-0.5 block text-xs font-medium text-neon/80">
                          {eventDateFmt.format(new Date(eventAt))}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-white/50">
                        {relativeTime(n.createdAt)}
                      </span>
                    </span>
                    {href && (
                      <span
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 self-center text-white/30"
                      >
                        ›
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </main>
  );
}

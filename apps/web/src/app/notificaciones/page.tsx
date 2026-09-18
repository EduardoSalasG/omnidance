"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";

type NotificationItem = {
  id: string;
  category: string;
  type: string;
  title: string;
  body?: string | null;
  readAt: string | null;
  createdAt: string;
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
  const [state, setState] = useState<PageState>("loading");
  const [items, setItems] = useState<NotificationItem[]>([]);

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
      setItems(parseNotifications(await res.json()));
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(n: NotificationItem) {
    if (n.readAt) return;
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

  async function markAll() {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((it) => ({ ...it, readAt: it.readAt ?? now })));
    try {
      await apiFetch("/notifications/read-all", { method: "POST" });
    } catch {
      void load();
    }
  }

  const unreadCount = items.filter((it) => !it.readAt).length;

  if (state === "unauth") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button href="/login">{tc("login")}</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          {unreadCount > 0 && <Badge variant="neon">{unreadCount}</Badge>}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAll}>
            {t("markAll")}
          </Button>
        )}
      </header>

      {state === "loading" && (
        <p role="status" className="text-white/50">
          {tc("loading")}
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="text-white/50">
          {tc("error")}
        </p>
      )}

      {state === "ready" &&
        (items.length === 0 ? (
          <Card className="py-12 text-center">
            <p role="status" className="text-white/60">
              {t("empty")}
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((n) => {
              const unread = !n.readAt;
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
                      <span className="mt-1 block text-xs text-white/50">
                        {relativeTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </main>
  );
}

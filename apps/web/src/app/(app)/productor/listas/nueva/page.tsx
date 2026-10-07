"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card, RefreshIcon, SkeletonCard } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import {
  inputCls,
  readError,
  type EventListItem,
} from "@/components/producer/shared";

/**
 * /productor/listas/nueva - crear lista de invitados (POST
 * /events/:id/guest-lists). El selector de evento se alimenta de
 * /events/mine (todos los estados del productor, no solo publicados).
 * Al crear vuelve al listado tras un aviso breve.
 */
function NewGuestList() {
  const t = useTranslations("producer");
  const tc = useTranslations("common");
  const router = useRouter();

  // ownerId del /me compartido (ProducerGate ya validó la sesión).
  const { me } = useMe();
  const meId = me?.id ?? "";

  // null = GET /events/mine en vuelo → select disabled.
  const [events, setEvents] = useState<EventListItem[] | null>(null);
  const [eventsError, setEventsError] = useState(false);
  const [eventId, setEventId] = useState("");
  const [listName, setListName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const loadEvents = useCallback(async () => {
    setEventsError(false);
    try {
      const res = await apiFetch("/events/mine");
      if (!res.ok) {
        setEventsError(true);
        return;
      }
      const evs = (await res.json()) as EventListItem[];
      setEvents(evs);
      if (evs.length > 0) setEventId((cur) => cur || evs[0].id);
    } catch {
      setEventsError(true);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!listName.trim() || !eventId || !meId || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/events/${eventId}/guest-lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // v1: la lista queda a nombre del productor logueado (ownerId requerido).
        body: JSON.stringify({ ownerId: meId, label: listName.trim() }),
      });
      if (!res.ok) {
        setFormError((await readError(res)) ?? tc("error"));
        return;
      }
      setCreated(true);
      setTimeout(() => router.push("/productor/listas"), 1200);
    } catch {
      setFormError(tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ConsoleHeader
        backHref="/productor/listas"
        backLabel={t("guestLists")}
      />

      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold leading-tight">{t("newList")}</h1>

        {created && (
          <Card className="p-6 text-center">
            <p role="status" className="text-lg font-bold text-neon">
              {t("listCreated")}
            </p>
          </Card>
        )}

        {!created && events === null && !eventsError && (
          <SkeletonCard lines={2} />
        )}

        {!created && eventsError && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-red-400">
              {tc("error")}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void loadEvents()}
            >
              <RefreshIcon /> {tc("retry")}
            </Button>
          </div>
        )}

        {!created && events !== null && events.length === 0 && (
          <Card className="flex flex-col items-center gap-4 py-10 text-center">
            <p role="status" className="text-ink/70">
              {t("emptyEvents")}
            </p>
            <Button href="/productor/eventos/nuevo">
              {t("emptyEventsCta")}
            </Button>
          </Card>
        )}

        {!created && events !== null && events.length > 0 && (
          <Card>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-ink/70">
                  {t("event")}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <select
                  required
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className={inputCls}
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-ink/70">
                  {t("listName")}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  className={inputCls}
                />
              </label>

              {formError && (
                <p role="alert" className="text-sm text-red-400">
                  {formError}
                </p>
              )}

              <Button
                type="submit"
                disabled={!listName.trim() || !eventId || saving}
              >
                {saving ? tc("loading") : tc("create")}
              </Button>
            </form>
          </Card>
        )}
      </section>
    </>
  );
}

export default function NewGuestListPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-3xl lg:px-8">
      <ProducerGate>
        <NewGuestList />
      </ProducerGate>
    </main>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon, SkeletonCard } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { EventForm } from "@/components/producer/event-form";
import {
  EDITABLE_STATUSES,
  readError,
  type EventDetail,
  type EventListItem,
  type EventPayload,
  type Style,
  type Venue,
} from "@/components/producer/shared";

type EventState = "idle" | "loading" | "ok" | "notFound" | "error";

/**
 * /productor/eventos/nuevo - página dedicada del formulario de evento.
 * Crear: POST /events → vuelve al listado. Editar (?edit=<id>): GET
 * /events/:id precarga `initial` y PATCH /events/:id → vuelve al detalle.
 * Respeta EDITABLE_STATUSES: un evento no editable muestra aviso + vuelta.
 */
function EventFormPage() {
  const t = useTranslations("producer");
  const tc = useTranslations("common");
  const router = useRouter();
  const editId = useSearchParams().get("edit");

  const [venues, setVenues] = useState<Venue[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [myEvents, setMyEvents] = useState<EventListItem[]>([]);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [eventState, setEventState] = useState<EventState>(
    editId ? "loading" : "idle",
  );
  const [eventNonce, setEventNonce] = useState(0);
  // Éxito breve antes del redirect (el destino no puede anunciarlo).
  const [done, setDone] = useState<"created" | "updated" | null>(null);

  // Catálogos del formulario: venues, styles y series propias
  // (/events/mine devuelve todos los estados del productor autenticado).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch("/venues"),
      apiFetch("/styles"),
      apiFetch("/events/mine"),
    ])
      .then(async ([vRes, sRes, mRes]) => {
        if (cancelled) return;
        if (vRes.ok) setVenues((await vRes.json()) as Venue[]);
        if (sRes.ok) setStyles((await sRes.json()) as Style[]);
        if (mRes.ok) setMyEvents((await mRes.json()) as EventListItem[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Modo edición: el evento se fetchea aquí (mismo GET que el detalle).
  useEffect(() => {
    if (!editId) {
      setEvent(null);
      setEventState("idle");
      return;
    }
    let cancelled = false;
    setEventState("loading");
    apiFetch(`/events/${editId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setEventState("notFound");
          return;
        }
        if (!res.ok) {
          setEventState("error");
          return;
        }
        setEvent((await res.json()) as EventDetail);
        setEventState("ok");
      })
      .catch(() => {
        if (!cancelled) setEventState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [editId, eventNonce]);

  const seriesOptions = [
    ...new Map(
      myEvents
        .map((e) => e.series)
        .filter(
          (s): s is { id: string; name: string } =>
            Boolean(s?.id && s.name),
        )
        .map((s) => [s.id, s]),
    ).values(),
  ];

  const backHref = editId
    ? `/productor/eventos/${editId}`
    : "/productor/eventos";

  async function submitCreate(payload: EventPayload): Promise<string | null> {
    try {
      const res = await apiFetch("/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return (await readError(res)) ?? tc("error");
      }
      setDone("created");
      setTimeout(() => router.push("/productor/eventos"), 1200);
      return null;
    } catch {
      return tc("error");
    }
  }

  async function submitEdit(payload: EventPayload): Promise<string | null> {
    try {
      const res = await apiFetch(`/events/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return (await readError(res)) ?? tc("error");
      }
      setDone("updated");
      setTimeout(() => router.push(backHref), 1200);
      return null;
    } catch {
      return tc("error");
    }
  }

  const editable =
    eventState === "ok" &&
    event !== null &&
    EDITABLE_STATUSES.includes(event.status);

  return (
    <>
      <ConsoleHeader
        backHref={backHref}
        backLabel={editId ? (event?.name ?? t("myEvents")) : t("myEvents")}
      />

      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold leading-tight">
          {editId ? t("editEvent") : t("createEvent")}
        </h1>

        {done && (
          <Card className="p-6 text-center">
            <p role="status" className="text-lg font-bold text-neon">
              {t(done)}
            </p>
          </Card>
        )}

        {!done && editId && eventState === "loading" && (
          <SkeletonCard lines={3} />
        )}

        {!done && editId && eventState === "notFound" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink/70">{t("eventNotFound")}</p>
            <Button href="/productor/eventos" variant="secondary" size="sm">
              {t("myEvents")}
            </Button>
          </div>
        )}

        {!done && editId && eventState === "error" && (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-sm text-red-400">
              {tc("error")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEventNonce((n) => n + 1)}
            >
              <RefreshIcon /> {tc("retry")}
            </Button>
          </div>
        )}

        {!done && eventState === "ok" && event && !editable && (
          <div className="flex flex-col items-start gap-3">
            <p role="status" className="text-sm text-ink/70">
              {t("notEditable")}
            </p>
            <Button href={backHref} variant="secondary" size="sm">
              {tc("back")}
            </Button>
          </div>
        )}

        {!done && (editId === null || editable) && (
          <Card>
            <EventForm
              key={editId ?? "create"}
              mode={editId ? "edit" : "create"}
              initial={event}
              venues={venues}
              styles={styles}
              seriesOptions={seriesOptions}
              onSubmit={editId ? submitEdit : submitCreate}
              onCancel={() => router.push(backHref)}
            />
          </Card>
        )}
      </section>
    </>
  );
}

export default function NewProducerEventPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-3xl lg:px-8">
      <ProducerGate>
        <Suspense fallback={<SkeletonCard lines={3} />}>
          <EventFormPage />
        </Suspense>
      </ProducerGate>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { useDialogFocus } from "@/lib/useDialogFocus";
import {
  Badge,
  Button,
  Card,
  EventDate,
  RefreshIcon,
  SkeletonCard,
} from "@/components/ui";
import { EventForm } from "@/components/producer/event-form";
import { EventFeesSection } from "@/components/producer/event-fees-section";
import { StaffSection } from "@/components/producer/staff-section";
import { PassesSection } from "@/components/producer/passes-section";
import { PaymentsSection } from "@/components/producer/payments-section";
import { SuggestionsSection } from "@/components/producer/suggestions-section";
import { ReservationsSection } from "@/components/producer/reservations-section";
import { RatingsSection } from "@/components/producer/ratings-section";
import { AnalyticsSection } from "@/components/producer/analytics-section";
import { LiveSection } from "@/components/producer/live-section";
import { ExportSection } from "@/components/producer/export-section";
import {
  CANCELLABLE_STATUSES,
  EDITABLE_STATUSES,
  EVENT_STATUS_VARIANT,
  PRODUCER_ROLES,
  readError,
  type EventDetail,
  type EventListItem,
  type EventPayload,
  type Style,
  type Venue,
} from "@/components/producer/shared";

type Gate = "loading" | "unauth" | "notProducer" | "error" | "notFound" | "ready";
type EventState = "loading" | "ok" | "notFound" | "error";

/**
 * /productor/eventos/[id] — consola operativa del evento: estado, acciones
 * (publicar/editar/cancelar), staff, pases, sugerencias, reservas y ratings.
 */
export default function ProducerEventDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const eventId = params.id;

  const t = useTranslations("producer");
  const te = useTranslations("events");
  const tc = useTranslations("common");

  // /me compartido (MeProvider) — gate derivado del contexto; el evento
  // y los catálogos se piden en paralelo desde el mount, sin waterfall
  // tras el fetch de sesión.
  const {
    me,
    loading: meLoading,
    error: meError,
    refresh: refreshMe,
  } = useMe();
  const meId = me?.id ?? "";
  const isAdmin = me?.roles.includes("ADMIN") ?? false;
  // Producer Pro (S6): effectivePro de /me gatea proactivamente las
  // features Pro (analítica/exports/staff) — el 403 pro.required queda
  // como fallback dentro de cada sección.
  const effectivePro = me?.effectivePro ?? null;
  const [eventState, setEventState] = useState<EventState>("loading");
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [myEvents, setMyEvents] = useState<EventListItem[]>([]);

  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Focus trap + restauración del diálogo de confirmación
  const cancelDialogRef = useDialogFocus<HTMLDivElement>(confirmCancel);

  const loadEvent = useCallback(async () => {
    try {
      const res = await apiFetch(`/events/${eventId}`);
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
    } catch {
      setEventState("error");
    }
  }, [eventId]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  // Catálogos del formulario/series — fetch único en paralelo.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch("/venues"),
      apiFetch("/styles"),
      apiFetch("/events"),
    ])
      .then(async ([vRes, sRes, listRes]) => {
        if (cancelled) return;
        if (vRes.ok) setVenues((await vRes.json()) as Venue[]);
        if (sRes.ok) setStyles((await sRes.json()) as Style[]);
        if (listRes.ok)
          setMyEvents((await listRes.json()) as EventListItem[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const gate: Gate = meLoading
    ? "loading"
    : meError
      ? "error"
      : !me
        ? "unauth"
        : !me.roles.some((r) => PRODUCER_ROLES.has(r))
          ? "notProducer"
          : eventState === "ok"
            ? "ready"
            : eventState === "loading"
              ? "loading"
              : eventState;

  function retryBoot() {
    setEventState("loading");
    void refreshMe();
    void loadEvent();
  }

  // Escape cierra el diálogo de confirmación de cancelación.
  useEffect(() => {
    if (!confirmCancel) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmCancel(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmCancel]);

  async function doPublish() {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await apiFetch(`/events/${eventId}/publish`, {
        method: "POST",
      });
      if (!res.ok) {
        setActionError((await readError(res)) ?? tc("error"));
        return;
      }
      setNotice(t("published"));
      await loadEvent();
    } catch {
      setActionError(tc("error"));
    } finally {
      setActionBusy(false);
    }
  }

  async function doCancel() {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await apiFetch(`/events/${eventId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        setActionError((await readError(res)) ?? tc("error"));
        return;
      }
      setConfirmCancel(false);
      setNotice(t("cancelled"));
      await loadEvent();
    } catch {
      setActionError(tc("error"));
    } finally {
      setActionBusy(false);
    }
  }

  async function submitEdit(payload: EventPayload): Promise<string | null> {
    try {
      const res = await apiFetch(`/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return (await readError(res)) ?? tc("error");
      }
      setEditing(false);
      setNotice(t("updated"));
      await loadEvent();
      setEditKey((k) => k + 1); // remount del form con datos frescos
      return null;
    } catch {
      return tc("error");
    }
  }

  const canManage =
    event != null &&
    (event.producerId === undefined ||
      event.producerId === null ||
      event.producerId === meId);

  // Gate Pro del API: aplica solo cuando el caller ES el productor dueño
  // (requireProSelf — un admin operando evento ajeno no se gatea).
  const proLocked =
    event != null &&
    event.producerId === meId &&
    effectivePro === false;

  const seriesOptions = (() => {
    const fromMine = myEvents
      .filter((e) => e.producerId === meId)
      .map((e) => e.series)
      .filter((s): s is { id: string; name: string } =>
        Boolean(s?.id && s.name),
      );
    const map = new Map(fromMine.map((s) => [s.id, s]));
    const currentId = event?.seriesId ?? event?.series?.id;
    if (currentId && event?.series?.name && !map.has(currentId)) {
      map.set(currentId, { id: currentId, name: event.series.name });
    }
    return [...map.values()];
  })();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      {gate === "loading" && (
        <div className="flex flex-col gap-6" aria-hidden="true">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </div>
      )}

      {gate === "unauth" && (
        <Button href="/login" size="lg" className="self-start">
          {tc("login")}
        </Button>
      )}

      {gate === "notProducer" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{t("notProducer")}</p>
          <Button href="/inicio" variant="secondary">
            {tc("appName")}
          </Button>
        </div>
      )}

      {gate === "notFound" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{tc("error")}</p>
          <Button href="/productor/eventos" variant="secondary">
            {t("myEvents")}
          </Button>
        </div>
      )}

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p role="alert" className="text-white/70">
            {tc("error")}
          </p>
          <Button variant="secondary" onClick={retryBoot}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && event && (
        <>
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="min-w-0 flex-1 text-2xl font-bold">
                {event.name}
              </h1>
              <Badge variant={EVENT_STATUS_VARIANT[event.status] ?? "muted"}>
                {t.has(`status.${event.status}`)
                  ? t(`status.${event.status}`)
                  : event.status}
              </Badge>
            </div>
            <EventDate
              start={event.startsAt}
              end={event.endsAt}
              variant="full"
              className="text-sm text-white/60"
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/50">
              {event.venue?.name && <span>{event.venue.name}</span>}
              <span>
                {te.has(`type.${event.type}`)
                  ? te(`type.${event.type}`)
                  : event.type}
              </span>
              {event.series?.name && <span>{event.series.name}</span>}
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-2">
                {event.status === "DRAFT" && (
                  <Button
                    size="sm"
                    onClick={() => void doPublish()}
                    disabled={actionBusy}
                  >
                    {t("publish")}
                  </Button>
                )}
                {EDITABLE_STATUSES.includes(event.status) && (
                  <Button
                    size="sm"
                    variant={editing ? "ghost" : "secondary"}
                    onClick={() => setEditing((v) => !v)}
                    disabled={actionBusy}
                  >
                    {editing ? tc("cancel") : t("editEvent")}
                  </Button>
                )}
                {CANCELLABLE_STATUSES.includes(event.status) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300"
                    onClick={() => setConfirmCancel(true)}
                    disabled={actionBusy}
                  >
                    {t("cancelEvent")}
                  </Button>
                )}
              </div>
            )}

            <div aria-live="polite">
              {notice && (
                <p role="status" className="text-sm font-medium text-neon">
                  {notice}
                </p>
              )}
              {actionError && (
                <p role="alert" className="text-sm text-red-400">
                  {actionError}
                </p>
              )}
            </div>
          </header>

          {editing && EDITABLE_STATUSES.includes(event.status) && (
            <Card>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("editEvent")}
              </h2>
              <EventForm
                key={`${event.id}-${editKey}`}
                mode="edit"
                initial={event}
                venues={venues}
                styles={styles}
                seriesOptions={seriesOptions}
                onSubmit={submitEdit}
                onCancel={() => setEditing(false)}
              />
            </Card>
          )}

          {canManage && <LiveSection eventId={eventId} status={event.status} />}

          <EventFeesSection
            event={event}
            isAdmin={isAdmin}
            onSaved={() => void loadEvent()}
          />
          <StaffSection eventId={eventId} proLocked={proLocked} />
          <PassesSection eventId={eventId} />
          {/* Ventas del evento — se oculta sola ante 403/404 (no-owner). */}
          <PaymentsSection eventId={eventId} />
          <SuggestionsSection eventId={eventId} />
          <ReservationsSection
            eventId={eventId}
            tablesTotal={event.tablesTotal ?? null}
            tableSeatsTotal={event.tableSeatsTotal ?? null}
          />
          <RatingsSection eventId={eventId} />
          {/* Analítica de asistencia/encuesta — se oculta sola ante
              403/404 (no-owner); pro.required → paywall (feature Pro).
              Splits k-anónimos ≥3 asistentes. */}
          <AnalyticsSection eventId={eventId} proLocked={proLocked} />
          {canManage && (
            <ExportSection
              eventId={eventId}
              seriesId={event.seriesId ?? event.series?.id ?? null}
              seriesName={event.series?.name ?? null}
              proLocked={proLocked}
            />
          )}
        </>
      )}

      {/* Confirmación de cancelación — bottom sheet (mismo patrón que el
          modal de transferencia en /entradas). */}
      {confirmCancel && event && (
        <div
          ref={cancelDialogRef}
          role="presentation"
          className="fixed inset-0 z-50 flex items-end justify-center bg-night-950/80 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setConfirmCancel(false)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-event-title"
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cancel-event-title" className="text-lg font-semibold">
              {t("cancelConfirmTitle")}
            </h2>
            <p className="mt-1 text-sm text-white/60">
              {t("cancelConfirmDesc")}
            </p>
            <p className="mt-3 text-sm font-medium">{event.name}</p>
            <div className="mt-4 flex gap-3">
              <Button
                type="button"
                className="flex-1"
                disabled={actionBusy}
                onClick={() => void doCancel()}
              >
                {actionBusy ? tc("loading") : t("confirmCancel")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmCancel(false)}
              >
                {tc("cancel")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}

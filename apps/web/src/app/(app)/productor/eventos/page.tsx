"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  BackLink,
  Badge,
  Button,
  Card,
  EventDate,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import { EventForm } from "@/components/producer/event-form";
import {
  EVENT_STATUS_VARIANT,
  PRODUCER_ROLES,
  readError,
  type EventListItem,
  type EventPayload,
  type Style,
  type Venue,
} from "@/components/producer/shared";

type Gate = "loading" | "unauth" | "notProducer" | "error" | "ready";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * /productor/eventos — lista de mis eventos + formulario de creación.
 * GET /events/mine devuelve todos los estados del productor autenticado.
 */
function ProducerEvents() {
  const t = useTranslations("producer");
  const te = useTranslations("events");
  const tc = useTranslations("common");

  // /me compartido (MeProvider) — el gate se deriva del contexto y los
  // datos se piden en paralelo desde el mount (un no-productor recibe
  // 403 de /events/mine → el gate por rol decide, se descarta).
  const {
    me,
    loading: meLoading,
    error: meError,
    refresh: refreshMe,
  } = useMe();
  const gate: Gate = meLoading
    ? "loading"
    : meError
      ? "error"
      : !me
        ? "unauth"
        : !me.roles.some((r) => PRODUCER_ROLES.has(r))
          ? "notProducer"
          : "ready";
  const [events, setEvents] = useState<EventListItem[] | null>(null);
  const [eventsError, setEventsError] = useState(false);
  const [eventsNonce, setEventsNonce] = useState(0);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Deep-link del tab central "Crear" del productor (/productor/eventos?crear=1).
  const crearParam = useSearchParams().get("crear");
  useEffect(() => {
    if (crearParam) setShowForm(true);
  }, [crearParam]);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/events/mine")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setEventsError(true);
          return;
        }
        setEventsError(false);
        setEvents((await res.json()) as EventListItem[]);
      })
      .catch(() => {
        if (!cancelled) setEventsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [eventsNonce]);

  // Catálogos del formulario — fetch único, no reintentan con el listado.
  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch("/venues"), apiFetch("/styles")])
      .then(async ([vRes, sRes]) => {
        if (cancelled) return;
        if (vRes.ok) setVenues((await vRes.json()) as Venue[]);
        if (sRes.ok) setStyles((await sRes.json()) as Style[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
      const created = (await res.json()) as EventListItem;
      setEvents((evs) => [created, ...(evs ?? [])]);
      setShowForm(false);
      setNotice(t("created"));
      return null;
    } catch {
      return tc("error");
    }
  }

  const mine = [...(events ?? [])].sort(
    (a, b) =>
      new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
  );

  const seriesOptions = [
    ...new Map(
      mine
        .map((e) => e.series)
        .filter(
          (s): s is { id: string; name: string } =>
            Boolean(s?.id && s.name),
        )
        .map((s) => [s.id, s]),
    ).values(),
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <BackLink href="/productor">{t("title")}</BackLink>

      <div className="flex items-center justify-end gap-3">
        {gate === "ready" && (
          <Button
            size="sm"
            variant={showForm ? "ghost" : "secondary"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? tc("cancel") : `＋ ${t("createEvent")}`}
          </Button>
        )}
      </div>

      <div aria-live="polite">
        {notice && (
          <p role="status" className="text-sm font-medium text-neon">
            {notice}
          </p>
        )}
      </div>

      {gate === "loading" && <SkeletonList items={3} />}

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

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{tc("error")}</p>
          <Button variant="secondary" onClick={() => void refreshMe()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && (
        <>
          {showForm && (
            <Card>
              <EventForm
                mode="create"
                venues={venues}
                styles={styles}
                seriesOptions={seriesOptions}
                onSubmit={submitCreate}
                onCancel={() => setShowForm(false)}
              />
            </Card>
          )}

          {eventsError && (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-sm text-red-400">
                {tc("error")}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEvents(null);
                  setEventsError(false);
                  setEventsNonce((n) => n + 1);
                }}
              >
                <RefreshIcon /> {tc("retry")}
              </Button>
            </div>
          )}

          {!eventsError && events === null && <SkeletonList items={3} />}

          {!eventsError && events !== null && mine.length === 0 && (
            <Card className="flex flex-col items-center gap-4 py-10 text-center">
              <p role="status" className="text-white/70">
                {t("emptyEvents")}
              </p>
              <Button onClick={() => setShowForm(true)}>
                {t("emptyEventsCta")}
              </Button>
            </Card>
          )}

          {mine.length > 0 && (
            <ul className="flex flex-col gap-3">
              {mine.map((ev) => (
                <li key={ev.id}>
                  <Link href={`/productor/eventos/${ev.id}`} className="block">
                    <Card className="flex flex-col gap-2 transition-colors hover:border-neon/60">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="min-w-0 flex-1 text-lg font-semibold">
                          {ev.name}
                        </h2>
                        <Badge
                          variant={EVENT_STATUS_VARIANT[ev.status] ?? "muted"}
                        >
                          {t.has(`status.${ev.status}`)
                            ? t(`status.${ev.status}`)
                            : ev.status}
                        </Badge>
                      </div>
                      <EventDate
                        start={ev.startsAt}
                        end={ev.endsAt}
                        className="text-sm text-white/60"
                      />
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/50">
                        {ev.venue?.name && <span>{ev.venue.name}</span>}
                        {ev.type && (
                          <span>
                            {te.has(`type.${ev.type}`)
                              ? te(`type.${ev.type}`)
                              : ev.type}
                          </span>
                        )}
                        {ev.series?.name && <span>{ev.series.name}</span>}
                      </div>
                      {ev.stats && (
                        <p className="text-xs tabular-nums text-white/60">
                          {t("stats.sold", { count: ev.stats.sold })}
                          {" · "}
                          {clp.format(ev.stats.grossClp)}
                          {" · "}
                          {t("stats.checkins", { count: ev.stats.checkins })}
                        </p>
                      )}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

export default function ProducerEventsPage() {
  return (
    <Suspense
      fallback={<main className="min-h-dvh bg-night-950" aria-hidden="true" />}
    >
      <ProducerEvents />
    </Suspense>
  );
}

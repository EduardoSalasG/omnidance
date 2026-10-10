"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  Badge,
  Button,
  Card,
  EventDate,
  Pager,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  EVENT_STATUS_VARIANT,
  PRODUCER_ROLES,
  filtersParams,
  type EventListItem,
} from "@/components/producer/shared";
import { FilterBar } from "@/components/query/FilterBar";
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  type EntityDef,
  type QueryFilters,
} from "@omnidance/shared";

type Gate = "loading" | "unauth" | "notProducer" | "error" | "ready";

/**
 * Filtros de /productor/eventos - contrato compartido (spec
 * analytics/query-console): mismos params/semántica que declara el
 * catálogo para events, sin el scope (siempre eventos propios).
 * GET /events/mine los acepta: q (nombre), status/type, from/to sobre
 * startsAt.
 */
const EVENTS_ENTITY: EntityDef = {
  entity: "events",
  filters: [
    { key: "q", type: "text" },
    { key: "status", type: "enum", options: EVENT_STATUSES },
    { key: "type", type: "enum", options: EVENT_TYPES },
    { key: "from", type: "date" },
    { key: "to", type: "date" },
  ],
  columns: [],
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * /productor/eventos - lista de mis eventos. La creación/edición vive en
 * /productor/eventos/nuevo (patrón CTA → página dedicada).
 * GET /events/mine devuelve todos los estados del productor autenticado.
 */
function ProducerEvents() {
  const t = useTranslations("producer");
  const tn = useTranslations("nav");
  const te = useTranslations("events");
  const tc = useTranslations("common");
  const tq = useTranslations("query");
  const router = useRouter();

  // /me compartido (MeProvider) - el gate se deriva del contexto y los
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
  const [eventsTotal, setEventsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [eventsError, setEventsError] = useState(false);
  const [eventsNonce, setEventsNonce] = useState(0);
  const [filters, setFilters] = useState<QueryFilters>({});

  // Deep-link viejo del tab central "Crear" (/productor/eventos?crear=1)
  // → redirige a la página dedicada (el tab ya apunta directo).
  const crearParam = useSearchParams().get("crear");
  useEffect(() => {
    if (crearParam) router.replace("/productor/eventos/nuevo");
  }, [crearParam, router]);

  useEffect(() => {
    let cancelled = false;
    const qs = filtersParams(filters);
    apiFetch(
      `/events/mine${qs}${qs ? "&" : "?"}page=${page}&pageSize=25`,
    )
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setEventsError(true);
          return;
        }
        const data = (await res.json()) as {
          items: EventListItem[];
          total: number;
        };
        setEventsError(false);
        setEvents(data.items);
        setEventsTotal(data.total);
      })
      .catch(() => {
        if (!cancelled) setEventsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [eventsNonce, filters, page]);

  // El servidor ya ordena startsAt desc - solo unwrap.
  const mine = events ?? [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader
        backHref="/inicio"
        backLabel={tn("home")}
        actions={
          gate === "ready" ? (
            // primary = morado de la lente social - es la acción
            // principal del módulo (spec producer-console).
            <Button size="sm" href="/productor/eventos/nuevo">
              {`＋ ${t("createEvent")}`}
            </Button>
          ) : null
        }
      />

      {gate === "loading" && <SkeletonList items={3} />}

      {gate === "unauth" && (
        <Button href="/login" size="lg" className="self-start">
          {tc("login")}
        </Button>
      )}

      {gate === "notProducer" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-ink/70">{t("notProducer")}</p>
          <Button href="/inicio" variant="secondary">
            {tc("appName")}
          </Button>
        </div>
      )}

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-ink/70">{tc("error")}</p>
          <Button variant="secondary" onClick={() => void refreshMe()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && (
        <>
          <FilterBar
            entity={EVENTS_ENTITY}
            filters={filters}
            onChange={(f) => {
              setFilters(f);
              setPage(1);
            }}
            options={{}}
          />
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

          {!eventsError &&
            events !== null &&
            mine.length === 0 &&
            (Object.keys(filters).length > 0 ? (
              <Card className="py-10 text-center">
                <p role="status" className="text-ink/70">
                  {tq("empty")}
                </p>
              </Card>
            ) : (
              <Card className="flex flex-col items-center gap-4 py-10 text-center">
                <p role="status" className="text-ink/70">
                  {t("emptyEvents")}
                </p>
                <Button href="/productor/eventos/nuevo">
                  {t("emptyEventsCta")}
                </Button>
              </Card>
            ))}

          {mine.length > 0 && (
            <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
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
                        className="text-sm text-ink/60"
                      />
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/50">
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
                        <p className="text-xs tabular-nums text-ink/60">
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
          {mine.length > 0 && (
            <Pager
              page={page}
              pageSize={25}
              total={eventsTotal}
              onPage={setPage}
            />
          )}
        </>
      )}
    </main>
  );
}

export default function ProducerEventsPage() {
  return (
    <Suspense
      fallback={<main className="min-h-dvh bg-canvas" aria-hidden="true" />}
    >
      <ProducerEvents />
    </Suspense>
  );
}

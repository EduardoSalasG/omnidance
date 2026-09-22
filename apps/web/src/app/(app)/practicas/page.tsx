"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { AvailabilitySection } from "@/components/social/AvailabilitySection";
import { PartnerRequests } from "@/components/social/PartnerRequests";
import type { Me } from "@/components/social/types";

// GET /practices (+ /practices/mine, que agrega `going`) — shape público.
type Practice = {
  id: string;
  name: string;
  type: string;
  status: string;
  hostId: string | null;
  host: { id: string; name: string | null } | null;
  capacity: number | null;
  startsAt: string;
  endsAt: string;
  venue: { name: string; address: string | null } | null;
  venueText: string | null;
  womenOnly: boolean;
  rsvpCount: number;
  style: { id: string; name: string } | null;
  /** Solo en /practices/mine: mi RSVP existe. */
  going?: boolean;
};

type ListState = "loading" | "ready" | "error";

const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA"); // YYYY-MM-DD local, clave de grupo

function groupByDay(practices: Practice[]) {
  const groups = new Map<string, Practice[]>();
  for (const p of practices) {
    const key = dayKey(p.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({ key, label: items[0].startsAt, items }));
}

/**
 * Prácticas (spec §8): descubrimiento + coordinación. Misma gramática que
 * /eventos: vista Todas/Mías por query param, chips de estilo, cards
 * compactas agrupadas por día (Hoy/Mañana). Crear vive en /practicas/nueva.
 */
export default function PracticasPage() {
  const t = useTranslations("practices");
  const te = useTranslations("events");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();

  // Vista y filtro compartibles — mismo contrato que /eventos.
  const view = searchParams.get("view") === "mias" ? "mias" : "todas";
  const styleFilter = searchParams.get("style");

  const [state, setState] = useState<ListState>("loading");
  const [practices, setPractices] = useState<Practice[]>([]);
  // "Mis prácticas" carga bajo demanda (endpoint con sesión).
  const [mine, setMine] = useState<Practice[] | null>(null);
  // undefined = cargando; null = sin sesión.
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/practices");
      if (!res.ok) {
        setState("error");
        return;
      }
      setPractices((await res.json()) as Practice[]);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
    apiFetch("/me")
      .then(async (res) => setMe(res.ok ? ((await res.json()) as Me) : null))
      .catch(() => setMe(null));
  }, [load]);

  // Mis prácticas: solo cuando se pide la vista y hay sesión resuelta.
  useEffect(() => {
    if (view !== "mias" || !me || mine !== null) return;
    apiFetch("/practices/mine")
      .then(async (res) => {
        if (res.ok) setMine((await res.json()) as Practice[]);
        else setMine([]);
      })
      .catch(() => setMine([]));
  }, [view, me, mine]);

  const pool = view === "mias" ? (mine ?? []) : practices;
  const visible = styleFilter
    ? pool.filter((p) => p.style?.id === styleFilter)
    : pool;
  // Chips de estilo: solo los que realmente aparecen en el pool visible.
  const styleOptions = useMemo(
    () =>
      [
        ...new Map(
          pool
            .map((p) => p.style)
            .filter((s): s is { id: string; name: string } => s != null)
            .map((s) => [s.id, s.name]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1], "es")),
    [pool],
  );

  // Chips SSR-style: cada link preserva el resto de params.
  const hrefFor = (o: { view?: string; style?: string }) => {
    const merged = {
      view: view !== "todas" ? view : undefined,
      style: styleFilter ?? undefined,
      ...o,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return `/practicas${qs ? `?${qs}` : ""}`;
  };

  const chipClass = (active: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors active:scale-[0.97] ${
      active
        ? "border-neon bg-neon/15 text-neon"
        : "border-white/15 text-white/60 hover:border-white/30 hover:text-white"
    }`;

  const dayLabel = (iso: string) => {
    const today = dayKey(new Date().toISOString());
    const tomorrow = dayKey(new Date(Date.now() + 86400000).toISOString());
    const key = dayKey(iso);
    if (key === today) return te("today");
    if (key === tomorrow) return te("tomorrow");
    return dayFmt.format(new Date(iso));
  };

  // Card compacta — mismo ritmo 3 columnas que /eventos:
  // [hora + lugar] [nombre + badges] [N van].
  const renderCard = (p: Practice) => {
    const hosting = me != null && p.hostId === me.id;
    const going = p.going === true;
    return (
      <Link href={`/eventos/${p.id}`} className="block rounded-2xl">
        <Card className="transition-colors transition-transform hover:border-neon/50 active:scale-[0.99]">
          <div className="flex items-start gap-2">
            {/* Col 1: hora + lugar */}
            <div className="flex w-1/4 shrink-0 flex-col items-start gap-1">
              <span className="pt-0.5 text-sm font-semibold tabular-nums text-white/80">
                <EventDate start={p.startsAt} variant="time" />
              </span>
              {(p.venue || p.venueText) && (
                <span className="inline-flex max-w-full items-center gap-1 text-xs text-white/60">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-3 w-3 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="truncate">
                    {p.venue?.name ?? p.venueText}
                  </span>
                </span>
              )}
            </div>
            {/* Col 2: nombre + badges */}
            <div className="w-1/2 min-w-0">
              <h3 className="truncate text-base font-semibold leading-snug">
                {p.name}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                {p.status === "LIVE" && (
                  <Badge variant="live">{te("live")}</Badge>
                )}
                {p.style && <Badge variant="neon">{p.style.name}</Badge>}
                {hosting && <Badge variant="neon">{t("yours")}</Badge>}
                {going && !hosting && (
                  <Badge variant="neon">{t("going")}</Badge>
                )}
                {p.womenOnly && (
                  <Badge variant="muted">{t("womenOnly")}</Badge>
                )}
                {p.capacity != null && (
                  <Badge variant="outline">
                    {t("capacity", { count: p.capacity })}
                  </Badge>
                )}
              </div>
              {!hosting && p.host?.name && (
                <p className="mt-1 truncate text-xs text-white/50">
                  {t("hostedBy", { name: p.host.name })}
                </p>
              )}
            </div>
            {/* Col 3: prueba social — cuántos van */}
            <div className="w-1/4 shrink-0 pt-0.5 text-right">
              <span className="text-sm text-white/60">
                {t("goingCount", { count: p.rsvpCount })}
              </span>
            </div>
          </div>
        </Card>
      </Link>
    );
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("upcoming")}
          </h2>
          <Button href="/practicas/nueva" size="sm">
            {t("create")}
          </Button>
        </div>

        {/* Vista: Todas / Mis prácticas — mismo patrón de chips que /eventos */}
        <nav
          aria-label={t("viewLabel")}
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
        >
          <Link
            href={hrefFor({ view: undefined })}
            aria-current={view === "todas" ? "true" : undefined}
            className={chipClass(view === "todas")}
          >
            {t("all")}
          </Link>
          <Link
            href={hrefFor({ view: "mias" })}
            aria-current={view === "mias" ? "true" : undefined}
            className={chipClass(view === "mias")}
          >
            {t("mine")}
          </Link>
          {/* Estilos — chips en la misma fila; solo los presentes en el pool */}
          {styleOptions.map(([id, name]) => (
            <Link
              key={id}
              href={hrefFor({ style: styleFilter === id ? undefined : id })}
              aria-pressed={styleFilter === id}
              className={chipClass(styleFilter === id)}
            >
              {name}
            </Link>
          ))}
        </nav>

        {view === "mias" && me === null ? (
          /* Sin sesión no hay "mías" — el login desbloquea la vista */
          <Card className="flex flex-col items-start gap-3">
            <p className="text-sm text-white/60">{t("loginRequired")}</p>
            <Button href="/login" size="sm">
              {tc("login")}
            </Button>
          </Card>
        ) : view === "mias" && mine === null ? (
          <PageLoading />
        ) : view === "todas" && state === "loading" ? (
          <PageLoading />
        ) : view === "todas" && state === "error" ? (
          <p role="alert" className="text-white/60">
            {tc("error")}
          </p>
        ) : visible.length === 0 ? (
          <Card className="flex flex-col items-start gap-3">
            <p role="status" className="text-white/60">
              {view === "mias" ? t("mineEmpty") : t("empty")}
            </p>
            {/* Sin dead-end: organizar es la conducta que la spec gamifica */}
            <Button
              href={view === "mias" ? "/practicas" : "/practicas/nueva"}
              size="sm"
            >
              {view === "mias" ? t("all") : t("create")}
            </Button>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {groupByDay(visible).map((g) => (
              <section key={g.key}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
                  {dayLabel(g.label)}
                </h3>
                <ul className="flex flex-col gap-3">
                  {g.items.map((p) => (
                    <li key={p.id}>{renderCard(p)}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      {/* Encontrar con quién — disponibilidad y búsqueda de pareja */}
      <section className="flex flex-col gap-5 border-t border-night-800 pt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("findPartner")}
        </h2>
        <AvailabilitySection me={me} />
        <PartnerRequests me={me} />
      </section>
    </main>
  );
}

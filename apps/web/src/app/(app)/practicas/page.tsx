"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EventDate,
  RefreshIcon,
  Segmented,
  SkeletonList,
} from "@/components/ui";
import { OnboardingRunner, type TourStep } from "@/components/onboarding/OnboardingRunner";
import { useMe } from "@/lib/me-context";

// GET /practices (+ /practices/mine, que agrega `going`) - shape público.
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
  venueText: string | null;
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
// useSearchParams exige Suspense en el componente client-side.
export default function PracticasPage() {
  return (
    <Suspense>
      <PracticasInner />
    </Suspense>
  );
}

function PracticasInner() {
  const t = useTranslations("practices");
  const te = useTranslations("events");
  const tc = useTranslations("common");
  const tt = useTranslations("tours.practicas");
  const searchParams = useSearchParams();

  // Vista y filtro compartibles - mismo contrato que /eventos.
  const view = searchParams.get("view") === "mias" ? "mias" : "todas";
  const styleFilter = searchParams.get("style");

  const [state, setState] = useState<ListState>("loading");
  const [practices, setPractices] = useState<Practice[]>([]);
  // "Mis prácticas" carga bajo demanda (endpoint con sesión).
  const [mine, setMine] = useState<Practice[] | null>(null);
  // Fallo de /practices/mine: antes se tragaba como setMine([]) y la
  // vista "mías" mentía un empty. mineNonce re-dispara el efecto.
  const [mineError, setMineError] = useState(false);
  const [mineNonce, setMineNonce] = useState(0);
  // /me compartido (MeProvider) - sin fetch propio: `me === null` es
  // "sin sesión" solo cuando el fetch ya resolvió (meChecked) - mientras
  // está en vuelo me vale null igual, gatear con loading evita flashear
  // el CTA de login a usuarios autenticados.
  const { me, loading: meLoading } = useMe();
  const meChecked = !meLoading;

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
  }, [load]);

  // Mis prácticas: solo cuando se pide la vista y hay sesión resuelta.
  useEffect(() => {
    if (view !== "mias" || !me || mine !== null) return;
    let stale = false;
    apiFetch("/practices/mine")
      .then(async (res) => {
        if (stale) return;
        if (res.ok) {
          setMine((await res.json()) as Practice[]);
          setMineError(false);
        } else {
          setMineError(true);
        }
      })
      .catch(() => {
        if (!stale) setMineError(true);
      });
    return () => {
      stale = true;
    };
  }, [view, me, mine, mineNonce]);

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

  // Card compacta - mismo ritmo 3 columnas que /eventos:
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
              {p.venueText && (
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
                  <span className="truncate">{p.venueText}</span>
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
            {/* Col 3: prueba social - cuántos van */}
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
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-4 pt-3 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("upcoming")}
          </h2>
          <Button href="/practicas/nueva" size="sm" data-tour="practicas-create">
            {t("create")}
          </Button>
        </div>

        {/* Vista: Todas / Mis prácticas - segmented con thumb
            deslizante, mismo control que /clases y /academias */}
        <nav
          aria-label={t("viewLabel")}
          data-tour="practicas-views"
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
        >
          <Segmented
            ariaLabel={t("viewLabel")}
            active={view}
            className="shrink-0"
            items={[
              {
                key: "todas",
                href: hrefFor({ view: undefined }),
                children: t("all"),
              },
              {
                key: "mias",
                href: hrefFor({ view: "mias" }),
                children: t("mine"),
              },
            ]}
          />
          {/* Estilos - chips en la misma fila; solo los presentes en el pool */}
          {styleOptions.map(([id, name]) => (
            <Link
              key={id}
              href={hrefFor({ style: styleFilter === id ? undefined : id })}
              aria-current={styleFilter === id ? "true" : undefined}
              className={chipClass(styleFilter === id)}
            >
              {name}
            </Link>
          ))}
        </nav>

        {view === "mias" && meChecked && me === null ? (
          /* Sin sesión no hay "mías" - el login desbloquea la vista */
          <Card className="flex flex-col items-start gap-3">
            <p className="text-sm text-white/60">{t("loginRequired")}</p>
            <Button href="/login" size="sm">
              {tc("login")}
            </Button>
          </Card>
        ) : view === "mias" && mine === null && mineError ? (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-white/60">
              {tc("error")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setMineError(false);
                setMineNonce((n) => n + 1);
              }}
            >
              <RefreshIcon /> {tc("retry")}
            </Button>
          </div>
        ) : view === "mias" && mine === null ? (
          <SkeletonList />
        ) : view === "todas" && state === "loading" ? (
          <SkeletonList />
        ) : view === "todas" && state === "error" ? (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-white/60">
              {tc("error")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setState("loading");
                void load();
              }}
            >
              <RefreshIcon /> {tc("retry")}
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <Card className="flex flex-col items-start gap-3">
            <p role="status" className="text-white/60">
              {/* Con filtro de estilo activo "no hay prácticas" es
                  falso - existen, solo no de ese estilo. */}
              {styleFilter
                ? t("emptyFiltered")
                : view === "mias"
                  ? t("mineEmpty")
                  : t("empty")}
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
          <div data-tour="practicas-list" className="flex flex-col gap-6">
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

      {/* Tour de primera visita - el header (crear + vistas) siempre
          existe; la lista se omite del tour si está vacía. */}
      {state === "ready" && (
        <OnboardingRunner
          tour="practicas"
          steps={
            [
              {
                element: "[data-tour='practicas-views']",
                title: tt("s1.title"),
                description: tt("s1.desc"),
              },
              {
                element: "[data-tour='practicas-create']",
                title: tt("s2.title"),
                description: tt("s2.desc"),
              },
              {
                element: "[data-tour='practicas-list']",
                title: tt("s3.title"),
                description: tt("s3.desc"),
              },
            ] satisfies TourStep[]
          }
        />
      )}
    </main>
  );
}

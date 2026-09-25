"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, Segmented, SkeletonList } from "@/components/ui";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";
import { readError } from "@/components/academy/shared";
import {
  ClassCard,
  type ClassCardData,
  type HistoryCardData,
} from "@/components/classes/class-card";
import {
  DAY_MS,
  DOT_COLOR,
  WEEK_MS,
  WEEKDAY_HEADERS,
  localDayKey,
  monthCells,
  monthDate,
  monthFmt,
  monthGridRange,
  monthKey,
  monthStart,
  parseDay,
  parseMonth,
} from "@/lib/calendar";
import type { GenreKey } from "@/lib/calendar";

// GET /classes/browse — clase materializada futura con contexto de
// serie. El shape vive en el componente del card (lo reusa el home).
type BrowseClass = ClassCardData;

// GET /classes/mine — reserva activa del learner, mismo shape del card.
// Los filtros de reservadas resuelven client-side (/mine no acepta params).
type MyBooking = ClassCardData;

// GET /classes/mine?scope=past — historial del alumno (spec §9):
// asistencia prevalece sobre la reserva de la misma clase.
type HistoryItem = HistoryCardData;

type FilterOption = { id: string; name: string };
type LoadState = "loading" | "error" | "ready";
// Dos ejes independientes (misma IA que /academias):
// - `s` scope — qué datos: mias | explorar | historial (pills con texto)
// - `v` display — cómo se ven: lista | calendario (íconos segmentados,
//   calendario disponible en mias y explorar; historial es solo lista)
// `calScope` es el sub-filtro dentro de Mis clases: todas las clases de
// mis academias vs solo mis reservas. Legado: `view` mezclaba ambos
// ejes (list|calendar|history|explore|mine) — ver parsing más abajo.
type Scope = "mias" | "explorar" | "historial";
type Display = "list" | "calendar";
type CalScope = "todas" | "reservadas";

// Class.date llega como ISO a medianoche UTC — el día calendario es el
// prefijo ISO; "hoy/mañana" se compara contra el día LOCAL en en-CA.
const classDayKey = (iso: string) => iso.slice(0, 10);

const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
// Nombre completo del día para lectores de pantalla (la letra visual
// L/M/M/J… queda aria-hidden en la celda del calendario).
const weekdayNameFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
});

const genreDot = (g: string | null | undefined) =>
  DOT_COLOR[(g ?? "") as GenreKey] ?? "bg-white/50";

// useSearchParams exige Suspense en el componente client-side.
export default function ClasesPage() {
  return (
    <Suspense>
      <ClasesInner />
    </Suspense>
  );
}

function ClasesInner() {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const te = useTranslations("events");
  const ta = useTranslations("academyExtras.lessons");
  const tt = useTranslations("tours.clases");
  const router = useRouter();
  const searchParams = useSearchParams();

  // ─── Estado en URL (mismo patrón que /eventos: deep-linkable) ───
  const rawView = searchParams.get("view"); // legado: mezclaba scope+display
  const rawS = searchParams.get("s");
  const rawV = searchParams.get("v");
  const rawScope = searchParams.get("scope");
  // Scope (qué datos): legado view=explore|history|mine.
  const scope: Scope =
    rawS === "explorar" || rawS === "historial" || rawS === "mias"
      ? rawS
      : rawView === "explore"
        ? "explorar"
        : rawView === "history"
          ? "historial"
          : "mias";
  // Display (cómo se ve): calendario en mias y explorar; el historial
  // es siempre lista. Legado view=calendar.
  const view: Display =
    scope !== "historial" &&
    (rawV === "calendar" || rawView === "calendar")
      ? "calendar"
      : "list";
  const styleId = searchParams.get("style") ?? "";
  const levelId = searchParams.get("level") ?? "";
  // Filtro de academia — solo lo expone el scope explorar.
  const academyId = searchParams.get("academy") ?? "";
  const upto = Math.max(
    1,
    Number.parseInt(searchParams.get("upto") ?? "1", 10) || 1,
  );
  // Sub-filtro de Mis clases: `mias` y view=mine son aliases legados
  // del scope reservadas.
  const calScope: CalScope =
    rawScope === "reservadas" || rawScope === "mias" || rawView === "mine"
      ? "reservadas"
      : "todas";

  const hrefFor = (o: {
    s?: string | null;
    v?: string | null;
    style?: string;
    level?: string;
    academy?: string;
    upto?: string;
    month?: string;
    day?: string;
    scope?: string | null;
  }) => {
    // Scope/vista destino: override explícito (null = default) o el
    // actual. El historial fuerza lista — sin calendario propio.
    const targetScope = "s" in o ? (o.s ?? "mias") : scope;
    const targetView =
      targetScope !== "historial" &&
      ("v" in o ? (o.v ?? "list") : view) === "calendar"
        ? "calendar"
        : "list";
    const { s: _s, v: _v, ...rest } = o;
    const merged = {
      s: targetScope !== "mias" ? targetScope : undefined,
      v: targetView !== "list" ? targetView : undefined,
      style: styleId || undefined,
      level: levelId || undefined,
      // El filtro de academia solo existe en explorar — no arrastrarlo
      // a scopes donde sería un filtro invisible.
      academy:
        targetScope === "explorar" ? academyId || undefined : undefined,
      upto: upto > 1 ? String(upto) : undefined,
      month: targetView === "calendar" ? monthParamKey : undefined,
      day:
        targetView === "calendar" ? (selectedDay ?? undefined) : undefined,
      // El sub-filtro todas|reservadas solo existe en Mis clases.
      scope:
        targetScope === "mias" && calScope === "reservadas"
          ? "reservadas"
          : undefined,
      ...rest,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return `/clases${qs ? `?${qs}` : ""}`;
  };

  // Etiqueta del grupo: Hoy/Mañana o "sáb 20 sep" (UTC, ver dayFmt).
  const dayLabel = (key: string, iso: string) => {
    if (key === localDayKey(new Date())) return te("today");
    if (key === localDayKey(new Date(Date.now() + DAY_MS)))
      return te("tomorrow");
    return dayFmt.format(new Date(iso));
  };

  const [mine, setMine] = useState<MyBooking[] | null>(null);
  const [mineState, setMineState] = useState<LoadState>("loading");
  const [classes, setClasses] = useState<BrowseClass[] | null>(null);
  const [browseState, setBrowseState] = useState<LoadState>("loading");
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyState, setHistoryState] = useState<LoadState>("loading");

  // Facetas de los selects: clases sin filtrar del scope actual —
  // con filtro activo `classes` ya viene acotado por el servidor.
  const [facetClasses, setFacetClasses] = useState<BrowseClass[] | null>(
    null,
  );

  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  // busyId = classId en vuelo (book o cancel) — compartido entre vistas.
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    setMineState("loading");
    try {
      const res = await apiFetch("/classes/mine");
      if (!res.ok) {
        setMineState("error");
        return;
      }
      const rows = (await res.json()) as MyBooking[];
      // El API ordena por fecha de clase asc; re-aseguro por hora.
      rows.sort((a, b) =>
        `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
      );
      setMine(rows);
      setMineState("ready");
    } catch {
      setMineState("error");
    }
  }, []);

  // Horizonte del fetch: en lista, upto semanas visibles + 1 de buffer
  // (el buffer detecta si hay "más adelante"); en calendario, hasta el
  // domingo final del grid mensual + colchón. Tope del API: 60 días.
  // ?month=YYYY-MM; legado week=<día> → su mes.
  const monthParam = parseMonth(searchParams.get("month") ?? undefined);
  const legacyWeek = parseDay(searchParams.get("week") ?? undefined);
  const monthCursor = monthStart(
    monthParam
      ? monthDate(monthParam)
      : legacyWeek
        ? new Date(`${legacyWeek}T12:00:00`)
        : new Date(),
  );
  const monthParamKey = monthKey(monthCursor);
  const prevMonthKey = monthKey(
    new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1),
  );
  const nextMonthKey = monthKey(
    new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1),
  );
  const todayKey = localDayKey(new Date());
  // Browse solo trae clases futuras — meses pasados estarían vacíos.
  const isCurrentMonth = monthParamKey === monthKey(new Date());

  const daysNeeded =
    view === "calendar"
      ? Math.min(
          Math.max(
            Math.ceil(
              (monthGridRange(monthCursor).end.getTime() +
                DAY_MS -
                Date.now()) /
                DAY_MS,
            ),
            14,
          ),
          60,
        )
      : Math.min(upto * 7 + 7, 60);

  const loadBrowse = useCallback(async () => {
    setBrowseState("loading");
    try {
      const params = new URLSearchParams({ days: String(daysNeeded) });
      // Mis clases = inscripción vigente; explorar = todas las
      // academias. El scope decide el scope del servidor.
      if (scope === "mias") params.set("scope", "enrolled");
      if (styleId) params.set("styleId", styleId);
      if (levelId) params.set("levelId", levelId);
      if (scope === "explorar" && academyId)
        params.set("academyId", academyId);
      const res = await apiFetch(`/classes/browse?${params.toString()}`);
      if (!res.ok) {
        setBrowseState("error");
        return;
      }
      const list = (await res.json()) as BrowseClass[];
      setClasses(list);
      // Opciones de los selects = estilos/niveles/academias que existen
      // en el scope. Con filtro activo el response ya viene acotado →
      // un fetch extra sin filtro (solo en ese caso) para las facetas.
      if (styleId || levelId || (scope === "explorar" && academyId)) {
        const base = new URLSearchParams({ days: String(daysNeeded) });
        if (scope === "mias") base.set("scope", "enrolled");
        const r2 = await apiFetch(`/classes/browse?${base.toString()}`);
        setFacetClasses(
          r2.ok ? ((await r2.json()) as BrowseClass[]) : list,
        );
      } else {
        setFacetClasses(list);
      }
      setBrowseState("ready");
    } catch {
      setBrowseState("error");
    }
  }, [daysNeeded, scope, styleId, levelId, academyId]);

  const loadHistory = useCallback(async () => {
    setHistoryState("loading");
    try {
      const res = await apiFetch("/classes/mine?scope=past");
      if (!res.ok) {
        setHistoryState("error");
        return;
      }
      setHistory((await res.json()) as HistoryItem[]);
      setHistoryState("ready");
    } catch {
      setHistoryState("error");
    }
  }, []);

  // Cada scope carga solo lo que muestra: historial de /mine?scope=past,
  // reservadas de /mine, el resto del browse (enrolled o directorio).
  useEffect(() => {
    if (scope === "historial") {
      void loadHistory();
      return;
    }
    if (scope === "mias" && calScope === "reservadas") {
      void loadMine();
      return;
    }
    void loadBrowse();
  }, [scope, calScope, loadMine, loadHistory, loadBrowse]);

  async function book(cls: BrowseClass): Promise<void> {
    setBusyId(cls.id);
    setNotice(null);
    try {
      const res = await apiFetch(`/classes/${cls.id}/book`, {
        method: "POST",
      });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      // El body es la ClassBooking: status decide el mensaje de éxito.
      const booking = (await res.json()) as { status?: string };
      setNotice({
        text: booking.status === "WAITLIST" ? t("waitlistOk") : t("bookedOk"),
        error: false,
      });
      await Promise.all([loadBrowse(), loadMine()]);
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusyId(null);
    }
  }

  // ─── Derivados de lista/calendario ───
  const now = Date.now();
  const pool = classes ?? [];
  // En lista: "Esta semana" = próximos 7 días; "Más adelante" = hasta el
  // horizonte upto*7; el fetch trae +7d de buffer → hasLater.
  const horizon = now + upto * WEEK_MS;
  const visible = pool.filter((c) => new Date(c.date).getTime() <= horizon);
  const thisWeek = visible.filter(
    (c) => new Date(c.date).getTime() <= now + WEEK_MS,
  );
  const later = visible.filter(
    (c) => new Date(c.date).getTime() > now + WEEK_MS,
  );
  const hasLater =
    upto * 7 + 7 <= 60 &&
    pool.some((c) => new Date(c.date).getTime() > horizon);

  // Calendario: en "todas" (mias) y en explorar los dots vienen del
  // browse; en "reservadas" de mis reservas — agenda propia.
  const calByDay = new Map<string, BrowseClass[]>();
  for (const c of pool) {
    const key = classDayKey(c.date);
    calByDay.set(key, [...(calByDay.get(key) ?? []), c]);
  }
  // Reservadas filtradas: /classes/mine no acepta params — los
  // dropdowns de estilo/nivel resuelven client-side por id.
  const filteredMine = (mine ?? []).filter(
    (b) =>
      (!styleId || b.series.style?.id === styleId) &&
      (!levelId || b.series.level?.id === levelId),
  );
  // Opciones de los selects = solo lo que existe en el set sin
  // filtrar del scope (evita elegir un filtro sin resultados).
  const facetPool: (BrowseClass | MyBooking)[] =
    scope === "mias" && calScope === "reservadas"
      ? (mine ?? [])
      : (facetClasses ?? []);
  const uniq = (
    xs: ({ id: string; name: string } | null | undefined)[],
  ): FilterOption[] => {
    const m = new Map<string, string>();
    for (const x of xs) if (x && !m.has(x.id)) m.set(x.id, x.name);
    return [...m.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  };
  // Facetas dependientes: los otros filtros acotan las opciones — un
  // nivel que no existe para el estilo+academia elegidos tampoco
  // tendría resultados. El filtro propio nunca se auto-acota (siempre
  // se puede ver/cambiar la selección vigente).
  const styleOptions = uniq(
    facetPool
      .filter(
        (c) =>
          (!levelId || c.series.level?.id === levelId) &&
          (!academyId || c.academy.id === academyId),
      )
      .map((c) => c.series.style),
  );
  // Nivel: dedup + orden por dificultad (order del catálogo —
  // Iniciación → Avanzado), no alfabético.
  const levelOptions = (() => {
    const m = new Map<string, { id: string; name: string; order: number }>();
    for (const c of facetPool.filter(
      (c) =>
        (!styleId || c.series.style?.id === styleId) &&
        (!academyId || c.academy.id === academyId),
    )) {
      const l = c.series.level;
      if (l && !m.has(l.id)) m.set(l.id, l);
    }
    return [...m.values()].sort((a, b) => a.order - b.order);
  })();
  // Academias con clases en el scope, acotadas por estilo/nivel.
  const academyOptions = uniq(
    facetPool
      .filter(
        (c) =>
          (!styleId || c.series.style?.id === styleId) &&
          (!levelId || c.series.level?.id === levelId),
      )
      .map((c) => c.academy),
  );
  const myByDay = new Map<string, MyBooking[]>();
  for (const b of filteredMine) {
    const key = classDayKey(b.date);
    myByDay.set(key, [...(myByDay.get(key) ?? []), b]);
  }
  const cells =
    scope === "mias" && calScope === "reservadas"
      ? monthCells(monthCursor, myByDay)
      : monthCells(monthCursor, calByDay);
  const gridKeys = new Set(cells.map((c) => c.key));
  // Día seleccionado: param si cae en el grid visible; si no, hoy.
  const selectedDay = (() => {
    const d = parseDay(searchParams.get("day") ?? undefined);
    if (d && gridKeys.has(d)) return d;
    if (gridKeys.has(todayKey)) return todayKey;
    return null;
  })();
  const selectedClasses = selectedDay ? (calByDay.get(selectedDay) ?? []) : [];
  const selectedMine = selectedDay ? (myByDay.get(selectedDay) ?? []) : [];
  const monthLabel = monthFmt.format(monthCursor);

  // Progreso personal del mes — asistencias de los últimos 30 días.
  const attended30d = (history ?? []).filter(
    (h) =>
      h.status === "attended" &&
      Date.now() - new Date(h.date).getTime() < 30 * DAY_MS,
  ).length;

  // ─── Clases compartidas con /eventos ───
  const chipClass = (active: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
      active
        ? "border-neon bg-neon/15 text-neon"
        : "border-white/15 text-white/60 hover:border-white/30 hover:text-white"
    }`;
  const iconBtn = (active: boolean) =>
    `inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.97] ${
      active ? "bg-neon text-night-950" : "text-white/60 hover:text-white"
    }`;

  // ─── Card del explorador (componente compartido con el home). El
  // día y la hora los dan los headings del grupo → sin `when`. ───
  const renderClassCard = (cls: BrowseClass) => (
    <li key={cls.id}>
      <ClassCard
        cls={cls}
        busy={busyId === cls.id}
        onBook={(c) => void book(c)}
      />
    </li>
  );

  // ─── Reservadas: mismo ClassCard del explorador (badge Reservado/
  // En espera arriba a la derecha — ya tienen su cupo, sin CTA) ───
  const renderMyCard = (b: MyBooking) => renderClassCard(b);

  const renderDayGroup = <T extends { date: string }>(
    g: { key: string; items: T[] },
    render: (item: T) => React.ReactNode,
  ) => (
    <section key={g.key}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
        {dayLabel(g.key, g.items[0].date)}
      </h3>
      <ul className="flex flex-col gap-2">{g.items.map(render)}</ul>
    </section>
  );

  function groupByDay<T extends { date: string }>(items: T[]) {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const key = classDayKey(item.date);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].map(([key, items]) => ({ key, items }));
  }

  // Subgrupo por hora de inicio dentro del día — la hora es encabezado
  // separador sobre los cards (a todo ancho), no dato repetido en cada uno.
  function groupByHour<T extends { startTime: string }>(items: T[]) {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      groups.set(item.startTime, [...(groups.get(item.startTime) ?? []), item]);
    }
    return [...groups.entries()].map(([time, items]) => ({ time, items }));
  }

  // Día de clases: heading del día + bloques "hh:mm" con sus cards.
  const hourLabelCls =
    "mb-1.5 text-sm font-semibold tabular-nums text-white/70";

  // Fallback tranquilo al final del recorrido (lista y calendario):
  // la particular es el escape cuando ninguna clase calza — card
  // outline, sin competir con el verde primario de Reservar.
  const particularFallback = (className = "") => (
    <Link
      href="/clases/particular"
      className={`group flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm transition-colors hover:border-neon/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${className}`}
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-white/60 transition-colors group-hover:text-white">
          {ta("fallbackCta")}
        </span>
        <span className="font-medium text-neon">
          {ta("fallbackAction")}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="text-neon transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
  const renderClassDayGroup = (g: { key: string; items: BrowseClass[] }) => (
    <section key={g.key}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
        {dayLabel(g.key, g.items[0].date)}
      </h3>
      <div className="flex flex-col gap-4">
        {groupByHour(g.items).map((h) => (
          <div key={h.time}>
            <p className={hourLabelCls}>{h.time}</p>
            <ul className="flex flex-col gap-2">
              {h.items.map(renderClassCard)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 pb-6 pt-3">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          {/* Display: lista|calendario — íconos segmentados (mismo
              control que /eventos). El historial es solo lista: sin
              calendario propio el grupo se oculta. */}
          {scope !== "historial" && (
            <Segmented
              tour="cl-views"
              ariaLabel={t("viewsLabel")}
              active={view}
              tone="solid"
              items={[
                {
                  key: "list",
                  href: hrefFor({
                    v: "list",
                    month: undefined,
                    day: undefined,
                  }),
                  icon: true,
                  ariaLabel: t("viewList"),
                  children: (
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
                    </svg>
                  ),
                },
                {
                  key: "calendar",
                  href: hrefFor({ v: "calendar" }),
                  icon: true,
                  ariaLabel: t("viewCalendar"),
                  children: (
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <rect x="3" y="4" width="18" height="17" rx="2" />
                      <path d="M8 2v3M16 2v3M3 9h18" />
                    </svg>
                  ),
                },
              ]}
            />
          )}
        </div>

        {/* Scope: qué se muestra — pills con texto (3 opciones: los
            íconos se vuelven crípticos; mismo patrón que /academias). */}
        <Segmented
          ariaLabel={t("scopesLabel")}
          active={scope}
          className="w-full"
          innerClassName="grid w-full grid-cols-3"
          items={[
            {
              key: "mias",
              href: hrefFor({ s: "mias" }),
              children: t("scopeMine"),
            },
            {
              key: "historial",
              href: hrefFor({ s: "historial" }),
              children: t("history"),
            },
            {
              key: "explorar",
              href: hrefFor({ s: "explorar" }),
              tour: "cl-explore",
              children: t("viewExplore"),
            },
          ]}
        />

        {/* Filtros: dropdowns de estilo y nivel tipo chip — misma
            gramática que géneros/locales. El toggle Todas|Reservadas
            es sub-filtro de Mis clases (lista y calendario). */}
        {scope !== "historial" && (
          <>
            {/* Todas|Reservadas (patrón de /practicas) + dropdowns
                estilo/nivel — en browse van al servidor; en reservadas
                filtran client-side sobre /classes/mine. */}
            <div className="flex flex-wrap items-center gap-2">
              {scope === "mias" && (
                <Segmented
                  ariaLabel={`${t("scopeAll")} / ${t("scopeBooked")}`}
                  active={calScope}
                  items={[
                    {
                      key: "todas",
                      href: hrefFor({ scope: undefined }),
                      children: t("scopeAll"),
                    },
                    {
                      key: "reservadas",
                      href: hrefFor({ scope: "reservadas" }),
                      children: t("scopeBooked"),
                    },
                  ]}
                />
              )}
              {/* <select> nativo: en mobile abre el picker del SO
                  (nunca desborda la pantalla) y es accesible gratis. */}
              <div className="relative shrink-0">
                <select
                  aria-label={t("filterStyle")}
                  value={styleId}
                  onChange={(e) =>
                    router.push(
                      hrefFor({ style: e.target.value || undefined }),
                    )
                  }
                  className={`${chipClass(!!styleId)} max-w-40 cursor-pointer appearance-none truncate bg-transparent pr-8`}
                >
                  <option value="">{t("filterStyle")}</option>
                  {styleOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${styleId ? "text-neon" : "text-white/40"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
              <div className="relative shrink-0">
                <select
                  aria-label={t("filterLevel")}
                  value={levelId}
                  onChange={(e) =>
                    router.push(
                      hrefFor({ level: e.target.value || undefined }),
                    )
                  }
                  className={`${chipClass(!!levelId)} max-w-40 cursor-pointer appearance-none truncate bg-transparent pr-8`}
                >
                  <option value="">{t("filterLevel")}</option>
                  {levelOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${levelId ? "text-neon" : "text-white/40"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
              {/* Academia — solo en explorar: en mis clases el scope
                  ya es la inscripción. */}
              {scope === "explorar" && (
                <div className="relative shrink-0">
                  <select
                    aria-label={t("filterAcademy")}
                    value={academyId}
                    onChange={(e) =>
                      router.push(
                        hrefFor({ academy: e.target.value || undefined }),
                      )
                    }
                    className={`${chipClass(!!academyId)} max-w-40 cursor-pointer appearance-none truncate bg-transparent pr-8`}
                  >
                    <option value="">{t("filterAcademy")}</option>
                    {academyOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${academyId ? "text-neon" : "text-white/40"}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              )}
            </div>
          </>
        )}
      </header>

      {/* Feedback de reservar/cancelar junto al contenido — al final
          del main quedaba fuera de pantalla en listas largas. */}
      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`text-sm ${notice.error ? "text-red-400" : "text-neon"}`}
        >
          {notice.text}
        </p>
      )}

      {scope === "historial" ? (
        /* ─── Historial — progreso personal, no competitivo (spec §9) ─── */
        <section aria-label={t("history")} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="sr-only">{t("history")}</h2>
            {attended30d > 0 && (
              <p className="text-xs font-medium text-neon">
                {t("monthlyAttended", { count: attended30d })}
              </p>
            )}
          </div>
          {historyState === "loading" && <SkeletonList items={2} />}
          {historyState === "error" && (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-sm text-white/60">
                {tc("error")}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadHistory()}
              >
                ↻ {tc("retry")}
              </Button>
            </div>
          )}
          {historyState === "ready" &&
            (history && history.length > 0 ? (
              <div className="flex flex-col gap-5">
                {groupByDay(history).map((g) =>
                  renderDayGroup(g, (h: HistoryItem) => (
                    <li key={h.id}>
                      {/* Mismo card que el resto de la vista — el
                          resultado (asististe/cancelaste) ocupa el slot
                          de acción; no hay CTA en una clase pasada. */}
                      <ClassCard
                        cls={h}
                        statusBadge={{
                          label: t(`historyStatus.${h.status}`),
                          variant:
                            h.status === "attended" ? "neon" : "muted",
                        }}
                      />
                    </li>
                  )),
                )}
              </div>
            ) : (
              <p className="text-sm text-white/50">{t("historyEmpty")}</p>
            ))}
        </section>
      ) : view === "calendar" ? (
        /* ─── Calendario mensual — mismo grid que /eventos ─── */
        <section>
          <div className="mb-4 flex items-center justify-between">
            {isCurrentMonth ? (
              <span className={iconBtn(false)} aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-white/20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </span>
            ) : (
              <Link
                href={hrefFor({ month: prevMonthKey, day: undefined })}
                className={iconBtn(false)}
                aria-label={te("prevMonth")}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </Link>
            )}
            <h2 className="text-base font-semibold capitalize">{monthLabel}</h2>
            <Link
              href={hrefFor({ month: nextMonthKey, day: undefined })}
              className={iconBtn(false)}
              aria-label={te("nextMonth")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
          {/* Grid mensual: fila de letras L–D + número + dots por
              género. Días de meses vecinos atenuados. No es
              role="grid" (sin navegación por flechas ni celdas
              semánticas) — es un grupo de links con nombres
              completos. */}
          <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden="true">
            {WEEKDAY_HEADERS.map((h, i) => (
              <span
                key={i}
                className="text-center text-[10px] font-semibold uppercase text-white/40"
              >
                {h}
              </span>
            ))}
          </div>
          <div
            role="group"
            className="grid grid-cols-7 gap-1"
            aria-label={t("viewCalendar")}
          >
            {cells.map((cell) => {
              const isToday = cell.key === todayKey;
              const isSelected = cell.key === selectedDay;
              const dots =
                scope === "mias" && calScope === "reservadas"
                  ? (cell.items as MyBooking[]).map((b) => ({
                      id: b.id,
                      genre: b.series.style?.genre,
                    }))
                  : (cell.items as BrowseClass[]).map((c) => ({
                      id: c.id,
                      genre: c.series.style?.genre,
                    }));
              // "lunes 22" completo para SR — la celda solo muestra el
              // número (la letra del día va en la fila de cabecera).
              const dayName = weekdayNameFmt.format(
                new Date(`${cell.key}T12:00:00`),
              );
              const inner = (
                <>
                  <span
                    className={`text-sm font-semibold ${
                      isToday ? "text-neon" : isSelected ? "text-white" : "text-white/70"
                    }`}
                  >
                    {cell.day}
                  </span>
                  <span className="flex h-1.5 items-start gap-0.5">
                    {dots.slice(0, 3).map((d) => (
                      <span
                        key={d.id}
                        className={`h-1.5 w-1.5 rounded-full ${genreDot(d.genre)}`}
                      />
                    ))}
                  </span>
                  {dots.length > 3 && (
                    <span className="text-[10px] leading-none text-white/40">
                      {te("more", { count: dots.length - 3 })}
                    </span>
                  )}
                </>
              );
              const cellClass = `flex min-h-11 flex-col items-center gap-0.5 rounded-xl py-1.5 ${
                isSelected ? "bg-neon/15" : ""
              } ${cell.inMonth ? "" : "opacity-40"}`;
              return cell.items.length === 0 ? (
                <div key={cell.key} className={cellClass}>
                  <span className="sr-only">{dayName}</span>
                  {inner}
                </div>
              ) : (
                <Link
                  key={cell.key}
                  href={hrefFor({ day: cell.key })}
                  aria-label={`${dayName} ${cell.day} — ${t("dayClasses", { count: dots.length })}`}
                  aria-current={isSelected ? "date" : undefined}
                  className={`${cellClass} transition-colors hover:bg-white/5 active:scale-[0.97]`}
                >
                  {inner}
                </Link>
              );
            })}
          </div>

          {/* Clases del día seleccionado */}
          {selectedDay && (
            <section className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
                {dayLabel(
                  selectedDay,
                  `${selectedDay}T00:00:00.000Z`,
                )}
              </h3>
              {scope === "mias" && calScope === "reservadas" ? (
                selectedMine.length === 0 ? (
                  <p className="text-sm text-white/50">{t("noClassesDay")}</p>
                ) : (
                  <ul className="flex flex-col gap-4">
                    {selectedMine.map(renderMyCard)}
                  </ul>
                )
              ) : browseState === "loading" ? (
                <SkeletonList items={2} />
              ) : selectedClasses.length === 0 ? (
                <p className="text-sm text-white/50">{t("noClassesDay")}</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {groupByHour(selectedClasses).map((h) => (
                    <div key={h.time}>
                      <p className={hourLabelCls}>{h.time}</p>
                      <ul className="flex flex-col gap-2">
                        {h.items.map(renderClassCard)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Mismo fallback que en lista — también al final del
              recorrido en calendario. */}
          {particularFallback("mt-6")}
        </section>
      ) : view === "list" && scope === "mias" && calScope === "reservadas" ? (
        /* ─── Reservadas (sub-filtro de Mis clases): mismo ClassCard ─── */
        <section
          aria-label={t("scopeBooked")}
          className="flex flex-col gap-3"
        >
          {mineState === "loading" && <SkeletonList items={2} />}
          {mineState === "error" && (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-sm text-white/60">
                {tc("error")}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadMine()}
              >
                ↻ {tc("retry")}
              </Button>
            </div>
          )}
          {mineState === "ready" &&
            (filteredMine.length > 0 ? (
              <div className="flex flex-col gap-5">
                {groupByDay(filteredMine).map((g) =>
                  renderDayGroup(g, renderMyCard),
                )}
              </div>
            ) : (mine?.length ?? 0) > 0 ? (
              // Hay reservas pero los filtros las excluyen todas.
              <p className="text-sm text-white/60">{t("empty")}</p>
            ) : (
              <Card className="flex flex-col items-center gap-4 py-10 text-center">
                <p role="status" className="text-white/70">
                  {t("emptyMine")}
                </p>
                <Button href={hrefFor({ s: "explorar" })}>
                  {t("explore")}
                </Button>
              </Card>
            ))}
        </section>
      ) : (
        /* ─── Lista (mis academias) / Explore (todas): esta semana /
            más adelante ─── */
        <>
          {browseState === "loading" && <SkeletonList items={2} />}
          {browseState === "error" && (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-sm text-white/60">
                {tc("error")}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadBrowse()}
              >
                ↻ {tc("retry")}
              </Button>
            </div>
          )}
          {browseState === "ready" &&
            (pool.length === 0 ? (
              scope === "explorar" ? (
                <p className="text-white/60">{t("empty")}</p>
              ) : (
                // Sin inscripciones vigentes (o sin clases en ellas):
                // el camino es explorar el resto de la escena.
                <Card className="flex flex-col items-center gap-4 py-10 text-center">
                  <p role="status" className="text-white/70">
                    {t("emptyEnrolled")}
                  </p>
                  <Button href={hrefFor({ s: "explorar" })}>
                    {t("explore")}
                  </Button>
                </Card>
              )
            ) : (
              <div className="flex flex-col gap-8">
                <section data-tour="cl-list">
                  <h2 className="mb-3 text-sm font-semibold text-neon">
                    {te("thisWeek")}
                  </h2>
                  <div className="flex flex-col gap-6">
                    {groupByDay(thisWeek).map(renderClassDayGroup)}
                    {thisWeek.length === 0 && (
                      <p className="text-sm text-white/60">{t("empty")}</p>
                    )}
                  </div>
                </section>
                {later.length > 0 && (
                  <section>
                    <h2 className="mb-3 text-sm font-semibold text-white/60">
                      {te("upcoming")}
                    </h2>
                    <div className="flex flex-col gap-6">
                      {groupByDay(later).map(renderClassDayGroup)}
                    </div>
                  </section>
                )}
                {/* "Ver la próxima semana" bajo demanda: cada click
                    amplía el horizonte una semana (mismo patrón eventos) */}
                {hasLater && (
                  <Link
                    href={hrefFor({ upto: String(upto + 1) })}
                    className="flex min-h-12 items-center justify-center rounded-full border border-white/15 text-sm font-medium text-white/70 transition-colors hover:border-neon/50 hover:text-white active:scale-[0.98]"
                  >
                    {te("loadLater")} ↓
                  </Link>
                )}
                {particularFallback()}
              </div>
            ))}
        </>
      )}

      {/* Tour de primera visita — los targets que falten (p.ej. el
          toggle de display en historial) se omiten solos; la lista se
          omite si aún no carga o está vacía. */}
      {((scope !== "historial" &&
        !(scope === "mias" && calScope === "reservadas") &&
        browseState === "ready") ||
        (scope === "mias" && calScope === "reservadas" &&
          mineState === "ready") ||
        (scope === "historial" && historyState === "ready")) && (
        <OnboardingRunner
          tour="clases"
          steps={
            [
              {
                element: "[data-tour='cl-views']",
                title: tt("s1.title"),
                description: tt("s1.desc"),
                side: "bottom",
              },
              {
                element: "[data-tour='cl-explore']",
                title: tt("s2.title"),
                description: tt("s2.desc"),
                side: "bottom",
              },
              {
                element: "[data-tour='cl-list']",
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

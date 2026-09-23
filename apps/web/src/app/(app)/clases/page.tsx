"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";
import { readError } from "@/components/academy/shared";
import {
  DAY_MS,
  DOT_COLOR,
  WEEK_MS,
  WEEKDAY_HEADERS,
  dayCompactFmt,
  localDayKey,
  parseDay,
  weekCells,
  weekStart,
} from "@/lib/calendar";
import type { GenreKey } from "@/lib/calendar";

// GET /classes/browse — clase materializada futura con contexto de serie.
type BrowseClass = {
  id: string;
  date: string; // ISO — medianoche UTC del día de la clase
  startTime: string;
  endTime: string;
  weekday: number;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  waitlistCount: number;
  myBooking: "BOOKED" | "WAITLIST" | null;
  // Inscripción vigente en la academia de la clase — habilita reservar.
  enrolled: boolean;
  academy: { id: string; name: string };
  instructor: { id: string; name: string | null } | null;
  // Todo slot pertenece a una serie — series nunca es null.
  series: {
    id: string;
    name: string;
    level: { id: string; name: string } | null;
    style: { id: string; name: string; genre: string | null } | null;
    dropInPrice: number | null;
    // Modalidad efectiva del horario: slot.types si declara, si no los de la serie.
    types: { id: string; name: string }[];
  };
};

type MyBooking = {
  bookingId: string;
  status: "BOOKED" | "WAITLIST";
  classId: string;
  date: string;
  // weekday + ids de estilo/nivel: los filtros de reservadas resuelven
  // client-side sobre estos campos (/classes/mine no acepta params).
  weekday: number;
  startTime: string;
  endTime: string;
  academy: { id: string; name: string };
  series: {
    name: string;
    level: { id: string; name: string } | null;
    style: { id: string; name: string; genre: string | null } | null;
  };
};

// GET /classes/mine?scope=past — historial del alumno (spec §9):
// asistencia prevalece sobre la reserva de la misma clase.
type HistoryItem = {
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  academy: { id: string; name: string };
  series: {
    name: string;
    level: { name: string } | null;
    style: { name: string } | null;
  };
  status: "attended" | "booked" | "cancelled";
};

type StyleOption = { id: string; name: string };
type LevelOption = { id: string; name: string };
type LoadState = "loading" | "error" | "ready";
// Vistas: mis academias (list/calendar), historial completo y explore
// (todas las academias). La antigua vista `mine` se plegó al filtro
// scope=reservadas — ver parsing de la URL más abajo.
type View = "list" | "calendar" | "history" | "explore";
type CalScope = "todas" | "reservadas";

// Card compacta (misma receta que las listas del dominio).
const cardCls =
  "rounded-xl border border-night-700 bg-night-800/60 px-4 py-3";

// Class.date llega como ISO a medianoche UTC — el día calendario es el
// prefijo ISO; "hoy/mañana" se compara contra el día LOCAL en en-CA.
const classDayKey = (iso: string) => iso.slice(0, 10);

const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const genreDot = (g: string | null | undefined) =>
  DOT_COLOR[(g ?? "") as GenreKey] ?? "bg-white/50";

// Cancelar en dos taps: "Cancelar" → inline "¿Seguro? Sí / No". Un
// window.confirm rompe la inmersión de la PWA; inline respeta el sistema.
function CancelBookingButton({
  busy,
  onConfirm,
}: {
  busy: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        {t("cancelBooking")}
      </Button>
    );
  }
  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={t("cancelConfirm")}
    >
      <span className="text-xs text-white/60">{t("cancelShort")}</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        {tc("yes")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => setConfirming(false)}
      >
        {tc("no")}
      </Button>
    </div>
  );
}

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
  const tt = useTranslations("tours.clases");
  const searchParams = useSearchParams();

  // ─── Estado en URL (mismo patrón que /eventos: deep-linkable) ───
  const rawView = searchParams.get("view");
  const rawScope = searchParams.get("scope");
  // `view=mine` legado (el ícono marcador) → lista en scope reservadas.
  const view: View =
    rawView === "calendar" || rawView === "history" || rawView === "explore"
      ? rawView
      : "list";
  const styleId = searchParams.get("style") ?? "";
  const levelId = searchParams.get("level") ?? "";
  const upto = Math.max(
    1,
    Number.parseInt(searchParams.get("upto") ?? "1", 10) || 1,
  );
  // `mias` es el alias legado del scope reservadas.
  const scope: CalScope =
    rawScope === "reservadas" || rawScope === "mias" || rawView === "mine"
      ? "reservadas"
      : "todas";

  const hrefFor = (o: {
    view?: string;
    style?: string;
    level?: string;
    upto?: string;
    week?: string;
    day?: string;
    scope?: string;
  }) => {
    // Vista destino: override explícito (undefined = list) o la actual.
    const target = "view" in o ? (o.view ?? "list") : view;
    const merged = {
      view: target !== "list" ? target : undefined,
      style: styleId || undefined,
      level: levelId || undefined,
      upto: upto > 1 ? String(upto) : undefined,
      week: target === "calendar" ? weekKey : undefined,
      day: target === "calendar" ? (selectedDay ?? undefined) : undefined,
      scope:
        (target === "list" || target === "calendar") && scope === "reservadas"
          ? "reservadas"
          : undefined,
      ...o,
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

  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);

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
      // El API ordena por createdAt desc; para el alumno importa la fecha.
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
  // domingo de la semana visible + colchón. Tope del API: 60 días.
  const weekParam = parseDay(searchParams.get("week") ?? undefined);
  const monday = weekStart(
    weekParam ? new Date(`${weekParam}T12:00:00`) : new Date(),
  );
  const weekKey = localDayKey(monday);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const prevWeekKey = localDayKey(new Date(monday.getTime() - 7 * DAY_MS));
  const nextWeekKey = localDayKey(new Date(monday.getTime() + 7 * DAY_MS));
  const todayKey = localDayKey(new Date());
  const isCurrentWeek = weekKey === localDayKey(weekStart(new Date()));

  const daysNeeded =
    view === "calendar"
      ? Math.min(
          Math.max(
            Math.ceil((sunday.getTime() + DAY_MS - Date.now()) / DAY_MS),
            14,
          ),
          60,
        )
      : Math.min(upto * 7 + 7, 60);

  const loadBrowse = useCallback(async () => {
    setBrowseState("loading");
    try {
      const params = new URLSearchParams({ days: String(daysNeeded) });
      // Lista/calendario = mis academias; explore = todas. La vista
      // decide el scope del servidor (inscripción vigente).
      if (view !== "explore") params.set("scope", "enrolled");
      if (styleId) params.set("styleId", styleId);
      if (levelId) params.set("levelId", levelId);
      const res = await apiFetch(`/classes/browse?${params.toString()}`);
      if (!res.ok) {
        setBrowseState("error");
        return;
      }
      setClasses((await res.json()) as BrowseClass[]);
      setBrowseState("ready");
    } catch {
      setBrowseState("error");
    }
  }, [daysNeeded, view, styleId, levelId]);

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

  // Cada vista carga solo lo que muestra: reservadas vive de /mine,
  // el resto de list/calendar/explore del browse (con su scope).
  useEffect(() => {
    if (view === "history") {
      void loadHistory();
      return;
    }
    if (scope === "reservadas" && view !== "explore") {
      void loadMine();
      return;
    }
    void loadBrowse();
  }, [view, scope, loadMine, loadHistory, loadBrowse]);

  // Catálogos de los filtros — una vez; fallo silencioso.
  useEffect(() => {
    apiFetch("/styles")
      .then(async (res) => (res.ok ? ((await res.json()) as StyleOption[]) : []))
      .then(setStyles)
      .catch(() => {});
    apiFetch("/classes/catalogs")
      .then(async (res) =>
        res.ok
          ? ((await res.json()) as { levels?: LevelOption[] })
          : null,
      )
      .then((c) => setLevels(c?.levels ?? []))
      .catch(() => {});
  }, []);

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

  // La confirmación vive en CancelBookingButton (dos taps inline) — esta
  // función solo se invoca tras confirmar.
  async function cancelBooking(classId: string): Promise<void> {
    setBusyId(classId);
    setNotice(null);
    try {
      const res = await apiFetch(`/classes/${classId}/book`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      setNotice({ text: t("cancelledOk"), error: false });
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

  // Calendario: en scope "todas" los dots vienen del browse (mis
  // academias); en "reservadas" de mis reservas — agenda propia.
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
  const myByDay = new Map<string, MyBooking[]>();
  for (const b of filteredMine) {
    const key = classDayKey(b.date);
    myByDay.set(key, [...(myByDay.get(key) ?? []), b]);
  }
  const cells =
    scope === "reservadas"
      ? weekCells(monday, myByDay)
      : weekCells(monday, calByDay);
  const weekKeys = new Set(cells.map((c) => c.key));
  // Día seleccionado: param si cae en la semana visible; si no, hoy.
  const selectedDay = (() => {
    const d = parseDay(searchParams.get("day") ?? undefined);
    if (d && weekKeys.has(d)) return d;
    if (weekKeys.has(todayKey)) return todayKey;
    return null;
  })();
  const selectedClasses = selectedDay ? (calByDay.get(selectedDay) ?? []) : [];
  const selectedMine = selectedDay ? (myByDay.get(selectedDay) ?? []) : [];
  const weekLabel = `${dayCompactFmt.format(monday)} – ${dayCompactFmt.format(sunday)}`;

  // Progreso personal del mes — asistencias de los últimos 30 días.
  const attended30d = (history ?? []).filter(
    (h) =>
      h.status === "attended" &&
      Date.now() - new Date(h.date).getTime() < 30 * DAY_MS,
  ).length;

  // ─── Clases compartidas con /eventos ───
  const chipClass = (active: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors active:scale-[0.97] ${
      active
        ? "border-neon bg-neon/15 text-neon"
        : "border-white/15 text-white/60 hover:border-white/30 hover:text-white"
    }`;
  const iconBtn = (active: boolean) =>
    `inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.97] ${
      active ? "bg-neon text-night-950" : "text-white/60 hover:text-white"
    }`;

  // ─── Card del explorador: [serie + meta] [acción]. El día y la hora
  // los dan los headings del grupo — parrilla de horarios, no repetición.
  const renderClassCard = (cls: BrowseClass) => {
    const full = cls.spotsLeft <= 0;
    const style = cls.series.style;
    return (
      <li key={cls.id} className={cardCls}>
        <div className="flex items-start gap-3">
          {/* Contenido en 4 líneas: estilo (título) / tipo+nivel
              diferenciados / academia+profe / cupo. El bloque entero
              linkea a la ficha de la clase. */}
          <Link
            href={`/clases/${cls.id}`}
            className="min-w-0 flex-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
          >
            {/* Estilo solo como título — es lo que el dancer busca */}
            <h2 className="truncate text-base font-semibold leading-snug">
              {style?.name ?? cls.series.name}
            </h2>
            {/* Tipo de clase + nivel como chips — diferenciados por
                variante: tipo outline (fuerte), nivel muted */}
            {(cls.series.types.length > 0 || cls.series.level) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {cls.series.types.map((x) => (
                  <Badge key={x.id} variant="outline">
                    {x.name}
                  </Badge>
                ))}
                {cls.series.level && (
                  <Badge variant="muted">{cls.series.level.name}</Badge>
                )}
              </div>
            )}
            {/* Academia · profesor */}
            <p className="mt-1 truncate text-xs text-white/50">
              {cls.academy.name}
              {cls.instructor?.name && ` · ${cls.instructor.name}`}
            </p>
            <p
              className={`mt-1 text-xs font-medium ${
                full
                  ? "text-white/50"
                  : cls.spotsLeft <= 3
                    ? "text-amber-300"
                    : "text-neon"
              }`}
            >
              {full
                ? cls.waitlistCount > 0
                  ? `${t("full")} · ${t("waitlistCount", { count: cls.waitlistCount })}`
                  : t("full")
                : cls.spotsLeft <= 3
                  ? t("lastSpots", { count: cls.spotsLeft })
                  : t("spotsLeft", { count: cls.spotsLeft })}
            </p>
          </Link>
          {/* Acción — reservar / espera / estado + cancelar (fuera del
              link para no anidar interactivos) */}
          <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
            {cls.myBooking === "BOOKED" ? (
              <>
                <Badge variant="neon">{t("booked")}</Badge>
                <CancelBookingButton
                  busy={busyId === cls.id}
                  onConfirm={() => void cancelBooking(cls.id)}
                />
              </>
            ) : cls.myBooking === "WAITLIST" ? (
              <>
                <Badge variant="outline">{t("waitlist")}</Badge>
                <CancelBookingButton
                  busy={busyId === cls.id}
                  onConfirm={() => void cancelBooking(cls.id)}
                />
              </>
            ) : !cls.enrolled ? (
              // Academia ajena (vista explore): sin inscripción vigente
              // no hay reserva — el API lo rechazaría con 403.
              <span className="text-xs leading-tight text-white/40">
                {t("requiresEnrollment")}
              </span>
            ) : full ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busyId === cls.id}
                onClick={() => void book(cls)}
              >
                {t("joinWaitlist")}
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={busyId === cls.id}
                onClick={() => void book(cls)}
              >
                {t("book")}
              </Button>
            )}
          </div>
        </div>
      </li>
    );
  };

  // ─── Card wallet de "Mis clases" (símil de Mis entradas) ───
  const renderMyCard = (b: MyBooking) => (
    <li key={b.bookingId}>
      <Card className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <Link
            href={`/clases/${b.classId}`}
            className="flex min-w-0 flex-col gap-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
          >
            <p className="truncate text-lg font-semibold">{b.series.name}</p>
            <p className="text-sm text-white/60">
              {dayLabel(classDayKey(b.date), b.date)} · {b.startTime}–{b.endTime}
            </p>
            <p className="text-sm text-white/50">{b.academy.name}</p>
          </Link>
          <Badge variant={b.status === "BOOKED" ? "neon" : "outline"}>
            {b.status === "BOOKED" ? t("booked") : t("waitlist")}
          </Badge>
        </div>
        {/* El QR es la credencial de check-in — misma fila que el ticket */}
        <Link
          href="/qr"
          className="flex min-h-11 items-center justify-between rounded-xl border border-night-700 bg-night-800 px-4 text-sm text-neon transition-colors hover:border-neon/60"
        >
          <span>{t("qrHint")}</span>
          <span aria-hidden="true">→</span>
        </Link>
        <CancelBookingButton
          busy={busyId === b.classId}
          onConfirm={() => void cancelBooking(b.classId)}
        />
      </Card>
    </li>
  );

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

  const styleLabel = styleId
    ? (styles.find((s) => s.id === styleId)?.name ?? t("filterStyle"))
    : t("filterStyle");
  const levelLabel = levelId
    ? (levels.find((l) => l.id === levelId)?.name ?? t("filterLevel"))
    : t("filterLevel");

  const title =
    view === "explore"
      ? t("viewExplore")
      : view === "history"
        ? t("history")
        : t("title");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-6 pb-6 pt-3">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{title}</h1>
          <div className="flex items-center gap-2">
            {/* Toggle lista/calendario/historial — íconos, segmented
                (mismo control que /eventos) */}
            <div
              data-tour="cl-views"
              className="flex items-center rounded-full border border-white/15 p-0.5"
            >
              <Link
                href={hrefFor({
                  view: undefined,
                  week: undefined,
                  day: undefined,
                  scope: undefined,
                })}
                aria-label={t("viewList")}
                aria-current={view === "list" ? "true" : undefined}
                className={iconBtn(view === "list")}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
                </svg>
              </Link>
              <Link
                href={hrefFor({
                  view: "calendar",
                  week: undefined,
                  day: undefined,
                })}
                aria-label={t("viewCalendar")}
                aria-current={view === "calendar" ? "true" : undefined}
                className={iconBtn(view === "calendar")}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <rect x="3" y="4" width="18" height="17" rx="2" />
                  <path d="M8 2v3M16 2v3M3 9h18" />
                </svg>
              </Link>
              <Link
                href={hrefFor({
                  view: "history",
                  week: undefined,
                  day: undefined,
                  scope: undefined,
                })}
                aria-label={t("viewHistory")}
                aria-current={view === "history" ? "true" : undefined}
                className={iconBtn(view === "history")}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                  <path d="M12 7v5l3 3" />
                </svg>
              </Link>
            </div>
            {/* Explorar — todas las academias, ícono aparte como
                el ticket de "Mis entradas" en /eventos */}
            <Link
              href={hrefFor({
                view: "explore",
                week: undefined,
                day: undefined,
                scope: undefined,
              })}
              data-tour="cl-explore"
              aria-label={t("viewExplore")}
              aria-current={view === "explore" ? "true" : undefined}
              className={`${iconBtn(view === "explore")} border border-white/15`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Filtros: dropdowns de estilo y nivel tipo chip — misma
            gramática que géneros/locales. El toggle Todas|Reservadas
            vive en list y calendar. */}
        {view !== "history" && (
          <>
            {/* Todas|Reservadas (patrón de /practicas) + dropdowns
                estilo/nivel — en browse van al servidor; en reservadas
                filtran client-side sobre /classes/mine. */}
            <div className="flex items-center gap-2">
              {(view === "list" || view === "calendar") && (
                <div className="flex items-center rounded-full border border-white/15 p-0.5">
                  <Link
                    href={hrefFor({ scope: undefined })}
                    aria-pressed={scope === "todas"}
                    className={`${chipClass(scope === "todas")} min-h-9 border-0 px-3`}
                  >
                    {t("scopeAll")}
                  </Link>
                  <Link
                    href={hrefFor({ scope: "reservadas" })}
                    aria-pressed={scope === "reservadas"}
                    className={`${chipClass(scope === "reservadas")} min-h-9 border-0 px-3`}
                  >
                    {t("scopeBooked")}
                  </Link>
                </div>
              )}
              <>
                <details key={styleId || "all-styles"} className="relative">
                    <summary
                      className={`${chipClass(!!styleId)} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
                    >
                      {styleLabel}
                    </summary>
                    <ul className="absolute left-0 z-20 mt-2 flex max-h-72 w-56 flex-col overflow-y-auto rounded-xl border border-night-700 bg-night-900 p-1 shadow-xl shadow-black/40">
                      <li>
                        <Link
                          href={hrefFor({ style: undefined })}
                          className={`flex min-h-11 items-center rounded-lg px-3 text-sm ${
                            !styleId ? "font-semibold text-neon" : "text-white/80 hover:bg-white/5"
                          }`}
                        >
                          {t("all")}
                        </Link>
                      </li>
                      {styles.map((s) => (
                        <li key={s.id}>
                          <Link
                            href={hrefFor({ style: s.id })}
                            className={`flex min-h-11 items-center rounded-lg px-3 text-sm ${
                              styleId === s.id ? "font-semibold text-neon" : "text-white/80 hover:bg-white/5"
                            }`}
                          >
                            {s.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                <details key={levelId || "all-levels"} className="relative">
                    <summary
                      className={`${chipClass(!!levelId)} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
                    >
                      {levelLabel}
                    </summary>
                    <ul className="absolute left-0 z-20 mt-2 flex max-h-72 w-56 flex-col overflow-y-auto rounded-xl border border-night-700 bg-night-900 p-1 shadow-xl shadow-black/40">
                      <li>
                        <Link
                          href={hrefFor({ level: undefined })}
                          className={`flex min-h-11 items-center rounded-lg px-3 text-sm ${
                            !levelId ? "font-semibold text-neon" : "text-white/80 hover:bg-white/5"
                          }`}
                        >
                          {t("all")}
                        </Link>
                      </li>
                      {levels.map((l) => (
                        <li key={l.id}>
                          <Link
                            href={hrefFor({ level: l.id })}
                            className={`flex min-h-11 items-center rounded-lg px-3 text-sm ${
                              levelId === l.id ? "font-semibold text-neon" : "text-white/80 hover:bg-white/5"
                            }`}
                          >
                            {l.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                </details>
              </>
            </div>
          </>
        )}
      </header>

      {view === "history" ? (
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
          {historyState === "loading" && (
            <Spinner size="sm" className="page-loading" />
          )}
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
                    <li key={h.classId} className={cardCls}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate font-medium">{h.series.name}</p>
                        <p className="shrink-0 text-sm font-medium tabular-nums text-white/70">
                          {h.startTime}–{h.endTime}
                        </p>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-white/60">
                          {h.academy.name}
                          {h.series.level?.name
                            ? ` · ${h.series.level.name}`
                            : ""}
                          {h.series.style?.name
                            ? ` · ${h.series.style.name}`
                            : ""}
                        </p>
                        <Badge
                          variant={
                            h.status === "attended"
                              ? "neon"
                              : h.status === "booked"
                                ? "outline"
                                : "muted"
                          }
                        >
                          {t(`historyStatus.${h.status}`)}
                        </Badge>
                      </div>
                    </li>
                  )),
                )}
              </div>
            ) : (
              <p className="text-sm text-white/50">{t("historyEmpty")}</p>
            ))}
        </section>
      ) : view === "calendar" ? (
        /* ─── Calendario semanal — misma franja que /eventos ─── */
        <section>
          <div className="mb-4 flex items-center justify-between">
            {isCurrentWeek ? (
              <span className={iconBtn(false)} aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-white/20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </span>
            ) : (
              <Link
                href={hrefFor({ week: prevWeekKey, day: undefined })}
                className={iconBtn(false)}
                aria-label={te("prevWeek")}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </Link>
            )}
            <h2 className="text-base font-semibold capitalize">{weekLabel}</h2>
            <Link
              href={hrefFor({ week: nextWeekKey, day: undefined })}
              className={iconBtn(false)}
              aria-label={te("nextWeek")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
          {/* Franja semanal: letra del día + número + dots por género */}
          <div role="grid" className="grid grid-cols-7 gap-1" aria-label={t("viewCalendar")}>
            {cells.map((cell, i) => {
              const isToday = cell.key === todayKey;
              const isSelected = cell.key === selectedDay;
              const dots =
                scope === "reservadas"
                  ? (cell.items as MyBooking[]).map((b) => ({
                      id: b.bookingId,
                      genre: b.series.style?.genre,
                    }))
                  : (cell.items as BrowseClass[]).map((c) => ({
                      id: c.id,
                      genre: c.series.style?.genre,
                    }));
              const inner = (
                <>
                  <span className="text-[10px] font-semibold uppercase text-white/40">
                    {WEEKDAY_HEADERS[i]}
                  </span>
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
                      {te("more").replace("{count}", String(dots.length - 3))}
                    </span>
                  )}
                </>
              );
              const cellClass = `flex min-h-14 flex-col items-center gap-0.5 rounded-xl py-2 ${
                isSelected ? "bg-neon/15" : ""
              }`;
              return cell.items.length === 0 ? (
                <div key={cell.key} className={cellClass}>
                  {inner}
                </div>
              ) : (
                <Link
                  key={cell.key}
                  href={hrefFor({ day: cell.key })}
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
              {scope === "reservadas" ? (
                selectedMine.length === 0 ? (
                  <p className="text-sm text-white/50">{t("noClassesDay")}</p>
                ) : (
                  <ul className="flex flex-col gap-4">
                    {selectedMine.map(renderMyCard)}
                  </ul>
                )
              ) : browseState === "loading" ? (
                <Spinner size="sm" className="page-loading" />
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
        </section>
      ) : view === "list" && scope === "reservadas" ? (
        /* ─── Reservadas (ex vista Mis clases): cards wallet con QR ─── */
        <section
          aria-label={t("scopeBooked")}
          className="flex flex-col gap-3"
        >
          {mineState === "loading" && (
            <Spinner size="sm" className="page-loading" />
          )}
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
                <Button href={hrefFor({ view: "explore", scope: undefined })}>
                  {t("explore")}
                </Button>
              </Card>
            ))}
        </section>
      ) : (
        /* ─── Lista (mis academias) / Explore (todas): esta semana /
            más adelante ─── */
        <>
          {browseState === "loading" && (
            <Spinner size="sm" className="page-loading" />
          )}
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
              view === "explore" ? (
                <p className="text-white/60">{t("empty")}</p>
              ) : (
                // Sin inscripciones vigentes (o sin clases en ellas):
                // el camino es explorar el resto de la escena.
                <Card className="flex flex-col items-center gap-4 py-10 text-center">
                  <p role="status" className="text-white/70">
                    {t("emptyEnrolled")}
                  </p>
                  <Button href={hrefFor({ view: "explore" })}>
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
              </div>
            ))}
        </>
      )}

      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`text-sm ${notice.error ? "text-red-400" : "text-neon"}`}
        >
          {notice.text}
        </p>
      )}

      {/* Tour de primera visita — el switcher y el ícono de Explorar
          siempre existen; la lista se omite si aún no carga o está vacía. */}
      {(((view === "list" || view === "explore") && scope === "todas" &&
        browseState === "ready") ||
        (view === "calendar" && browseState === "ready") ||
        (scope === "reservadas" && mineState === "ready") ||
        (view === "history" && historyState === "ready")) && (
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

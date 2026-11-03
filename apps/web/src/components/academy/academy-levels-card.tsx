"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { academyTierHas } from "@/lib/academy-features";
import {
  Badge,
  Card,
  PillTabs,
  type BadgeVariant,
} from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { useNumFmt } from "@/lib/intl";
import type { Academy, AcademyLevelInsights } from "./shared";

export type LevelInsightsState = "loading" | "ready" | "hidden" | "error";

/**
 * Fetch del insight de niveles/cupos (GET /academies/:id/insights/levels):
 * gate owner/ADMIN + feature PRO `insights`; sin la feature no se
 * fetchea y en 403 el estado queda "hidden" (COBROS/STUDIO y lentes sin
 * privilegio no conocen el dato). Lo consume el inicio completo (KPI
 * "sin nivel" en ambos modos + card de niveles y cupos en Extendido):
 * un solo fetch para todos los consumidores.
 */
export function useAcademyLevelInsights(academy: Academy): {
  data: AcademyLevelInsights | null;
  state: LevelInsightsState;
  reload: () => void;
} {
  const canInsights = academyTierHas(academy.tier, "insights");
  const [data, setData] = useState<AcademyLevelInsights | null>(null);
  const [state, setState] = useState<LevelInsightsState>(
    canInsights ? "loading" : "hidden",
  );

  const reload = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/academies/${academy.id}/insights/levels`);
      if (res.status === 403 || res.status === 404) {
        setData(null);
        setState("hidden");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setData((await res.json()) as AcademyLevelInsights);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [academy.id]);

  useEffect(() => {
    if (canInsights) void reload();
  }, [canInsights, reload]);

  return { data, state, reload: () => void reload() };
}

/**
 * Card "Niveles y cupos" del inicio Extendido (spec
 * academies/owner-insights). Un solo set de KPI cards por nivel
 * (número grande + label, mismo lenguaje que MiniKpi/KpiCard) y un
 * solo calendario semanal con una card por horario: ocupación y cupos
 * libres en primer plano, asistencia como dato terciario.
 * El header lleva un filtro de tipo (PillTabs, mismo patrón de
 * /analitica) y ambos bloques le responden: un tipo concreto muestra
 * sus niveles y solo sus horarios (la semana usa solo sus días);
 * "Todos" agrega los niveles por nombre sumando entre tipos (un
 * alumno puede contar en más de uno: el total del pie lo aclara) y
 * junta todos los horarios en la semana unificada, incluidos los que
 * no matchean ningún tipo. Un slot que sirve varios tipos aparece
 * una sola vez.
 * Presentacional: el fetch lo hace useAcademyLevelInsights en el padre.
 */

// Orden de columnas del calendario: la semana visual parte en lunes
// (convención es-CL del repo, ver WEEKDAY_HEADERS en lib/calendar.ts)
// pero weekday vale 0-6 con domingo=0.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export function AcademyLevelsCard({
  data,
}: {
  data: AcademyLevelInsights;
}) {
  const t = useTranslations("academy");
  // Asistencia promedio con un decimal (el server ya redondea a 0.1).
  const numFmt = useNumFmt({ maximumFractionDigits: 1 });

  // Filtro por tipo de clase con el mismo patrón de /analitica
  // (PillTabs: pills tablist de estado local). "all" = vista completa.
  const [typeFilter, setTypeFilter] = useState("all");
  // Estilo y nivel son multiselect (sets de keys activos; vacío =
  // todos). Filtran solo el agenda - los KPIs van por tipo.
  const [styleSel, setStyleSel] = useState<Set<string>>(new Set());
  const [levelSel, setLevelSel] = useState<Set<string>>(new Set());
  const toggleIn = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  // Sin horarios ni niveles: la card explica qué falta en vez de
  // mostrar una grilla de ceros.
  const nothingYet =
    data.bySlot.length === 0 &&
    data.byType.every((ty) => ty.levels.every((l) => l.count === 0));

  // Si la data recargada ya no trae el tipo elegido, el filtro cae a
  // "all" sin necesidad de un efecto.
  const activeType = data.byType.some((ty) => ty.typeId === typeFilter)
    ? typeFilter
    : "all";

  // KPIs por nivel, reactivos al filtro: "Todos" agrega por nombre de
  // nivel sumando entre tipos (Iniciación de En Pareja + Iniciación de
  // Shines en la misma card); un tipo concreto usa sus niveles tal como
  // vienen del server.
  const visibleLevels =
    activeType === "all"
      ? aggregateLevels(data.byType)
      : (data.byType
          .find((ty) => ty.typeId === activeType)
          ?.levels.map((l) => ({
            key: l.levelId,
            name: l.levelName,
            count: l.count,
          })) ?? []);
  const levelTotal = visibleLevels.reduce((a, l) => a + l.count, 0);

  // Un solo calendario: "Todos" junta cada horario una sola vez (los
  // que no matchean ningún tipo también entran); filtrado deja solo
  // los del tipo activo y los sin tipo se ocultan.
  // Opciones de estilo/nivel presentes en los horarios (si una
  // recarga quita la opción elegida, cae a "all" sin efecto).
  const styleOptions = [
    ...new Set(
      data.bySlot.map((s) => s.styleName).filter((x): x is string => !!x),
    ),
  ];
  const levelOptions = [
    ...new Map(
      data.bySlot
        .filter((s) => s.levelId && s.levelName)
        .map((s) => [s.levelId, s.levelName] as [string, string]),
    ).values(),
  ];
  const visibleSlots = data.bySlot
    .filter(
      (s) =>
        activeType === "all" ||
        s.types.some((st) => st.typeId === activeType),
    )
    .filter(
      (s) =>
        styleSel.size === 0 ||
        (s.styleName !== null && styleSel.has(s.styleName)),
    )
    .filter(
      (s) => levelSel.size === 0 || (s.levelId && levelSel.has(s.levelId)),
    );
  // Columnas = días laborados de la data visible, en orden lun-dom:
  // con un tipo filtrado la semana usa solo sus días y las cards
  // ganan ancho.
  const weekDays = WEEK_ORDER.filter((d) =>
    visibleSlots.some((s) => s.weekday === d),
  );

  return (
    <section aria-label={t("levels.title")} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("levels.title")}
        </h3>
        {/* Con un solo tipo "Todos" y ese tipo son la misma vista: el
            filtro solo aparece cuando la data trae 2 o más tipos. */}
        {!nothingYet && data.byType.length > 1 && (
          <PillTabs
            ariaLabel={t("levels.typeFilterLabel")}
            active={activeType}
            onSelect={setTypeFilter}
            items={[
              { key: "all", label: t("levels.allTypes") },
              ...data.byType.map((ty) => ({
                key: ty.typeId,
                label: ty.typeName,
              })),
            ]}
          />
        )}
      </div>
      {!nothingYet && (styleOptions.length > 1 || levelOptions.length > 1) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {styleOptions.length > 1 && (
            <ToggleChips
              label={t("levels.styleFilterLabel")}
              allLabel={t("levels.allStyles")}
              options={styleOptions.map((name) => ({ key: name, label: name }))}
              selected={styleSel}
              onToggle={(k) => setStyleSel(toggleIn(styleSel, k))}
              onClear={() => setStyleSel(new Set())}
            />
          )}
          {levelOptions.length > 1 && (
            <ToggleChips
              label={t("levels.levelFilterLabel")}
              allLabel={t("levels.allLevels")}
              options={levelOptions.map(([id, name]) => ({
                key: id,
                label: name,
              }))}
              selected={levelSel}
              onToggle={(k) => setLevelSel(toggleIn(levelSel, k))}
              onClear={() => setLevelSel(new Set())}
            />
          )}
        </div>
      )}
      {nothingYet ? (
        <Card padded={false}>
          <div className="flex items-center justify-between gap-3 px-4 py-4">
            <p className="text-sm text-ink/60">{t("levels.empty")}</p>
            <Link
              href="/academia/alumnos"
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-neon transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              {t("levels.unassignedCta")}
            </Link>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            {/* Alumnos por nivel como KPIs limpios: número grande en
                primer plano, nombre del nivel como label. */}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {visibleLevels.map((l) => (
                <li key={l.key}>
                  <Card className="flex h-full flex-col gap-0.5 px-3 py-2.5">
                    <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
                      {l.name}
                    </span>
                    <span
                      className={`text-2xl font-bold leading-none tabular-nums ${
                        l.count > 0 ? "text-neon" : "text-ink/40"
                      }`}
                    >
                      {l.count}
                    </span>
                  </Card>
                </li>
              ))}
            </ul>
            {/* Total del pie: en "Todos" con varios tipos aclara que
                la suma es por tipo (un alumno puede contar en más de
                uno); con un solo tipo o filtrado es el total plano. */}
            <p className="text-xs tabular-nums text-ink/50">
              {activeType === "all" && data.byType.length > 1
                ? t("levels.allTotal", { count: levelTotal })
                : t("levels.typeTotal", { count: levelTotal })}
            </p>
          </div>

          {/* Cupos por horario como un solo calendario semanal: una
              columna por día laborado, una card por clase. */}
          {visibleSlots.length > 0 ? (
            <WeekCalendar
              slots={visibleSlots}
              days={weekDays}
              numFmt={numFmt}
            />
          ) : (
            <p className="text-xs text-ink/50">
              {activeType === "all"
                ? t("levels.noSlots")
                : t("levels.noSlotsForType")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Agrega niveles por nombre entre tipos para la vista "Todos":
 * Iniciación de En Pareja e Iniciación de Shines suman en la misma
 * KPI card. El orden resultante es el de primera aparición en
 * byType (orden que ya trae el server).
 */
function aggregateLevels(byType: AcademyLevelInsights["byType"]): {
  key: string;
  name: string;
  count: number;
}[] {
  const agg = new Map<string, { key: string; name: string; count: number }>();
  for (const ty of byType) {
    for (const l of ty.levels) {
      const k = l.levelName.trim().toLowerCase();
      const prev = agg.get(k);
      if (prev) {
        prev.count += l.count;
      } else {
        agg.set(k, { key: l.levelId, name: l.levelName, count: l.count });
      }
    }
  }
  return [...agg.values()];
}

/**
 * Calendario semanal tipo agenda: en desktop la hora va en una
 * columna a la izquierda (una vez por horario) y cada día laborado
 * es su columna con la clase en su celda (vacía = dash tenue). En
 * mobile queda la lista apilada por día con la hora como etiqueta
 * sobre cada clase.
 */
function WeekCalendar({
  slots,
  days,
  numFmt,
}: {
  slots: AcademyLevelInsights["bySlot"];
  days: readonly number[];
  numFmt: Intl.NumberFormat;
}) {
  const t = useTranslations("academy");
  // Agenda real: unidad de 30min por fila (ROW_H px). La card se
  // posiciona absoluta por su hora de inicio y ocupa su duración -
  // una clase 19:30-20:30 arranca a media fila de las 19 y termina a
  // media fila de las 20. Clases traslapadas en un día se reparten
  // la columna en carriles (lanes) lado a lado.
  const ROW_H = 76; // px por cada 30min (1h ≈ 148px: la card se lee completa)
  const toMin = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
  const floor30 = (m: number) => m - (m % 30);
  const endMinOf = (s: AcademyLevelInsights["bySlot"][number]) =>
    s.endTime ? toMin(s.endTime) : toMin(s.startTime) + 60;
  const startMinOf = (
    s: AcademyLevelInsights["bySlot"][number],
  ) => toMin(s.startTime);
  const gridStart = floor30(
    Math.min(...slots.map((s) => {
      const m = toMin(s.startTime);
      return m - (m % 60);
    })),
  );
  const gridEnd = Math.max(
    ...slots.map((s) => {
      const e = endMinOf(s);
      return e + ((30 - (e % 30)) % 30); // techo a la media hora
    }),
  );
  const totalH = ((gridEnd - gridStart) / 30) * ROW_H;
  const hours: number[] = [];
  for (let m = gridStart; m <= gridEnd; m += 60) hours.push(m);
  const toHHMM = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  // Carriles por día: grupos de slots traslapados → lane/lanes.
  const lanesByDay = new Map<number, Map<string, { lane: number; lanes: number }>>();
  for (const d of days) {
    const meta = new Map<string, { lane: number; lanes: number }>();
    const ds = slots
      .filter((s) => s.weekday === d)
      .sort((a, b) => startMinOf(a) - startMinOf(b) || endMinOf(a) - endMinOf(b));
    let cluster: typeof ds = [];
    let clusterEnd = -1;
    const flush = () => {
      if (!cluster.length) return;
      const ends: number[] = [];
      for (const s of cluster) {
        const st = startMinOf(s);
        let i = ends.findIndex((e) => st >= e);
        if (i < 0) {
          i = ends.length;
          ends.push(0);
        }
        ends[i] = endMinOf(s);
        meta.set(s.slotId, { lane: i, lanes: 0 });
      }
      const lanes = ends.length;
      for (const s of cluster) meta.get(s.slotId)!.lanes = lanes;
      cluster = [];
      clusterEnd = -1;
    };
    for (const s of ds) {
      if (cluster.length && startMinOf(s) >= clusterEnd) flush();
      cluster.push(s);
      clusterEnd = Math.max(clusterEnd, endMinOf(s));
    }
    flush();
    lanesByDay.set(d, meta);
  }

  const pos = (s: AcademyLevelInsights["bySlot"][number]) => ({
    top: ((startMinOf(s) - gridStart) / 30) * ROW_H,
    height: Math.max(ROW_H - 4, ((endMinOf(s) - startMinOf(s)) / 30) * ROW_H - 4),
  });
  return (
    <>
      <div className="hidden md:block">
        {/* Header de días sticky bajo el appbar (h-14): al bajar la
            agenda sigue de referencia, como fijar filas en Excel. */}
        <div className="sticky top-14 z-30 -mx-1 flex gap-2 bg-canvas/90 px-1 pb-1 backdrop-blur">
          <div className="w-9 shrink-0" />
          {days.map((d) => (
            <h5
              key={d}
              className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-ink/50"
            >
              <span aria-hidden="true">{t(`weekday.${d}`).slice(0, 3)}</span>
              <span className="sr-only">{t(`weekday.${d}`)}</span>
            </h5>
          ))}
        </div>
        {/* Gutter de horas + columnas de día posicionadas */}
        <div className="mt-1 flex gap-2">
          <div
            className="relative w-9 shrink-0"
            style={{ height: totalH }}
          >
            {hours.map((m) => (
              <p
                key={m}
                className="absolute right-0 -translate-y-1/2 text-xs font-semibold tabular-nums text-ink/50"
                style={{ top: ((m - gridStart) / 30) * ROW_H }}
              >
                {toHHMM(m)}
              </p>
            ))}
          </div>
          {days.map((d) => {
            const meta = lanesByDay.get(d) ?? new Map();
            return (
              <div
                key={d}
                className="relative min-w-0 flex-1"
                style={{ height: totalH }}
                aria-label={t(`weekday.${d}`)}
              >
                {hours.map((m) => (
                  <div
                    key={m}
                    aria-hidden="true"
                    className="absolute inset-x-0 border-t border-line/40"
                    style={{ top: ((m - gridStart) / 30) * ROW_H }}
                  />
                ))}
                {slots
                  .filter((s) => s.weekday === d)
                  .map((s) => {
                    const { lane, lanes } = meta.get(s.slotId) ?? {
                      lane: 0,
                      lanes: 1,
                    };
                    const { top, height } = pos(s);
                    return (
                      <div
                        key={s.slotId}
                        className="absolute min-w-0"
                        style={{
                          top,
                          height,
                          left: `${(lane / lanes) * 100}%`,
                          width: `calc(${100 / lanes}% - 2px)`,
                        }}
                      >
                        <SlotCard slot={s} numFmt={numFmt} />
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: lista apilada por día con la hora como etiqueta de
          agenda sobre cada clase (un grid de 8 columnas no cabe). */}
      <div className="flex flex-col gap-3 md:hidden">
        {days.map((d) => {
          const daySlots = slots
            .filter((s) => s.weekday === d)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
          if (daySlots.length === 0) return null;
          return (
            <section
              key={d}
              aria-label={t(`weekday.${d}`)}
              className="flex min-w-0 flex-col gap-2 border-t border-line/60 pt-2.5 first:border-t-0 first:pt-0"
            >
              <h5
                className={`text-sm font-bold uppercase tracking-wide ${
                  d === new Date().getDay() ? "text-violet-300" : ""
                }`}
              >
                {t(`weekday.${d}`)}
              </h5>
              <ul className="flex flex-col gap-1.5">
                {daySlots.map((s) => (
                  <MobileSlotRow key={s.slotId} slot={s} numFmt={numFmt} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

/**
 * Card de clase dentro del calendario semanal (arquetipo lectura de
 * ui-cards). Arriba la clasificación: chip con el nivel de la serie
 * (neutro "Sin nivel" si no tiene). Contexto: hora con reloj y nombre
 * de la serie. Primario: ocupación asignados/capacidad con icono de
 * personas, con el chip de estado del cupo junto al número que lo
 * motiva. Terciario: asistencia reciente en muted.
 */
type SlotStatus = { variant: BadgeVariant; text: string };

// Estado del cupo → variant semántica del Badge: sobrecupo en rojo
// (problema), lleno en neon (cupo completo = meta ok), libres en
// verde (hay espacio para alumnos nuevos).
function slotStatus(
  s: AcademyLevelInsights["bySlot"][number],
  t: ReturnType<typeof useTranslations>,
): SlotStatus {
  return {
    variant: s.empty < 0 ? "live" : s.empty === 0 ? "neon" : "success",
    text:
      s.empty < 0
        ? t("levels.overbooked", { count: -s.empty })
        : s.empty === 0
          ? t("levels.full")
          : t("levels.spotsLeft", { count: s.empty }),
  };
}

/** Chips multiselect para estilo/nivel: cada opción es un toggle y
    "Todos" limpia el set. Estilo pill coherente con PillTabs. */
function ToggleChips({
  label,
  allLabel,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  allLabel: string;
  options: { key: string; label: string }[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
}) {
  const chipCls = (on: boolean) =>
    `inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
      on
        ? "bg-neon/15 text-neon"
        : "border border-line text-ink/60 hover:border-ink/30"
    }`;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-ink/40">
        {label}
      </span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onClear}
          aria-pressed={selected.size === 0}
          className={chipCls(selected.size === 0)}
        >
          {allLabel}
        </button>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onToggle(o.key)}
            aria-pressed={selected.has(o.key)}
            className={chipCls(selected.has(o.key))}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Mini barra de proporción ♂/♀ por métrica (como la línea de
    géneros de un evento): azul hombres, rosa mujeres, con el conteo
    de cada sexo a su lado en su color. */
function GenderBar({
  m,
  f,
  partner,
}: {
  m: number | null;
  f: number | null;
  /** Desbalance solo accionable en clases de pareja. */
  partner?: boolean;
}) {
  const tot = (m ?? 0) + (f ?? 0);
  if (!tot) {
    return <span className="h-1.5 w-10 rounded-full bg-ink/10" />;
  }
  const mp = Math.round(((m ?? 0) / tot) * 100);
  // Desbalance >=70% (clave en clases de pareja): la barra y el
  // conteo dominante pasan a warning como signal accionable.
  const skewed = !!partner && (mp >= 70 || mp <= 30);
  return (
    <span className={`flex items-center gap-1 rounded px-1 text-[11px] font-semibold tabular-nums ${
      skewed ? "bg-warn/15" : ""
    }`}>
      {skewed ? (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-warn/30 text-[10px] font-bold text-warn">
          !
        </span>
      ) : null}
      <span className={skewed && mp >= 70 ? "text-warn" : "text-sky-400"}>
        {m}
      </span>
      <span className="flex h-1.5 w-8 overflow-hidden rounded-full bg-ink/10">
        <span
          className={skewed && mp >= 70 ? "bg-warn" : "bg-sky-400"}
          style={{ width: `${mp}%` }}
        />
        <span
          className={skewed && mp <= 30 ? "bg-warn" : "bg-pink-400"}
          style={{ width: `${100 - mp}%` }}
        />
      </span>
      <span className={skewed && mp <= 30 ? "text-warn" : "text-pink-400"}>
        {f}
      </span>
    </span>
  );
}

/** Mini-stat en columna: label arriba, total/cupo, barra de
    proporción de género abajo. Tres columnas alineadas = lectura
    horizontal instantánea vs filas con labels distintos. */
function MetricCell({
  label,
  value,
  male,
  female,
  partner,
}: {
  label: string;
  value: string | number;
  male: number | null;
  female: number | null;
  partner?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-center tabular-nums">
      <span className="text-[10px] font-medium uppercase tracking-wide text-ink/60">
        {label}
      </span>
      <span className="text-sm font-bold">{value}</span>
      <GenderBar m={male} f={female} partner={partner} />
    </div>
  );
}

/** Bloque de 3 métricas como mini-stats horizontales. */
function MetricsGrid({
  slot: s,
  numFmt,
}: {
  slot: AcademyLevelInsights["bySlot"][number];
  numFmt: Intl.NumberFormat;
}) {
  const t = useTranslations("academy");
  // El desbalance de género solo es accionable en clases de pareja.
  const partner = s.types.some((x) => /pareja/i.test(x.typeName));
  return (
    <div className="mt-1 flex justify-between gap-2">
      <MetricCell
        label={t("levels.lastShort")}
        value={s.lastClassAttendance ?? "—"}
        male={s.lastMale}
        female={s.lastFemale}
        partner={partner}
      />
      <MetricCell
        label={t("levels.avgShort")}
        value={s.avgAttendance !== null ? numFmt.format(s.avgAttendance) : "—"}
        male={s.avgMale}
        female={s.avgFemale}
        partner={partner}
      />
      <MetricCell
        label={t("levels.nextShort")}
        value={s.nextBooked ?? "—"}
        male={s.nextMale}
        female={s.nextFemale}
        partner={partner}
      />
    </div>
  );
}

/** Fila compacta de mobile (rail ui-lists): hora al costado, card con
    nivel + chip en la fila de título y las métricas en una línea. */
function MobileSlotRow({
  slot: s,
  numFmt,
}: {
  slot: AcademyLevelInsights["bySlot"][number];
  numFmt: Intl.NumberFormat;
}) {
  const t = useTranslations("academy");
  const { variant, text } = slotStatus(s, t);
  return (
    <li className="flex gap-2">
      <p className="w-9 shrink-0 pt-2 text-right text-xs font-semibold tabular-nums text-ink/50">
        {s.startTime}
      </p>
      <Card className="min-w-0 flex-1 px-3 py-2">
        <Link
          href={
          s.nextClassId
            ? `/academia/clases/${s.nextClassId}`
            : "/academia/alumnos"
        }
          className="block"
          aria-label={`${s.seriesName} - ${t("levels.gotoClasses")}`}
        >
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-base font-bold">
            {s.seriesName}
          </p>
          <Badge
            variant={s.levelName ? "violet" : "muted"}
            className="shrink-0"
          >
            {s.levelName ?? t("levels.noLevel")}
          </Badge>
        </div>
        <MetricsGrid slot={s} numFmt={numFmt} />
        <div className="mt-1 flex justify-center border-t border-line/50 pt-1.5">
          <Badge variant={variant}>{text}</Badge>
          <span className="ml-1 self-center text-xs text-ink/50">
            {t("levels.ofCapacity", { count: s.capacity })}
          </span>
        </div>
        </Link>
      </Card>
    </li>
  );
}

function SlotCard({
  slot: s,
  numFmt,
}: {
  slot: AcademyLevelInsights["bySlot"][number];
  numFmt: Intl.NumberFormat;
}) {
  const t = useTranslations("academy");
  const { variant: statusVariant, text: statusText } = slotStatus(s, t);
  return (
    <Card
      className="flex h-full w-fit min-w-0 max-w-full flex-col gap-1.5 overflow-hidden px-2.5 py-2"
    >
      <Link
        href={
          s.nextClassId
            ? `/academia/clases/${s.nextClassId}`
            : "/academia/alumnos"
        }
        className="contents"
        aria-label={`${s.seriesName} - ${t("levels.gotoClasses")}`}
      >
      <div className="flex items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-base font-bold">
          {s.seriesName}
          {s.styleName ? ` · ${s.styleName}` : ""}
        </p>
        <Badge
          variant={s.levelName ? "violet" : "muted"}
          className="shrink-0"
        >
          {s.levelName ?? t("levels.noLevel")}
        </Badge>
      </div>
      <MetricsGrid slot={s} numFmt={numFmt} />
      </Link>
        <div className="mt-1 flex justify-center border-t border-line/50 pt-1.5">
          <Badge variant={statusVariant}>{statusText}</Badge>
          <span className="ml-1 self-center text-xs text-ink/50">
            {t("levels.ofCapacity", { count: s.capacity })}
          </span>
        </div>
    </Card>
  );
}

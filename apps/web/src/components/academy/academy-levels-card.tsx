"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { academyTierHas } from "@/lib/academy-features";
import {
  Badge,
  Card,
  PillTabs,
  UsersIcon,
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
  const visibleSlots =
    activeType === "all"
      ? data.bySlot
      : data.bySlot.filter((s) =>
          s.types.some((st) => st.typeId === activeType),
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
  // Filas por hora: cada slot cae en la fila del piso de su hora y
  // dentro de la celda se desplaza según el minuto (:30 ≈ a la mitad
  // de la celda, como una agenda real).
  const toMin = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
  const hourOf = (hm: string) => toMin(hm) - (toMin(hm) % 60);
  const toHHMM = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const range = slots.reduce(
    (r, s) => ({
      min: Math.min(r.min, hourOf(s.startTime)),
      max: Math.max(r.max, hourOf(s.startTime)),
    }),
    { min: Infinity, max: -Infinity },
  );
  const times: string[] = [];
  for (let m = range.min; m <= range.max; m += 60) times.push(toHHMM(m));
  const at = (d: number, rowMin: number) =>
    slots.filter((s) => s.weekday === d && hourOf(s.startTime) === rowMin);
  return (
    <>
      {/* Desktop: grilla agenda - fila por hora, la hora una vez a la
          izquierda, cada día su columna; celda vacía = dash tenue. */}
      <div
        className="hidden md:grid md:gap-2"
        style={{
          gridTemplateColumns: `auto repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        <span aria-hidden="true" />
        {days.map((d) => (
          <h5
            key={d}
            className="text-xs font-semibold uppercase tracking-wide text-ink/50"
          >
            <span aria-hidden="true">
              {t(`weekday.${d}`).slice(0, 3)}
            </span>
            <span className="sr-only">{t(`weekday.${d}`)}</span>
          </h5>
        ))}
        {times.map((time) => {
          const rowMin = toMin(time);
          return (
            <Fragment key={time}>
              <p className="flex items-start justify-end pt-1 pr-1 text-xs font-semibold tabular-nums text-ink/50">
                {time}
              </p>
              {days.map((d) => {
                const cell = at(d, rowMin);
                return cell.length > 0 ? (
                  <div
                    key={`${d}-${time}`}
                    className="flex min-w-0 flex-col gap-1.5"
                  >
                    {cell.map((s) => {
                      // Desplazamiento vertical proporcional al minuto
                      // de inicio: :30 queda a media celda (~mitad de
                      // una card de referencia de 88px).
                      const off = Math.round(
                        ((toMin(s.startTime) % 60) / 60) * 88,
                      );
                      return (
                        <div
                          key={s.slotId}
                          style={off ? { marginTop: off } : undefined}
                        >
                          <SlotCard
                            slot={s}
                            numFmt={numFmt}
                            rowTime={time}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    key={`${d}-${time}`}
                    aria-hidden="true"
                    className="rounded-2xl border border-dashed border-line/60"
                  />
                );
              })}
            </Fragment>
          );
        })}
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
              className="flex min-w-0 flex-col gap-1.5"
            >
              <h5 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                {t(`weekday.${d}`)}
              </h5>
              <ul className="flex flex-col gap-1.5">
                {daySlots.map((s) => (
                  <li key={s.slotId}>
                    <p className="mb-0.5 pl-1 text-xs font-semibold tabular-nums text-ink/50">
                      {s.startTime}
                    </p>
                    <SlotCard slot={s} numFmt={numFmt} />
                  </li>
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
function SlotCard({
  slot: s,
  numFmt,
  rowTime,
}: {
  slot: AcademyLevelInsights["bySlot"][number];
  numFmt: Intl.NumberFormat;
  /** Fila de la agenda en que cayó el slot - si la clase parte fuera
      de múltiplo :00/:30 se muestra su hora real dentro de la card. */
  rowTime?: string;
}) {
  const t = useTranslations("academy");
  // Estado del cupo → variant semántica del Badge: sobrecupo en rojo
  // (problema), lleno en neon (cupo completo = meta ok), libres en
  // verde (hay espacio para alumnos nuevos).
  const statusVariant: BadgeVariant =
    s.empty < 0 ? "live" : s.empty === 0 ? "neon" : "success";
  const statusText =
    s.empty < 0
      ? t("levels.overbooked", { count: -s.empty })
      : s.empty === 0
        ? t("levels.full")
        : t("levels.spotsLeft", { count: s.empty });
  return (
    <Card className="flex h-full flex-col gap-1.5 px-3 py-2.5">
      <Badge
        variant={s.levelName ? "outline" : "muted"}
        className="max-w-full self-start"
      >
        {s.levelName ?? t("levels.noLevel")}
      </Badge>
      {rowTime && s.startTime !== rowTime && (
        <p className="text-xs font-semibold tabular-nums text-ink/50">
          {s.startTime}
        </p>
      )}
      <p className="truncate text-sm font-medium">{s.seriesName}</p>
        <div className="tabular-nums">
          <p className="text-lg font-bold leading-none">
            <span className="sr-only">
              {t("levels.avgOfCapacity", {
                avg:
                  s.avgAttendance !== null
                    ? numFmt.format(s.avgAttendance)
                    : "0",
                capacity: s.capacity,
              })}
            </span>
            <span aria-hidden="true" className="flex items-center gap-1">
              <UsersIcon className="h-4 w-4 text-ink/50" />
              <span className="text-xs font-normal text-ink/50">
                {t("levels.avgShort")}
              </span>
              {s.avgAttendance !== null ? numFmt.format(s.avgAttendance) : "—"}
              <span className="font-normal text-ink/50">/{s.capacity}</span>
            </span>
          </p>
          <p
            aria-hidden="true"
            className="mt-1 flex items-center gap-1 text-sm font-semibold text-ink/60"
          >
            <span className="text-xs font-normal text-ink/50">
              {t("levels.lastShort")}
            </span>
            {s.lastClassAttendance !== null ? s.lastClassAttendance : "—"}
            <span className="font-normal text-ink/50">/{s.capacity}</span>
          </p>
        </div>
        <Badge variant={statusVariant} className="max-w-full self-start">
          {statusText}
        </Badge>
    </Card>
  );
}

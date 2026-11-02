"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { academyTierHas } from "@/lib/academy-features";
import { Card } from "@/components/ui";
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
 * academies/owner-insights). Estructura por tipo de clase:
 * subtítulo (tipo + total de alumnos), fila de KPI cards por nivel
 * (número grande + label, mismo lenguaje que MiniKpi/KpiCard) y debajo
 * la lista compacta de horarios que sirven ese tipo con
 * asignados/capacidad y cupos libres en primer plano. Un slot puede
 * servir varios tipos: se repite en cada sección que cubre; los que no
 * matchean ningún tipo van a la sección general "Cupos por horario".
 * Presentacional: el fetch lo hace useAcademyLevelInsights en el padre.
 */
export function AcademyLevelsCard({
  data,
}: {
  data: AcademyLevelInsights;
}) {
  const t = useTranslations("academy");
  // Asistencia promedio con un decimal (el server ya redondea a 0.1).
  const numFmt = useNumFmt({ maximumFractionDigits: 1 });

  // Sin horarios ni niveles: la card explica qué falta en vez de
  // mostrar una grilla de ceros.
  const nothingYet =
    data.bySlot.length === 0 &&
    data.byType.every((ty) => ty.levels.every((l) => l.count === 0));

  // Slots por tipo + los que no matchean ninguno (series sin tipo).
  const matchedSlotIds = new Set<string>();
  const slotsByType = data.byType.map((ty) => {
    const slots = data.bySlot.filter((s) =>
      s.types.some((st) => st.typeId === ty.typeId),
    );
    for (const s of slots) matchedSlotIds.add(s.slotId);
    return { type: ty, slots };
  });
  const otherSlots = data.bySlot.filter((s) => !matchedSlotIds.has(s.slotId));

  return (
    <section aria-label={t("levels.title")} className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("levels.title")}
      </h3>
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
        <div className="flex flex-col gap-5">
          {slotsByType.map(({ type, slots }) => {
            const total = type.levels.reduce((a, l) => a + l.count, 0);
            return (
              <section
                key={type.typeId}
                aria-label={type.typeName}
                className="flex flex-col gap-2"
              >
                {/* Tipo de clase: subtítulo de sección + total de alumnos
                    activos (multinivel: un alumno puede contar en más de
                    un nivel del mismo tipo). */}
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="text-sm font-semibold">{type.typeName}</h4>
                  <p className="text-xs tabular-nums text-ink/50">
                    {t("levels.typeTotal", { count: total })}
                  </p>
                </div>

                {/* Alumnos por nivel como KPIs limpios: número grande en
                    primer plano, nombre del nivel como label. */}
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {type.levels.map((l) => (
                    <li key={l.levelId}>
                      <Card className="flex h-full flex-col gap-0.5 px-3 py-2.5">
                        <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
                          {l.levelName}
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

                {/* Cupos por horario del tipo: ocupación y cupos libres
                    en primer plano, asistencia como dato terciario. */}
                {slots.length > 0 && (
                  <Card padded={false}>
                    <p className="px-4 pb-1 pt-2.5 text-xs font-semibold uppercase tracking-wide text-ink/50">
                      {t("levels.bySlotTitle")}
                    </p>
                    <ul className="flex flex-col divide-y divide-line">
                      {slots.map((s) => (
                        <SlotRow key={s.slotId} slot={s} numFmt={numFmt} />
                      ))}
                    </ul>
                  </Card>
                )}
              </section>
            );
          })}

          {/* Horarios sin tipo matcheable (series sin ClassType). */}
          {otherSlots.length > 0 && (
            <section
              aria-label={t("levels.bySlotTitle")}
              className="flex flex-col gap-2"
            >
              <h4 className="text-sm font-semibold">
                {t("levels.bySlotTitle")}
              </h4>
              <Card padded={false}>
                <ul className="flex flex-col divide-y divide-line">
                  {otherSlots.map((s) => (
                    <SlotRow key={s.slotId} slot={s} numFmt={numFmt} />
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Fila de cupo por horario. Primario: nombre de la serie y la
 * ocupación (asignados/capacidad, número grande). Secundario: día y
 * hora + estado de cupos (warn si quedan 2 o menos, o sobrecupo).
 * Terciario: asistencia reciente.
 */
function SlotRow({
  slot: s,
  numFmt,
}: {
  slot: AcademyLevelInsights["bySlot"][number];
  numFmt: Intl.NumberFormat;
}) {
  const t = useTranslations("academy");
  const tight = s.empty <= 2;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {s.seriesName}
          {s.levelName ? (
            <span className="font-normal text-ink/60"> · {s.levelName}</span>
          ) : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="capitalize font-medium text-ink/70">
            {t(`weekday.${s.weekday}`)} · {s.startTime}
          </span>
          <span className="text-ink/50">
            {s.avgAttendance !== null
              ? t("levels.avgAttendance", {
                  value: numFmt.format(s.avgAttendance),
                })
              : t("levels.noAttendance")}
            {s.lastClassAttendance !== null &&
              ` · ${t("levels.lastAttendance", {
                count: s.lastClassAttendance,
              })}`}
          </span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-base font-semibold leading-none tabular-nums">
          <span className="sr-only">
            {t("levels.assignedOf", {
              assigned: s.assigned,
              capacity: s.capacity,
            })}
          </span>
          <span aria-hidden="true">
            {s.assigned}
            <span className="font-normal text-ink/50">/{s.capacity}</span>
          </span>
        </p>
        <p
          className={`mt-1 text-xs font-medium tabular-nums ${
            tight ? "text-warn" : "text-ink/70"
          }`}
        >
          {s.empty < 0
            ? t("levels.overbooked", { count: -s.empty })
            : s.empty === 0
              ? t("levels.full")
              : t("levels.spotsLeft", { count: s.empty })}
        </p>
      </div>
    </li>
  );
}

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

const subHeadCls =
  "text-xs font-semibold uppercase tracking-wide text-ink/50";

/**
 * Card "Niveles y cupos" del inicio Extendido (spec
 * academies/owner-insights): cascada tipo → nivel → cupos por horario.
 * Cada tipo de clase es una sub-card con el conteo por nivel (chips)
 * y, debajo, los horarios que sirven ese tipo con asignados/capacidad,
 * cupos libres y asistencia reciente. Un slot puede servir varios
 * tipos: se repite en cada sección que cubre; los que no matchean
 * ningún tipo van a la sección general "Cupos por horario".
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

  const unassignedByType = new Map(
    data.unassigned.map((u) => [u.typeId, u.count]),
  );

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
        <ul className="flex flex-col gap-3">
          {slotsByType.map(({ type, slots }) => {
            const total = type.levels.reduce((a, l) => a + l.count, 0);
            const unassigned = unassignedByType.get(type.typeId) ?? 0;
            return (
              <li key={type.typeId}>
                <Card padded={false} className="flex flex-col">
                  {/* Tipo de clase: nombre + total de alumnos activos. */}
                  <header className="flex items-baseline justify-between gap-3 px-4 pt-3">
                    <h4 className="text-sm font-semibold">{type.typeName}</h4>
                    <p className="text-xs tabular-nums text-ink/50">
                      {t("levels.typeTotal", { count: total })}
                    </p>
                  </header>

                  {/* Niveles del tipo (multinivel: un alumno puede
                      contar en más de uno). El chip "sin nivel" marca
                      el dato por completar de este tipo. */}
                  <div className="flex flex-col gap-1.5 px-4 pb-3 pt-2">
                    <p className={subHeadCls}>{t("levels.byTypeTitle")}</p>
                    <ul className="flex flex-wrap gap-x-3 gap-y-1">
                      {type.levels.map((l) => (
                        <li
                          key={l.levelId}
                          className="text-sm tabular-nums text-ink/70"
                        >
                          {l.levelName}{" "}
                          <span className="font-semibold text-ink">
                            {l.count}
                          </span>
                        </li>
                      ))}
                      {unassigned > 0 && (
                        <li className="text-sm font-medium tabular-nums text-warn">
                          {t("levels.unassignedInline", { count: unassigned })}
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* Cupos por horario del tipo: asignables/capacidad,
                      cupos libres y asistencia reciente. */}
                  {slots.length > 0 && (
                    <div className="flex flex-col gap-1 border-t border-line px-4 py-2.5">
                      <p className={subHeadCls}>{t("levels.bySlotTitle")}</p>
                      <ul className="flex flex-col divide-y divide-line">
                        {slots.map((s) => (
                          <SlotRow key={s.slotId} slot={s} numFmt={numFmt} />
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}

          {/* Horarios sin tipo matcheable (series sin ClassType). */}
          {otherSlots.length > 0 && (
            <li>
              <Card padded={false} className="flex flex-col">
                <header className="px-4 pt-3">
                  <h4 className="text-sm font-semibold">
                    {t("levels.bySlotTitle")}
                  </h4>
                </header>
                <ul className="flex flex-col divide-y divide-line px-4 pb-2 pt-1">
                  {otherSlots.map((s) => (
                    <SlotRow key={s.slotId} slot={s} numFmt={numFmt} />
                  ))}
                </ul>
              </Card>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** Fila de cupo por horario: asignados/capacidad + libres a la derecha. */
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
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {s.seriesName}
          {s.levelName ? (
            <span className="text-ink/50"> · {s.levelName}</span>
          ) : null}
        </p>
        <p className="text-xs capitalize text-ink/50">
          {t(`weekday.${s.weekday}`)} {s.startTime}
          {" · "}
          {s.avgAttendance !== null
            ? t("levels.avgAttendance", {
                value: numFmt.format(s.avgAttendance),
              })
            : t("levels.noAttendance")}
          {s.lastClassAttendance !== null &&
            ` · ${t("levels.lastAttendance", {
              count: s.lastClassAttendance,
            })}`}
        </p>
      </div>
      <div className="shrink-0 text-right text-sm tabular-nums">
        <p className="font-semibold">
          {t("levels.assignedOf", {
            assigned: s.assigned,
            capacity: s.capacity,
          })}
        </p>
        <p
          className={`text-xs font-medium ${
            tight ? "text-warn" : "text-ink/50"
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

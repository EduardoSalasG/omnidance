"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { academyTierHas } from "@/lib/academy-features";
import { Button, Card, RefreshIcon, SkeletonCard } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { useNumFmt } from "@/lib/intl";
import type { Academy, AcademyLevelInsights } from "./shared";

const rowLinkCls =
  "flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";

type LoadState = "loading" | "ready" | "hidden" | "error";

/**
 * Card "Niveles y cupos" del inicio Extendido (spec
 * academies/owner-insights): alumnos activos por tipo×nivel, cupos
 * libres por horario y la cola "sin nivel asignado" para completar el
 * dato. GET /academies/:id/insights/levels: gate owner/ADMIN + feature
 * PRO `insights`: sin la feature no se fetchea y en 403 la card no se
 * renderiza (COBROS/STUDIO no la conocen).
 */
export function AcademyLevelsCard({ academy }: { academy: Academy }) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  // Asistencia promedio con un decimal (el server ya redondea a 0.1).
  const numFmt = useNumFmt({ maximumFractionDigits: 1 });

  const canInsights = academyTierHas(academy.tier, "insights");
  const [data, setData] = useState<AcademyLevelInsights | null>(null);
  const [state, setState] = useState<LoadState>(
    canInsights ? "loading" : "hidden",
  );

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/academies/${academy.id}/insights/levels`);
      if (res.status === 403 || res.status === 404) {
        // 403 = no es owner/ADMIN o tier sin `insights`: la card es
        // PRO y simplemente no existe para este lente.
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
    if (canInsights) void load();
  }, [canInsights, load]);

  if (state === "hidden") return null;
  if (state === "loading") {
    return (
      <section aria-label={t("levels.title")}>
        <SkeletonCard lines={3} />
      </section>
    );
  }
  if (state === "error") {
    return (
      <section aria-label={t("levels.title")} className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {t("levels.loadError")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </section>
    );
  }
  if (!data) return null;

  const unassigned = data.unassigned.filter((u) => u.count > 0);
  // Sin horarios ni niveles: la card explica qué falta en vez de
  // mostrar una grilla de ceros.
  const nothingYet =
    data.bySlot.length === 0 &&
    data.byType.every((ty) => ty.levels.every((l) => l.count === 0)) &&
    unassigned.length === 0;

  return (
    <section aria-label={t("levels.title")} className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("levels.title")}
      </h3>
      <Card padded={false}>
        {nothingYet ? (
          <div className="flex items-center justify-between gap-3 px-4 py-4">
            <p className="text-sm text-ink/60">{t("levels.empty")}</p>
            <Link
              href="/academia/alumnos"
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-neon transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              {t("levels.unassignedCta")}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {/* Alumnos activos por tipo×nivel (multinivel: un alumno
                puede contar en más de un nivel del mismo tipo). */}
            <div className="flex flex-col gap-2 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                {t("levels.byTypeTitle")}
              </p>
              <dl className="flex flex-col gap-1.5">
                {data.byType.map((ty) => (
                  <div
                    key={ty.typeId}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                  >
                    <dt className="text-sm font-medium">{ty.typeName}</dt>
                    <dd className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink/70">
                      {ty.levels.map((l) => (
                        <span key={l.levelId} className="tabular-nums">
                          {l.levelName}{" "}
                          <span className="font-semibold text-ink">
                            {l.count}
                          </span>
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Cupos por horario: asignables (nivel del alumno matchea
                tipos del slot + nivel de la serie), capacidad efectiva
                y asistencia reciente (promedio + última clase). */}
            {data.bySlot.length > 0 && (
              <div className="flex flex-col gap-2 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                  {t("levels.bySlotTitle")}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {data.bySlot.map((s) => {
                    const tight = s.empty <= 2;
                    return (
                      <li
                        key={s.slotId}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {s.seriesName}
                            {s.levelName ? (
                              <span className="text-ink/50">
                                {" "}
                                · {s.levelName}
                              </span>
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
                  })}
                </ul>
              </div>
            )}

            {/* Cola "sin nivel asignado": accionable, el owner completa
                el dato desde la ficha del alumno (roster). */}
            {unassigned.length > 0 && (
              <Link href="/academia/alumnos" className={rowLinkCls}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {t("levels.unassignedTitle")}
                  </span>
                  <span className="block text-xs text-warn">
                    {unassigned
                      .map((u) =>
                        t("levels.unassignedCount", {
                          count: u.count,
                          type: u.typeName,
                        }),
                      )
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-neon">
                  {t("levels.unassignedCta")}
                </span>
              </Link>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}

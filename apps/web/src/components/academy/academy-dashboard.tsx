"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { academyTierHas } from "@/lib/academy-features";
import {
  setAcademyHomeMode,
  useAcademyHomeMode,
} from "@/lib/academy-home-mode";
import {
  Button,
  Card,
  ChevronRightIcon,
  RefreshIcon,
  Skeleton,
  SkeletonCard,
} from "@/components/ui";
import { AcademyKpiCards } from "./academy-kpi-strip";
import {
  AcademyLevelsCard,
  useAcademyLevelInsights,
} from "./academy-levels-card";
import { AcademyVisibilityCard } from "./academy-visibility-card";
import {
  birthdayFmt,
  planDateFmt,
  shortId,
  type Academy,
  type AcademyDashboard as AcademyDashboardData,
  type AcademyLevelInsights,
} from "./shared";
import { Link } from "@/i18n/navigation";
import { getDateFmt, getNumFmt, useNumFmt } from "@/lib/intl";

const clpFmt = (locale: string) => getNumFmt(locale, {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const fullDayFmt = (locale: string) => getDateFmt(locale, {
  weekday: "long",
  day: "numeric",
  month: "long",
});
// Tope de filas por lista de insight - más allá, footer "Ver todos".
const LIST_CAP = 6;

// KPIs del home gateados por feature del tier (spec academy-tier-v2):
// clases/sem es operación (STUDIO `classes`), asistencia/clase es el
// insight de audiencia (PRO `insights`). El resto (alumnos activos,
// planes, facturado, ticket) es piso COBROS - billing/students.
const KPI_FEATURE: Record<string, string> = {
  weeklyClasses: "classes",
  avgAttendance: "insights",
};

;
;
;
;

const listCls = "flex flex-col divide-y divide-line";
const rowLinkCls =
  "flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";
const sectionTitleCls =
  "text-sm font-semibold uppercase tracking-wide text-ink/50";

/**
 * Resumen de la academia seleccionada (inicio del owner): nombre + KPIs
 * del mes con comparativa, operación del día (clases, cobros por
 * revisar) e insights de retención. GET /academies/:id/dashboard →
 * AcademyDashboard.
 */
export function AcademyDashboard({
  academy,
  // En /inicio las filas de vencimientos llevan a cobros (la acción
  // natural es cobrar/renovar); en /academia siguen a la ficha del
  // alumno, que es donde staff/instructor gestionan la inscripción.
  expiringHref,
  // Checklist de activación del owner (spec academies/owner-insights) -
  // solo en su inicio; la consola de staff en /academia no la muestra.
  setupChecklist = false,
}: {
  academy: Academy;
  expiringHref?: string;
  setupChecklist?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("academy");
  const tc = useTranslations("common");

  // Modo de inicio (spec academies/owner-insights): Simplificado por
  // defecto (cards accionables llanas), Extendido = métricas completas
  // + niveles y cupos. Persistido por dispositivo vía useSyncExternalStore.
  const homeMode = useAcademyHomeMode();

  const [dashboard, setDashboard] = useState<AcademyDashboardData | null>(
    null,
  );
  const [dashError, setDashError] = useState(false);

  const refresh = useCallback(async () => {
    setDashError(false);
    try {
      const res = await apiFetch(`/academies/${academy.id}/dashboard`);
      if (res.ok) {
        setDashboard((await res.json()) as AcademyDashboardData);
      } else {
        setDashError(true);
      }
    } catch {
      // Fetch rechazado = red caída o API apagada.
      setDashError(true);
    }
  }, [academy.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Las colas del home son KPIs de solo conteo (spec owner: la acción
  // vive en el módulo destino, no en la lista inline).
  const expiringCount = dashboard?.expiringEnrollments.length ?? 0;
  const birthdays = dashboard?.upcomingBirthdays ?? [];

  // Insight de niveles/cupos (PRO `insights` + owner/ADMIN): alimenta
  // el KPI "sin nivel" (ambos modos) y la card anidada (Extendido).
  const levelInsights = useAcademyLevelInsights(academy);
  const unassigned = (levelInsights.data?.unassigned ?? []).filter(
    (u) => u.count > 0,
  );
  const unassignedTotal = unassigned.reduce((a, u) => a + u.count, 0);
  const unassignedBreakdown = unassigned
    .map((u) =>
      t("levels.unassignedCount", { count: u.count, type: u.typeName }),
    )
    .join(" · ");

  // Gating fino por tier (spec academy-tier-v2): la operación de clases
  // (hoy, particulares pendientes, KPI clases/sem) es `classes`; la
  // asistencia marcada del día es `attendance`; el insight de
  // audiencia/clase es `insights`. Todo se deriva de `academy.tier`
  // (viaja en /academies/mine para cualquier lente del equipo).
  const canClasses = academyTierHas(academy.tier, "classes");
  const canAttendance = academyTierHas(academy.tier, "attendance");
  const canFeature = (f: string) => academyTierHas(academy.tier, f);

  // KPIs visibles según features: COBROS conserva los de cobranza
  // (alumnos, planes, facturado, ticket); STUDIO suma los operativos;
  // el de audiencia queda en PRO.
  const kpiKeys = [
    "activeStudents",
    "weeklyClasses",
    "avgAttendance",
  ].filter((k) => {
    const f = KPI_FEATURE[k];
    return f == null || canFeature(f);
  });

  // Checklist de activación: 4 pasos de puesta en marcha, persistente
  // hasta completarlos todos (no hasta el primer alumno). El orden es
  // el flujo natural: horario → qué cobrar → quién ayuda → a quién
  // cobrar. Medio de pago propio NO es paso: el checkout gestionado
  // (Flow de la plataforma) cobra sin que la academia configure nada -
  // transferencia/efectivo es opcional para comprobante manual.
  const checklistSteps = dashboard
    ? ([
        {
          key: "series",
          done: dashboard.kpis.weeklyClasses > 0,
          href: "/academia/series",
        },
        {
          key: "plan",
          done: dashboard.plansCount > 0,
          href: "/academia/planes",
        },
        {
          key: "team",
          done: dashboard.teamCount > 0,
          href: "/academia/equipo",
        },
        {
          key: "student",
          done: dashboard.totalStudents > 0,
          href: "/academia/alumnos",
        },
      ] as const)
    : [];
  const checklistDone = checklistSteps.filter((s) => s.done).length;
  const showChecklist =
    setupChecklist && dashboard != null && checklistDone < checklistSteps.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-lg font-semibold">{academy.name}</h2>
        <div className="flex items-center gap-3">
          <p className="text-xs capitalize text-ink/50">
            {fullDayFmt(locale).format(new Date())}
          </p>
          {/* Modo de inicio: Simplificado (default) / Extendido.
              Segmented por estado (no navegación: persiste en
              localStorage, mismo look que Segmented soft). */}
          <div
            role="group"
            aria-label={t("homeMode.label")}
            data-tour="academy-home-mode"
            className="inline-flex rounded-full border border-ink/15 p-0.5"
          >
            {(["simple", "extended"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={homeMode === m}
                onClick={() => setAcademyHomeMode(m)}
                className={`inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.97] ${
                  homeMode === m
                    ? "bg-neon/15 text-neon"
                    : "text-ink/60 hover:text-ink"
                }`}
              >
                {t(`homeMode.${m}`)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Estado de publicación (spec academy-approval-gate): visible al
          owner hasta que la academia completa el checklist o es aprobada. */}
      <AcademyVisibilityCard
        reviewStatus={academy.reviewStatus}
        reviewChecks={academy.reviewChecks}
      />

      {/* Modo Simplificado: 3-4 cards accionables en lenguaje llano
          (qué hay que hacer hoy) derivadas del mismo dashboard, sin
          endpoints nuevos. */}
      {homeMode === "simple" && (
        <SimpleHomeCards
          dashboard={dashboard}
          error={dashError}
          onRetry={() => void refresh()}
          expiringHref={expiringHref}
          canClasses={canClasses}
          insights={levelInsights.data}
        />
      )}

      {/* KPIs del mes (spec consola owner): alumnos activos con plan
          vigente, planes comprables, clases/sem, asistencia/clase,
          facturado y ticket/alumno - con delta vs el mismo tramo del
          mes anterior donde hay base. Modo Extendido. */}
      {homeMode === "extended" && (
        <section aria-label={t("sections.overview")} className="flex flex-col gap-4">
          <AcademyKpiCards
            data={dashboard}
            error={dashError}
            onRetry={() => void refresh()}
            // Sin el split de género: en inicio no es accionable (el
            // detalle demográfico vive en alumnos/analítica). El subset se
            // filtra por feature del tier (spec academy-tier-v2).
            keys={kpiKeys}
            extra={
              dashboard ? (
                <MiniKpi
                  href="/academia/asistencia"
                  title={t("kpis.attendanceToday")}
                  count={dashboard.todayClasses.reduce(
                    (a, c) => a + c.bookedCount,
                    0,
                  )}
                  hint={
                    dashboard.attendanceToday > 0
                      ? t("homeMode.todayHint")
                      : t("homeMode.todayDone")
                  }
                />
              ) : (
                // Slot "Reservas hoy" reservado en carga: sin él la fila
                // pasa de 3 a 4 cards al resolver (spec loading-states).
                <li>
                  <Card className="flex h-full flex-col gap-1 p-4">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-8 w-16" />
                  </Card>
                </li>
              )
            }
          />
        </section>
      )}

      {/* Facturación del mes como sección propia (Extendido): lo que se
          cobra, no la operación del día. */}
      {homeMode === "extended" && (
        <section
          aria-label={t("sections.billing")}
          data-tour="academy-billing"
          className="flex flex-col gap-4"
        >
          <h3 className={sectionTitleCls}>{t("sections.billing")}</h3>
          <AcademyKpiCards
            data={dashboard}
            error={dashError}
            onRetry={() => void refresh()}
            keys={["billedMonth", "avgTicket"]}
          />
        </section>
      )}

      {/* Checklist de activación: persiste hasta completar los 4 pasos
          de puesta en marcha (spec academies/owner-insights) - antes se
          escondía con el primer alumno aunque faltara configuración. */}
      {showChecklist && (
        <Card padded={false} data-tour="academy-checklist" className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className={sectionTitleCls}>{t("onboarding.title")}</h3>
            <p className="text-xs tabular-nums text-ink/50">
              {t("onboarding.progress", {
                done: checklistDone,
                total: checklistSteps.length,
              })}
            </p>
          </div>
          <ul className="mt-3 flex flex-col gap-1">
            {checklistSteps.map((s) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-medium transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      s.done
                        ? "border-neon bg-neon/15 text-neon"
                        : "border-ink/30 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className={s.done ? "text-ink/40 line-through" : ""}>
                    {t(`onboarding.${s.key}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Operación del día (ambos modos): colas accionables como
          KPIs de solo conteo + la fila de cards medianas (clases de
          hoy a la izquierda, cumpleaños a la derecha en desktop). */}
      {dashboard && (
        <section
          aria-label={t("sections.operation")}
          className="flex flex-col gap-4"
        >
          <h3 className={sectionTitleCls}>{t("sections.operation")}</h3>

          {/* Colas del día como KPIs de solo conteo: la acción vive en
              el módulo destino, no en una lista inline. */}
          <ul
            data-tour="academy-pending"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <MiniKpi
              href="/academia/cobros"
              title={t("insights.pendingClaimsTitle")}
              count={dashboard.pendingClaims.count}
              hint={
                dashboard.pendingClaims.count > 0
                  ? t("homeMode.claimsHint", {
                      amount: clpFmt(locale).format(
                        dashboard.pendingClaims.amount,
                      ),
                    })
                  : t("homeMode.claimsDone")
              }
            />
            {canClasses && (
              <MiniKpi
                href="/academia/particulares"
                title={t("insights.pendingLessonsTitle")}
                count={dashboard.pendingLessons.count}
                hint={
                  dashboard.pendingLessons.count > 0
                    ? t("homeMode.lessonsHint")
                    : t("homeMode.lessonsDone")
                }
              />
            )}
            <MiniKpi
              href={expiringHref ?? "/academia/alumnos"}
              title={t("insights.expiringWeekTitle")}
              count={expiringCount}
              hint={
                expiringCount > 0
                  ? t("homeMode.expiringHint")
                  : t("homeMode.expiringDone")
              }
            />
            {levelInsights.data && (
              <MiniKpi
                href="/academia/alumnos"
                title={t("levels.unassignedTitle")}
                count={unassignedTotal}
                hint={
                  unassignedTotal > 0
                    ? unassignedBreakdown
                    : t("homeMode.unassignedDone")
                }
              />
            )}
          </ul>

          {/* Cards medianas: clases del día (feature `classes`,
              STUDIO+) y próximos cumpleaños lado a lado en desktop. */}
          <div
            className={`grid gap-6 ${
              canClasses && birthdays.length > 0 ? "lg:grid-cols-2" : ""
            }`}
          >
            {canClasses && (
              <TodayClassesCard
                dashboard={dashboard}
                canAttendance={canAttendance}
                t={t}
              />
            )}
            {birthdays.length > 0 && (
              <BirthdaysCard birthdays={birthdays} t={t} />
            )}
          </div>
        </section>
      )}

      {/* Niveles y cupos por horario (spec academies/owner-insights):
          solo modo Extendido; state "hidden" = tier sin `insights`
          (PRO) o caller sin privilegio: la sección no existe. */}
      {homeMode === "extended" && levelInsights.state === "loading" && (
        <section aria-label={t("levels.title")}>
          <SkeletonCard lines={3} />
        </section>
      )}
      {homeMode === "extended" && levelInsights.state === "error" && (
        <section
          aria-label={t("levels.title")}
          className="flex items-center gap-3"
        >
          <p role="alert" className="text-sm text-ink/60">
            {t("levels.loadError")}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={levelInsights.reload}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </section>
      )}
      {homeMode === "extended" && levelInsights.data && (
        <AcademyLevelsCard data={levelInsights.data} />
      )}
    </div>
  );
}

/**
 * Cards accionables del modo Simplificado (spec academies/owner-insights):
 * 3-5 ítems en lenguaje llano que responden "qué hay que hacer" y llevan
 * directo a la acción. Todo se deriva del mismo GET /dashboard más el
 * insight de niveles (PRO), sin endpoints nuevos; las colas vacías
 * quedan en 0 (nada pendiente sigue siendo información honesta, no un
 * hueco).
 */
function SimpleHomeCards({
  dashboard,
  error,
  onRetry,
  expiringHref,
  canClasses,
  insights,
}: {
  dashboard: AcademyDashboardData | null;
  error: boolean;
  onRetry: () => void;
  expiringHref?: string;
  canClasses: boolean;
  /** Insight de niveles (PRO + owner/ADMIN); null = feature fuera de
      alcance o aún sin cargar: la card "sin nivel" no se muestra. */
  insights: AcademyLevelInsights | null;
}) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const clpFmt = useNumFmt({
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });

  if (error) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  if (dashboard === null) {
    // Skeleton con la forma final (mismo estándar que AcademyKpiCards).
    return (
      <ul
        aria-hidden="true"
        className="page-loading grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {[0, 1, 2, 3].map((i) => (
          <li key={i}>
            <Card className="flex h-full flex-col gap-1 p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-3 w-20" />
            </Card>
          </li>
        ))}
      </ul>
    );
  }

  // Alumnos sin nivel asignado (dato por completar): suma por tipo.
  const unassignedTotal = (insights?.unassigned ?? []).reduce(
    (a, u) => a + u.count,
    0,
  );

  // Cupos libres de hoy: solo clases con capacidad definida; null si
  // ninguna la informa (entonces el hint genérico toma su lugar).
  const freeSpotsToday = dashboard.todayClasses.reduce<number | null>(
    (acc, c) =>
      c.capacity === null ? acc : (acc ?? 0) + (c.capacity - c.bookedCount),
    null,
  );

  // Colas pendientes del día (cobros por revisar + particulares):
  // una sola card "Operación del día" en el set simplificado.
  const pendingToday = dashboard.pendingClaims.count + dashboard.pendingLessons.count;
  const cards = [
    {
      key: "activeStudents",
      href: "/academia/alumnos",
      count: dashboard.kpis.activeStudentsMonth,
      title: t("kpis.activeStudents"),
      hint: t("kpis.activeStudentsHint"),
    },
    {
      key: "billed",
      href: "/academia/cobros",
      count: clpFmt.format(dashboard.kpis.billedMonth),
      title: t("kpis.billedMonth"),
      hint: t("kpis.billedMonthHint"),
    },
  ];

  return (
    <section aria-label={t("homeMode.simple")}>
      <ul
        className={`grid grid-cols-2 gap-3 ${
          cards.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4"
        }`}
      >
        {cards.map((c) => (
          <MiniKpi
            key={c.key}
            href={c.href}
            title={c.title}
            count={c.count}
            hint={c.hint}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * KPI accionable de solo conteo: número grande + hint, la card entera
 * navega al módulo donde se resuelve la cola. Compartida por las cards
 * del modo Simplificado y las secciones del Extendido.
 */
function MiniKpi({
  href,
  title,
  count,
  hint,
}: {
  href: string;
  title: string;
  count: number | string;
  hint: string;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-label={`${title}: ${count}`}
        className="block h-full rounded-2xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.98]"
      >
        <Card className="flex h-full flex-col gap-1 p-4 transition-colors hover:border-neon/40">
          <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
            {title}
          </span>
          <span
            className={`text-3xl font-bold leading-none tabular-nums ${
              Number(String(count).replace(/[^0-9]/g, "")) > 0
                ? "text-neon"
                : "text-ink/40"
            }`}
          >
            {count}
          </span>
          <span className="text-xs text-ink/50">{hint}</span>
        </Card>
      </Link>
    </li>
  );
}

/**
 * Clases del día + asistencia marcada (spec §13). Las filas llevan al
 * roster de la clase (marcar presente es del instructor en su
 * consola); sin clases el día se muestra vacío en vez de ocultarse.
 */
function TodayClassesCard({
  dashboard,
  canAttendance,
  t,
}: {
  dashboard: AcademyDashboardData;
  canAttendance: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <section aria-label={t("today.title")} data-tour="academy-today">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className={sectionTitleCls}>{t("today.title")}</h3>
        {canAttendance && dashboard.todayClasses.length > 0 && (
          <p className="text-xs tabular-nums text-ink/50">
            {t("today.attendance", {
              count: dashboard.attendanceToday,
            })}
          </p>
        )}
      </div>
      <Card padded={false}>
        {dashboard.todayClasses.length > 0 ? (
          <ul className={listCls}>
            {dashboard.todayClasses.map((c) => (
              <li key={c.id}>
                <Link href={`/academia/clases/${c.id}`} className={rowLinkCls}>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-neon">
                    {c.startTime}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {c.seriesName ?? t("today.unnamed")}
                    </span>
                    {(() => {
                      const names = (
                        c.instructors?.length
                          ? c.instructors
                          : c.instructorName
                            ? [{ name: c.instructorName }]
                            : []
                      )
                        .map((i) => i.name)
                        .filter(Boolean)
                        .join(" · ");
                      return names ? (
                        <span className="block truncate text-xs text-ink/50">
                          {names}
                        </span>
                      ) : null;
                    })()}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-ink/50">
                    {c.capacity != null
                      ? t("today.bookedOf", {
                          booked: c.bookedCount,
                          capacity: c.capacity,
                        })
                      : t("today.booked", { count: c.bookedCount })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center justify-between gap-3 px-4 py-4">
            <p className="text-sm text-ink/60">{t("today.empty")}</p>
            <Link
              href="/academia/series"
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-neon transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              {t("today.emptyCta")}
            </Link>
          </div>
        )}
      </Card>
    </section>
  );
}

/**
 * Próximos cumpleaños (spec academies/owner-insights): la fila lleva a
 * la ficha del alumno; el gesto es saludar, no cobrar.
 */
function BirthdaysCard({
  birthdays,
  t,
}: {
  birthdays: AcademyDashboardData["upcomingBirthdays"];
  t: ReturnType<typeof useTranslations>;
}) {
  const locale = useLocale();
  return (
    <section
      aria-label={t("insights.birthdaysTitle")}
      data-tour="academy-alerts"
    >
      <h3 className={`mb-3 ${sectionTitleCls}`}>
        {t("insights.birthdaysTitle")}
      </h3>
      <Card padded={false}>
        <ul className={listCls}>
          {birthdays.slice(0, 3).map((b) => (
            <li key={b.personId}>
              <Link
                href={`/academia/alumnos/${b.personId}`}
                className={rowLinkCls}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {b.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-neon">
                  {birthdayFmt(locale).format(new Date(b.date))}
                </span>
              </Link>
            </li>
          ))}
          {birthdays.length > 3 && (
            <li>
              <Link
                href="/academia/alumnos"
                className={`${rowLinkCls} justify-center text-sm font-semibold text-neon`}
              >
                {t("insights.seeAll", { count: birthdays.length })}
              </Link>
            </li>
          )}
        </ul>
      </Card>
    </section>
  );
}

/**
 * Lista de inscripciones por vencer (hoy o esta semana). `extraCount`
 * agrega al footer los ítems de la ventana que caen más allá del
 * alcance de la sección (p.ej. 8-14 días dentro de la semana).
 */
export function ExpiringList({
  title,
  items,
  extraCount = 0,
  rowHref,
  dataTour,
  t,
}: {
  title: string;
  items: AcademyDashboardData["expiringEnrollments"];
  extraCount?: number;
  /** Destino de la fila y del "Ver todos"; sin él van a la ficha del
      alumno. */
  rowHref?: string;
  /** Anchor del tour de onboarding (varias secciones comparten el mismo
      anchor - el runner toma la primera visible). */
  dataTour?: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const locale = useLocale();
  const hidden = Math.max(0, items.length - LIST_CAP) + extraCount;
  return (
    <section aria-label={title} data-tour={dataTour}>
      <h3 className={`mb-3 ${sectionTitleCls}`}>{title}</h3>
      <Card padded={false}>
        <ul className={listCls}>
          {items.slice(0, LIST_CAP).map((e) => (
            <li key={e.personId}>
              {/* Fila: alumno | plan (columna propia en sm+) | fecha.
                  flex-1 en la primera celda: sin ella la columna se
                  colapsaba en mobile (min-w-0 solo habilita el shrink,
                  no reclama espacio - el nombre quedaba truncado a
                  casi nada). items-center centra las celdas. */}
              <Link
                href={rowHref ?? `/academia/alumnos/${e.personId}`}
                className={`${rowLinkCls} sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {e.personName ?? shortId(e.personId)}
                  </span>
                  {/* En móvil el plan va apilado bajo el nombre; en
                      sm+ pasa a su propia columna (ver abajo). */}
                  <span className="block truncate text-xs text-ink/50 sm:hidden">
                    {e.planName ?? t("insights.noPlan")}
                  </span>
                </span>
                <span className="hidden min-w-0 truncate text-sm text-ink/70 sm:block">
                  {e.planName ?? t("insights.noPlan")}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-xs tabular-nums text-warn">
                    {t("insights.expiringUntil", {
                      date: planDateFmt(locale).format(new Date(e.endsAt)),
                    })}
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                </span>
              </Link>
            </li>
          ))}
          {hidden > 0 && (
            <li>
              <Link
                href={rowHref ?? "/academia/alumnos"}
                className={`${rowLinkCls} justify-center text-sm font-semibold text-neon`}
              >
                {t("insights.seeAll", { count: items.length + extraCount })}
              </Link>
            </li>
          )}
        </ul>
      </Card>
    </section>
  );
}

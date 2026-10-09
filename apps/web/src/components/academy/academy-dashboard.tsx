"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui";
import { AcademyKpiCards } from "./academy-kpi-strip";
import {
  birthdayFmt,
  planDateFmt,
  shortId,
  type Academy,
  type AcademyDashboard as AcademyDashboardData,
} from "./shared";

// Tope de filas por lista de insight - más allá, footer "Ver todos".
const LIST_CAP = 6;

const clpFmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const fullDayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const dayFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
});
const lessonWhenFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

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
export function AcademyDashboard({ academy }: { academy: Academy }) {
  const t = useTranslations("academy");

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

  // Split de vencimientos: hoy (endsAt ≤ hoy UTC) / esta semana (≤ +7d).
  // Los de más allá dentro de la ventana se cuentan en "Ver todos".
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekStr = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const expiring = dashboard?.expiringEnrollments ?? [];
  const expiringToday = expiring.filter(
    (e) => e.endsAt.slice(0, 10) <= todayStr,
  );
  const expiringWeek = expiring.filter(
    (e) => e.endsAt.slice(0, 10) > todayStr && e.endsAt.slice(0, 10) <= weekStr,
  );
  const expiringLater = expiring.length - expiringToday.length - expiringWeek.length;

  const pendingClaims = dashboard?.pendingClaims;
  const pendingLessons = dashboard?.pendingLessons;
  const birthdays = dashboard?.upcomingBirthdays ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">{academy.name}</h2>
        <p className="text-xs capitalize text-ink/50">
          {fullDayFmt.format(new Date())}
        </p>
      </header>

      {/* KPIs del mes (spec consola owner): alumnos activos con plan
          vigente, planes comprables, clases/sem, asistencia/clase,
          facturado y ticket/alumno - con delta vs el mismo tramo del
          mes anterior donde hay base. */}
      <AcademyKpiCards
        data={dashboard}
        error={dashError}
        onRetry={() => void refresh()}
        // Sin el split de género: en inicio no es accionable (el
        // detalle demográfico vive en alumnos/analítica).
        keys={[
          "activeStudents",
          "purchasablePlans",
          "weeklyClasses",
          "avgAttendance",
          "billedMonth",
          "avgTicket",
        ]}
      />

      {/* Checklist de activación: solo mientras la academia no tiene
          alumnos (fase de puesta en marcha). Con el primer alumno la
          consola ya tiene contenido propio y la checklist sale. */}
      {dashboard && dashboard.totalStudents === 0 && (
        <Card padded={false} className="p-5">
          <h3 className={sectionTitleCls}>{t("onboarding.title")}</h3>
          <ul className="mt-3 flex flex-col gap-1">
            {(
              [
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
                  key: "student",
                  done: dashboard.totalStudents > 0,
                  href: "/academia/alumnos",
                },
                {
                  key: "team",
                  done: dashboard.teamCount > 0,
                  href: "/academia/equipo",
                },
              ] as const
            ).map((s) => (
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

      {/* Desktop: dos columnas - operación del día a la izquierda,
          retención a la derecha. Mobile apila en ese mismo orden. */}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Hoy - clases del día + asistencia marcada (spec §13). Las
              filas llevan al roster de la clase (marcar presente es del
              instructor en su consola); sin clases el día se muestra
              vacío en vez de ocultarse. */}
          {dashboard && (
            <section aria-label={t("today.title")}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className={sectionTitleCls}>{t("today.title")}</h3>
                {dashboard.todayClasses.length > 0 && (
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
                        <Link
                          href={`/academia/clases/${c.id}`}
                          className={rowLinkCls}
                        >
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-neon">
                            {c.startTime}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {c.seriesName ?? t("today.unnamed")}
                            </span>
                            {c.instructorName && (
                              <span className="block truncate text-xs text-ink/50">
                                {c.instructorName}
                              </span>
                            )}
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
          )}

          {/* Cobros declarados por alumnos pendientes de aprobar -
              la tarea de revisión más urgente del día. */}
          {pendingClaims && pendingClaims.count > 0 && (
            <section aria-label={t("insights.pendingClaimsTitle")}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className={sectionTitleCls}>
                  {t("insights.pendingClaimsTitle")}
                </h3>
                <p className="text-xs tabular-nums text-ink/50">
                  {t("insights.pendingClaimsSummary", {
                    count: pendingClaims.count,
                    amount: clpFmt.format(pendingClaims.amount),
                  })}
                </p>
              </div>
              <Card padded={false}>
                <ul className={listCls}>
                  {pendingClaims.items.map((c) => (
                    <li key={`${c.personId}-${c.createdAt}`}>
                      <Link href="/academia/cobros" className={rowLinkCls}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {c.personName ?? shortId(c.personId)}
                          </span>
                          <span className="block text-xs text-ink/50">
                            {dayFmt.format(new Date(c.createdAt))}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-warn">
                          {clpFmt.format(c.amount)}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {pendingClaims.count > pendingClaims.items.length && (
                    <li>
                      <Link
                        href="/academia/cobros"
                        className={`${rowLinkCls} justify-center text-sm font-semibold text-neon`}
                      >
                        {t("insights.seeAll", { count: pendingClaims.count })}
                      </Link>
                    </li>
                  )}
                </ul>
              </Card>
            </section>
          )}

          {/* Particulares REQUESTED esperando asignación o confirmación -
              segunda cola operativa del home; cada fila navega al módulo
              (no hay ficha por lección - la acción vive en el card). */}
          {pendingLessons && pendingLessons.count > 0 && (
            <section aria-label={t("insights.pendingLessonsTitle")}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className={sectionTitleCls}>
                  {t("insights.pendingLessonsTitle")}
                </h3>
              </div>
              <Card padded={false}>
                <ul className={listCls}>
                  {pendingLessons.items.map((l) => (
                    <li key={l.id}>
                      <Link
                        href="/academia/particulares"
                        className={rowLinkCls}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {l.personName ?? shortId(l.personId)}
                          </span>
                          <span className="block truncate text-xs text-ink/50">
                            {l.instructorName ??
                              t("insights.lessonToAssign")}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 text-xs tabular-nums ${
                            l.scheduledAt ? "text-ink/70" : "text-warn"
                          }`}
                        >
                          {l.scheduledAt
                            ? lessonWhenFmt.format(
                                new Date(l.scheduledAt),
                              )
                            : t("insights.lessonToSchedule")}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {pendingLessons.count > pendingLessons.items.length && (
                    <li>
                      <Link
                        href="/academia/particulares"
                        className={`${rowLinkCls} justify-center text-sm font-semibold text-neon`}
                      >
                        {t("insights.seeAll", {
                          count: pendingLessons.count,
                        })}
                      </Link>
                    </li>
                  )}
                </ul>
              </Card>
            </section>
          )}
        </div>

        {/* Columna de retención: vencimientos y cumpleaños. */}
        <div className="flex min-w-0 flex-col gap-6">
          {dashboard && expiringToday.length > 0 && (
            <ExpiringList
              title={t("insights.expiringTodayTitle")}
              items={expiringToday}
              t={t}
            />
          )}
          {dashboard && (expiringWeek.length > 0 || expiringLater > 0) && (
            <ExpiringList
              title={t("insights.expiringWeekTitle")}
              items={expiringWeek}
              extraCount={expiringLater}
              t={t}
            />
          )}

          {dashboard && birthdays.length > 0 && (
            <section aria-label={t("insights.birthdaysTitle")}>
              <h3 className={`mb-3 ${sectionTitleCls}`}>
                {t("insights.birthdaysTitle")}
              </h3>
              <Card padded={false}>
                <ul className={listCls}>
                  {birthdays.slice(0, LIST_CAP).map((b) => (
                    <li key={b.personId}>
                      <Link
                        href={`/academia/alumnos/${b.personId}`}
                        className={rowLinkCls}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {b.name}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-neon">
                          {birthdayFmt.format(new Date(b.date))}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {birthdays.length > LIST_CAP && (
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
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Lista de inscripciones por vencer (hoy o esta semana). `extraCount`
 * agrega al footer los ítems de la ventana que caen más allá del
 * alcance de la sección (p.ej. 8-14 días dentro de la semana).
 */
function ExpiringList({
  title,
  items,
  extraCount = 0,
  t,
}: {
  title: string;
  items: AcademyDashboardData["expiringEnrollments"];
  extraCount?: number;
  t: ReturnType<typeof useTranslations>;
}) {
  const hidden = Math.max(0, items.length - LIST_CAP) + extraCount;
  return (
    <section aria-label={title}>
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
                href={`/academia/alumnos/${e.personId}`}
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
                <span className="shrink-0 text-xs tabular-nums text-warn">
                  {t("insights.expiringUntil", {
                    date: planDateFmt.format(new Date(e.endsAt)),
                  })}
                </span>
              </Link>
            </li>
          ))}
          {hidden > 0 && (
            <li>
              <Link
                href="/academia/alumnos"
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

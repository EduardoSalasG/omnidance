"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { useActiveRole } from "@/lib/active-role";
import { useViewMode } from "@/lib/view-mode";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ChevronRightIcon } from "@/components/ui/icons";
import { PageLoading } from "@/components/ui/spinner";
import {
  ClassCard,
  type ClassCardData,
} from "@/components/classes/class-card";
import { KpiGrid, type Kpi } from "@/components/home/kpi-grid";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyDashboard } from "@/components/academy/academy-dashboard";

import { GENRE_TEXT, localDayKey } from "@/lib/calendar";
import type { GenreKey } from "@/lib/calendar";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";

type Me = import("@/lib/me-context").MeContextData;

type NextItem = { id: string; name: string; when: string; place: string | null };

/** GET /me/pending-surveys - evento con check-in propio, terminado hace
    <24h y aún sin evaluar. También dispara el fan-out lazy de la
    notificación event.survey en el API. */
type PendingSurvey = { eventId: string; name: string; endsAt: string };

/** GET /me/pending-course-surveys - serie que el alumno cursó el mes
    anterior y aún no evaluó (spec academy-console-v3). */
type PendingCourseSurvey = {
  academyId: string;
  academyName: string;
  seriesId: string;
  seriesName: string;
  month: string;
};

// Evento de la escena nocturna - lo que decide "¿salgo hoy?":
// género, precio, amigos que van, preventas restantes.
type TonightEvent = {
  id: string;
  name: string;
  startsAt: string;
  live: boolean;
  venueId: string | null;
  venueName: string | null;
  genres: string[];
  presalePrice: number | null;
  doorPrice: number | null;
  hasTicket: boolean;
  friendsGoing: number;
  presaleLeft: number | null;
};

type HomeStats = {
  kpis: Kpi[];
  scene?: {
    events: TonightEvent[];
    upcoming: TonightEvent[];
    mine: TonightEvent[];
  } | null;
  nextClass?: ClassCardData | null;
  nextGig?: NextItem | null;
  nextShift?: NextItem | null;
  myClasses?: ClassCardData[];
  needsAcademy?: boolean;
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const timeFmt = new Intl.DateTimeFormat("es-CL", {
  hour: "numeric",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const fullDayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
// Class.date llega como ISO a medianoche UTC - el día calendario se
// formatea en UTC (mismo criterio que /clases, no el dayFmt local).
const classUtcDayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const genreLabel = (g: string, otherLabel: string) =>
  g === "OTHER" ? otherLabel : g.charAt(0) + g.slice(1).toLowerCase();

/**
 * La escena de esta noche para el bailarín: el evento principal (donde
 * tiene entrada, o el primero de la noche) con lo que decide - género,
 * precio honesto, amigos que van, preventas restantes - y debajo el
 * resto de la noche en filas compactas. El hero deja de ser "una card
 * de texto" y pasa a responder "¿salgo hoy?".
 */
function TonightScene({ stats }: { stats: HomeStats | null }) {
  const t = useTranslations("home");
  const tq = useTranslations("qr");
  const tonightEvents = stats?.scene?.events ?? [];
  const upcoming = stats?.scene?.upcoming ?? [];
  // La noche primero; si está vacía, el próximo evento es la invitación.
  const isTonight = tonightEvents.length > 0;
  const heroEvent = tonightEvents[0] ?? upcoming[0] ?? null;
  const more = isTonight ? tonightEvents.slice(1) : upcoming.slice(1);
  // Entradas propias fuera de la escena del hero - la franja "Tus
  // entradas" confirma lo comprado sin competir con la decisión de hoy.
  const myEntries = (stats?.scene?.mine ?? []).filter(
    (e) => e.id !== heroEvent?.id,
  );

  if (!heroEvent) {
    return (
      <section aria-label={t("tonight")}>
        <Link
          href="/eventos"
          className="flex min-h-11 flex-col gap-1.5 rounded-2xl border border-neon/40 bg-elevated/70 p-5 transition-colors transition-transform hover:border-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
        >
          <span className="text-xl font-bold leading-tight">
            {t("noEventTonight")}
          </span>
          <span className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-neon">
            {t("seeEvents")}
            <ChevronRightIcon />
          </span>
        </Link>
        <Button href="/qr" variant="secondary" className="mt-3 w-full">
          {tq("title")}
        </Button>
      </section>
    );
  }

  const start = new Date(heroEvent.startsAt);
  const buyable =
    !heroEvent.hasTicket &&
    (heroEvent.presalePrice != null || heroEvent.doorPrice != null);

  return (
    <section aria-label={heroEvent.name} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5 rounded-2xl border border-neon/40 bg-elevated/70 p-5">
        <Link
          href={`/eventos/${heroEvent.id}`}
          className="flex flex-col gap-2.5 rounded-lg transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
        >
          {/* Estado temporal como badge junto al título - sin kicker:
              el heading habla solo. */}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-xl font-bold leading-tight">
              {heroEvent.name}
            </span>
            {isTonight ? (
              heroEvent.live ? (
                <Badge variant="live">{t("live")}</Badge>
              ) : (
                <Badge variant="neon">{t("tonight")}</Badge>
              )
            ) : (
              <Badge variant="outline" className="normal-case tracking-normal">
                {dayFmt.format(start)}
              </Badge>
            )}
          </span>
          <span className="text-sm text-ink/60">
            {timeFmt.format(start)}
            {heroEvent.venueName ? ` · ${heroEvent.venueName}` : ""}
          </span>
          {heroEvent.genres.length > 0 && (
            <span className="flex flex-wrap gap-x-2 text-xs font-medium">
              {heroEvent.genres.map((g) => (
                <span
                  key={g}
                  className={GENRE_TEXT[g as GenreKey] ?? "text-ink/50"}
                >
                  {genreLabel(g, t("genre.other"))}
                </span>
              ))}
            </span>
          )}
        </Link>

        {heroEvent.hasTicket ? (
          <p className="text-sm font-medium text-neon">
            {t("hasTicketTonight")}
          </p>
        ) : (
          buyable && (
            <p className="text-sm">
              {heroEvent.presalePrice != null && (
                <>
                  <span className="text-ink/50">{t("presaleLabel")} </span>
                  <span className="font-semibold text-neon">
                    {clp.format(heroEvent.presalePrice)}
                  </span>
                </>
              )}
              {heroEvent.presalePrice != null &&
                heroEvent.doorPrice != null && (
                  <span className="text-ink/30"> · </span>
                )}
              {heroEvent.doorPrice != null && (
                <span className="text-ink/50">
                  {t("doorLabel")} {clp.format(heroEvent.doorPrice)}
                </span>
              )}
            </p>
          )
        )}

        {heroEvent.friendsGoing > 0 && (
          <p className="text-sm text-ink/70">
            {t("friendsGoing", { count: heroEvent.friendsGoing })}
          </p>
        )}

        {heroEvent.presaleLeft != null &&
          heroEvent.presaleLeft <= 15 &&
          !heroEvent.hasTicket && (
            <p className="text-xs font-semibold text-warn">
              {t("presaleLeft", { count: heroEvent.presaleLeft })}
            </p>
          )}

        <Link
          href={
            heroEvent.hasTicket ? "/qr" : `/eventos/${heroEvent.id}`
          }
          className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          {heroEvent.hasTicket ? t("myQr") : t("buyPresale")}
          <ChevronRightIcon />
        </Link>
      </div>

      {myEntries.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
            {t("myEntries")}
          </h3>
          <ul className="flex flex-col gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {myEntries.map((e) => (
              <li key={e.id}>
                <Link
                  href="/qr"
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-neon/30 bg-elevated/50 px-4 py-3 transition-colors hover:border-neon/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {e.name}
                    </span>
                    <span className="block truncate text-xs text-ink/50">
                      {dayFmt.format(new Date(e.startsAt))}
                      {e.venueName ? ` · ${e.venueName}` : ""}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-neon">
                    {t("myQr")}
                    <ChevronRightIcon className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {more.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
            {isTonight ? t("moreTonight") : t("upcoming")}
          </h3>
          <ul className="flex flex-col gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {more.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/eventos/${e.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-neon/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {e.name}
                    </span>
                    <span className="block truncate text-xs text-ink/50">
                      {isTonight
                        ? timeFmt.format(new Date(e.startsAt))
                        : dayFmt.format(new Date(e.startsAt))}
                      {e.venueName ? ` · ${e.venueName}` : ""}
                      {e.friendsGoing > 0
                        ? ` · ${t("friendsGoing", { count: e.friendsGoing })}`
                        : ""}
                    </span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

type Hero = {
  href: string;
  title: string;
  desc: string;
  cta: string;
  secondary?: { href: string; label: string };
};

export function HomeHub() {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const te = useTranslations("events");
  const tst = useTranslations("staff");
  const ta = useTranslations("academy");
  const tpr = useTranslations("producer");
  const tad = useTranslations("admin");
  const tt = useTranslations("tours.home");
  const tta = useTranslations("tours.academia");
  const ts = useTranslations("survey");
  const tcs = useTranslations("courseSurvey");

  // /me compartido (MeProvider del layout) - el hub ya no fetchea la
  // sesión: las encuestas y los stats se disparan en paralelo con /me
  // (especulativo - sin sesión las respuestas 401 se descartan) en vez
  // de esperarla: dos waterfalls menos en la página de aterrizaje.
  const {
    me,
    loading: meLoading,
    error: meFetchFailed,
    refresh: refreshMe,
  } = useMe();
  const checked = !meLoading;
  // Causa del fallo de /me: "session" (sin usuario → copy de reingreso)
  // vs "server" (5xx/red → error genérico + reintento). Antes cualquier
  // fallo caía en "Tu sesión expiró" - copy deshonesto en un 500.
  const meError: "session" | "server" | null = meLoading
    ? null
    : meFetchFailed
      ? "server"
      : !me
        ? "session"
        : null;
  // Sesión resuelta sin usuario - los fetches especulativos se detienen.
  const noSession = !meLoading && !meFetchFailed && !me;
  // Encuestas post-social pendientes - global por persona (cualquier
  // lente evalúa); null hasta que el fetch resuelve → la card no
  // reserva espacio ni flashea vacía.
  const [surveys, setSurveys] = useState<PendingSurvey[] | null>(null);
  const [courseSurveys, setCourseSurveys] = useState<
    PendingCourseSurvey[] | null
  >(null);
  // Stats versionados por lente: {key: "ROLE:mode"} - al cambiar de
  // lente el slot viejo no se muestra nunca (cero flash de KPIs/hero
  // ajenos); mientras resuelve el fetch de la lente actual → spinner.
  const [statsSlot, setStatsSlot] = useState<{
    key: string;
    data: HomeStats | null;
    error?: boolean;
  } | null>(null);
  // Contador de reintento: el efecto de stats lo escucha para refetchear.
  const [statsRetry, setStatsRetry] = useState(0);
  const activeRole = useActiveRole(me?.roles);
  const viewMode = useViewMode();
  const dancerAcademy = activeRole === "DANCER" && viewMode === "academy";
  const lensKey = `${activeRole}:${viewMode}`;

  // Encuestas pendientes: una vez por sesión (no por lente - el
  // endpoint es global). Falla en silencio: la card simplemente no
  // aparece, nunca bloquea el hub. Disparo especulativo en paralelo con
  // /me - el ref evita re-fetch cuando la sesión resuelve después.
  const surveysFetched = useRef(false);
  useEffect(() => {
    if (noSession || surveysFetched.current) return;
    surveysFetched.current = true;
    let cancelled = false;
    apiFetch("/me/pending-surveys")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        setSurveys((await res.json()) as PendingSurvey[]);
      })
      .catch(() => {});
    // Encuestas mensuales de curso - mismo pull one-shot; el push corre
    // en el job academies.course_surveys (día 1 de cada mes).
    apiFetch("/me/pending-course-surveys")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        setCourseSurveys((await res.json()) as PendingCourseSurvey[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [noSession]);

  // KPIs del home: un solo request agregado por lente (+ modo consumer).
  // Disparo especulativo en paralelo con /me usando la lente guardada;
  // el slot con key evita re-fetch cuando la sesión resuelve después.
  useEffect(() => {
    if (noSession) return;
    const key = `${activeRole}:${viewMode}`;
    if (statsSlot?.key === key) return;
    let cancelled = false;
    apiFetch(`/home/stats?role=${activeRole}&mode=${viewMode}`)
      .then(async (res) => {
        if (cancelled) return;
        // Error de red/500 → data null + flag: el home muestra aviso con
        // reintento en vez de disfrazar el fallo de "sin datos".
        setStatsSlot({
          key,
          data: res.ok ? ((await res.json()) as HomeStats) : null,
          error: !res.ok,
        });
      })
      .catch(() => {
        if (!cancelled) setStatsSlot({ key, data: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [noSession, activeRole, viewMode, statsRetry, statsSlot]);

  // null hasta que el fetch de ESTA lente resuelva - los heroes que
  // dependen de stats nunca ven datos ajenos. El efecto fetchea
  // /home/stats para TODA lente → el gate aplica a todas (sin la
  // lista parcial, KpiGrid aparecía tarde en producer/academy/admin).
  const stats = statsSlot?.key === lensKey ? statsSlot.data : null;
  const statsPending = me !== null && statsSlot?.key !== lensKey;

  if (!checked) {
    // Boot de sesión - PageLoading (beacon compartido, aparición
    // diferida), nunca un spinner desnudo a nivel página.
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col p-6">
        <PageLoading />
      </main>
    );
  }

  // Cookie presente pero sesión expirada - contexto + CTA de re-login
  // (sin appbar en este estado: el h1 vive acá, no en el chrome). Si el
  // fallo fue de servidor/red el copy es honesto y ofrece reintentar.
  if (!me) {
    if (meError === "server") {
      return (
        <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 p-6">
          <Card className="flex flex-col items-center gap-3 py-6 text-center">
            <h1 className="text-xl font-bold">{t("serverError")}</h1>
            <p role="alert" className="text-sm text-ink/60">
              {t("serverErrorDesc")}
            </p>
            <Button
              size="lg"
              className="w-full"
              onClick={() => void refreshMe()}
            >
              {t("retry")}
            </Button>
          </Card>
        </main>
      );
    }
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 p-6">
        <Card className="flex flex-col items-center gap-3 py-6 text-center">
          <h1 className="text-xl font-bold">{t("sessionExpired")}</h1>
          <p className="text-sm text-ink/60">
            {t("sessionExpiredDesc")}
          </p>
          <Button href="/login" size="lg" className="w-full">
            {tc("login")}
          </Button>
        </Card>
      </main>
    );
  }

  // Hero = acción principal para lentes de gestión y la CTA del
  // bailarín-academia hacia /clases. El bailarín-social no pasa por
  // acá: su superficie es TonightScene (la escena completa de la noche).
  const hero: Hero | null = (() => {
    if (dancerAcademy) {
      if (stats?.needsAcademy || stats?.kpis.length === 0) {
        return {
          href: "/academias",
          title: t("modeAcademy"),
          desc: t("academyEmpty"),
          cta: t("findAcademy"),
        };
      }
      // Learner inscrito: sin hero - su superficie es "Tus próximas
      // clases" + el tab Clases del nav; el card promo era ruido.
      return null;
    }
    if (activeRole === "DANCER") {
      // Lente social: no se renderiza (TonightScene la reemplaza).
      return {
        href: "/eventos",
        title: te("title"),
        desc: t("dancerHeroDesc"),
        cta: t("seeEvents"),
      };
    }
    switch (activeRole) {
      case "ADMIN":
        return {
          href: "/admin",
          title: tad("title"),
          desc: t("adminHeroDesc"),
          cta: t("adminHeroCta"),
        };
      case "PRODUCER":
        return {
          href: "/productor/eventos",
          title: tpr("myEvents"),
          desc: tpr("navEventsDesc"),
          cta: t("producerHeroCta"),
          secondary: {
            href: "/productor/eventos/nuevo",
            label: tpr("createEvent"),
          },
        };
      // ACADEMY_OWNER no tiene hero: su home ES la consola (ver el
      // branch del render abajo).
      case "INSTRUCTOR":
        return {
          href: "/academia",
          title: ta("title"),
          desc: t("academyHeroDesc"),
          cta: t("academyHeroCta"),
        };
      case "STAFF": {
        const shift = stats?.nextShift;
        return {
          href: shift ? `/staff/${shift.id}` : "/staff",
          title: shift ? shift.name : tst("title"),
          desc: shift
            ? `${t("nextShift")} - ${dayFmt.format(new Date(shift.when))}${shift.place ? ` · ${shift.place}` : ""}`
            : t("staffHeroDesc"),
          cta: t("staffHeroCta"),
        };
      }
      default: {
        // DJ | VENUE_MANAGER
        const gig = stats?.nextGig;
        return gig
          ? {
              href: `/eventos/${gig.id}`,
              title: gig.name,
              desc: `${t("nextGig")} - ${dayFmt.format(new Date(gig.when))}${gig.place ? ` · ${gig.place}` : ""}`,
              cta: t("viewEvent"),
            }
          : {
              href: "/eventos",
              title: te("title"),
              desc: t("dancerHeroDesc"),
              cta: t("seeEvents"),
            };
      }
    }
  })();

  const kpiLabel = activeRole === "DANCER" ? t("insights") : t("overview");

  // Mientras los stats de la lente no resuelven, el hub entero espera:
  // pintar "Hola" primero y el resto después produce carga a pedazos -
  // la regla es UI final o spinner, nunca progresiva.
  if (statsPending) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col p-6">
        <PageLoading />
      </main>
    );
  }

  const statsError = statsSlot?.key === lensKey && statsSlot.error;
  const dancerSocial = activeRole === "DANCER" && !dancerAcademy;
  // Home social: 2 insights máximo - los que leen actividad (racha,
  // bailes 7d) y con valor > 0. El resto se muestra en /perfil.
  const socialKpis = (stats?.kpis ?? []).filter(
    (k) => (k.key === "streak" || k.key === "dances7d") && k.value > 0,
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 p-6 lg:max-w-5xl lg:px-8">
      <header className="flex flex-col gap-1 pt-4">
        {/* h1: es el título de la página - antes era h2 y el home del
            owner quedaba sin nivel 1 (academia h2 → secciones h3). */}
        <h1 className="text-lg font-medium">
          {t("hi", { name: me.name.split(" ")[0] })}
        </h1>
        {/* La fecha da contexto al vistazo diario - para el owner la
            muestra el header de la consola junto al nombre de la
            academia (evita duplicarla). */}
        {dancerSocial && (
          <p className="text-xs capitalize text-ink/50">
            {fullDayFmt.format(new Date())}
          </p>
        )}
      </header>

      {/* Fallo de stats ≠ "sin datos": aviso honesto con reintento. */}
      {statsError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn"
        >
          {t("statsError")}
          <button
            type="button"
            onClick={() => {
              setStatsSlot(null);
              setStatsRetry((r) => r + 1);
            }}
            className="min-h-11 shrink-0 rounded-full border border-warn/40 px-4 font-semibold transition-colors hover:bg-warn/10"
          >
            {t("retry")}
          </button>
        </div>
      )}

      {/* Encuestas post-social - timely, arriba del contenido de lente.
          Cualquier rol las ve (un productor que bailó también evalúa);
          sin items no se renderiza nada (cero hueco). */}
      {((surveys !== null && surveys.length > 0) ||
        (courseSurveys !== null && courseSurveys.length > 0)) && (
        <section
          aria-label={ts("sectionLabel")}
          className="flex flex-col gap-2"
        >
          {surveys?.map((s) => (
            <Link
              key={s.eventId}
              href={`/eventos/${s.eventId}/evaluar`}
              className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-neon/40 bg-elevated/70 px-5 py-4 transition-colors transition-transform hover:border-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
            >
              <span className="min-w-0 truncate text-base font-semibold">
                {ts("prompt", { name: s.name })}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-neon">
                {ts("cardCta")}
                <ChevronRightIcon />
              </span>
            </Link>
          ))}
          {courseSurveys?.map((s) => (
            <Link
              key={`${s.seriesId}:${s.month}`}
              href={`/academias/${s.academyId}/encuesta?seriesId=${s.seriesId}&month=${s.month}&series=${encodeURIComponent(s.seriesName)}`}
              className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-neon/40 bg-elevated/70 px-5 py-4 transition-colors transition-transform hover:border-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
            >
              <span className="min-w-0 truncate text-base font-semibold">
                {tcs("prompt", { name: s.seriesName })}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-neon">
                {tcs("cardCta")}
                <ChevronRightIcon />
              </span>
            </Link>
          ))}
        </section>
      )}

      {activeRole === "ACADEMY_OWNER" ? (
        // El home del dueño de academia ES su consola: selector de
        // academia (o alta si no tiene) + dashboard con KPIs, clases de
        // hoy e insights. /academia redirige acá para el owner - la
        // página aparte no tenía sentido.
        <AcademyGate>
          {({ academy }) => (
            <AcademyDashboard key={academy.id} academy={academy} />
          )}
        </AcademyGate>
      ) : dancerSocial ? (
        <>
          {/* Tu actividad primero - solo 2 señales rápidas (racha +
              bailes recientes, las que leen "actividad"); la grilla
              completa de la lente vive en /perfil. KPIs en cero se
              ocultan: un valle emocional, no una invitación. */}
          {stats && socialKpis.length > 0 && (
            <KpiGrid kpis={socialKpis} label={kpiLabel} />
          )}
          <TonightScene stats={stats} />
        </>
      ) : (
        <>
          {stats && stats.kpis.length > 0 && (
            <KpiGrid kpis={stats.kpis} label={kpiLabel} />
          )}

          {hero && (
            <section aria-label={hero.title}>
              <Link
                href={hero.href}
                className="flex min-h-11 flex-col gap-1.5 rounded-2xl border border-neon/40 bg-elevated/70 p-5 transition-colors transition-transform hover:border-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
              >
                <span className="text-xl font-bold leading-tight">
                  {hero.title}
                </span>
                <span className="text-sm text-ink/60">{hero.desc}</span>
                <span className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-neon">
                  {hero.cta}
                  <ChevronRightIcon />
                </span>
              </Link>
              {hero.secondary && (
                <Button
                  href={hero.secondary.href}
                  variant="secondary"
                  className="mt-3 w-full"
                >
                  {hero.secondary.label}
                </Button>
              )}
            </section>
          )}

          {/* Tus próximas clases - reservas del learner (BOOKED/
              WAITLIST), máx 3, mismo ClassCard de /clases: el badge
              Reservado/En espera va arriba a la derecha. */}
          {dancerAcademy && (stats?.myClasses?.length ?? 0) > 0 && (
            <section aria-label={t("myClassesTitle")}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/50">
                {t("myClassesTitle")}
              </h2>
              <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
                {stats!.myClasses!.map((c) => (
                  <li key={c.id}>
                    <ClassCard
                      cls={c}
                      when={`${
                        c.date.slice(0, 10) === localDayKey(new Date())
                          ? te("today")
                          : classUtcDayFmt.format(new Date(c.date))
                      } · ${c.startTime}–${c.endTime}`}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Tour del owner: su consola ES el inicio - sin s1 (el tab
          "Academia" ya no existe; el dashboard es esta pantalla). */}
      {activeRole === "ACADEMY_OWNER" && (
        <OnboardingRunner
          tour="academia"
          steps={[
            {
              element: "[data-tour='academy-kpi-avgAttendance']",
              title: tta("s2.title"),
              description: tta("s2.desc"),
              side: "top",
            },
            {
              element: "[data-tour='appbar-menu']",
              title: tta("s3.title"),
              description: tta("s3.desc"),
              side: "bottom",
            },
          ] satisfies TourStep[]}
        />
      )}

      {/* Tour de primera visita - lente social del bailarín (los tabs
          referenciados son los de esa lente). */}
      {activeRole === "DANCER" && !dancerAcademy && (
        <OnboardingRunner
          tour="home"
          steps={[
            {
              element: "[data-tour='home-stats']",
              title: tt("s1.title"),
              description: tt("s1.desc"),
            },
            {
              element: "[data-tour='appbar-mode']",
              title: tt("s2.title"),
              description: tt("s2.desc"),
              side: "bottom",
            },
            {
              element: "[data-tour='appbar-bell']",
              title: tt("s3.title"),
              description: tt("s3.desc"),
              side: "bottom",
            },
            {
              element: "[data-tour='nav-events']",
              title: tt("s4.title"),
              description: tt("s4.desc"),
              side: "top",
            },
            {
              element: "[data-tour='nav-more']",
              title: tt("s5.title"),
              description: tt("s5.desc"),
              side: "top",
            },
            {
              element: "[data-tour='nav-friends']",
              title: tt("s6.title"),
              description: tt("s6.desc"),
              side: "top",
            },
            {
              element: "[data-tour='nav-profile']",
              title: tt("s7.title"),
              description: tt("s7.desc"),
              side: "top",
            },
          ] satisfies TourStep[]}
        />
      )}

      {/* Tour de la lente Academia del bailarín - Mi Aprendizaje:
          tabs Clases / + (QR) / Academias / Perfil. */}
      {activeRole === "DANCER" && dancerAcademy && (
        <OnboardingRunner
          tour="home-academy"
          steps={[
            {
              element: "[data-tour='home-stats']",
              title: tt("academy.s1.title"),
              description: tt("academy.s1.desc"),
            },
            {
              element: "[data-tour='appbar-mode']",
              title: tt("academy.s2.title"),
              description: tt("academy.s2.desc"),
              side: "bottom",
            },
            {
              element: "[data-tour='appbar-bell']",
              title: tt("academy.s3.title"),
              description: tt("academy.s3.desc"),
              side: "bottom",
            },
            {
              element: "[data-tour='nav-classes']",
              title: tt("academy.s4.title"),
              description: tt("academy.s4.desc"),
              side: "top",
            },
            {
              element: "[data-tour='nav-more']",
              title: tt("academy.s5.title"),
              description: tt("academy.s5.desc"),
              side: "top",
            },
            {
              element: "[data-tour='nav-academies']",
              title: tt("academy.s6.title"),
              description: tt("academy.s6.desc"),
              side: "top",
            },
            {
              element: "[data-tour='nav-profile']",
              title: tt("academy.s7.title"),
              description: tt("academy.s7.desc"),
              side: "top",
            },
          ] satisfies TourStep[]}
        />
      )}
    </main>
  );
}

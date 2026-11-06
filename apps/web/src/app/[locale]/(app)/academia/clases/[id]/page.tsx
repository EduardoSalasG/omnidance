"use client";

import { Suspense, useCallback, useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";

import { useLocale, useTranslations } from "next-intl";
import { apiFetch, isTierRequired } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  Pager,
  RefreshIcon,
  Spinner,
} from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { TierPaywall } from "@/components/tier-paywall";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  showActionNotice,
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";
import { QuorumBar } from "@/components/academy/quorum-bar";
import { MetricsGrid } from "@/components/academy/academy-levels-card";
import {
  classDayFmt,
  readError,
  shortId,
  type AcademyLevelInsights,
  type ClassRoster,
} from "@/components/academy/shared";
import { Link } from "@/i18n/navigation";
import { safeInternalPath } from "@/lib/safe-next";
import { getDateFmt, useNumFmt } from "@/lib/intl";
import { useConsolePageSize } from "@/lib/console-page-size";

type LoadState =
  | "loading"
  | "ready"
  | "unauth"
  | "forbidden"
  | "tier"
  | "notfound"
  | "error";

/**
 * /academia/clases/[id] - roster de una clase (GET /classes/:id/roster):
 * detalle (serie, estilo/nivel, fecha/hora, profesor), quórum destacado
 * booked/quorum, reservados y lista de espera. Vista por clase - el server
 * decide el acceso (instructor de la clase u owner/admin): 401/403/404
 * tienen estado propio.
 */
export default function AcademiaClaseRosterPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = use(props.params);
  const classId = params.id;
  const t = useTranslations("instructor");
  const ts = useTranslations("academySeries");
  const tc = useTranslations("common");

  const [roster, setRoster] = useState<ClassRoster | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  // Aviso post-acción a nivel página: RosterDetail se desmonta durante
  // la recarga post-cancelación (state loading → ready), el aviso debe
  // vivir acá para sobrevivir ese ciclo.
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/classes/${classId}/roster`);
      if (res.status === 401) {
        setState("unauth");
        return;
      }
      if (res.status === 403 && (await isTierRequired(res))) {
        setState("tier");
        return;
      }
      if (res.status === 403) {
        setState("forbidden");
        return;
      }
      if (res.status === 404) {
        setState("notfound");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setRoster((await res.json()) as ClassRoster);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Marcaje in-place: el alumno queda "Presente" sin refetch - un load()
  // completo volvería toda la página a SkeletonList (regla ~5s en pista).
  const markAttended = useCallback((personId: string) => {
    setRoster((r) =>
      r
        ? {
            ...r,
            booked: r.booked.map((b) =>
              b.personId === personId ? { ...b, attended: true } : b,
            ),
          }
        : r,
    );
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      {state === "loading" && <SkeletonList />}
      {state === "unauth" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-ink/70">{t("loginRequired")}</p>
          <Button href="/login">{tc("login")}</Button>
        </div>
      )}
      {/* 403 tier.required del roster (feature attendance): paywall
          con CTA a suscripción, mismo patrón que analytics-section -
          no el "forbidden" genérico de acceso. */}
      {state === "tier" && (
        <TierPaywall actorType="ACADEMY" feature="attendance" />
      )}
      {(state === "forbidden" || state === "notfound") && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-ink/60">
            {state === "forbidden" ? t("forbidden") : t("notFound")}
          </p>
          <Button variant="secondary" size="sm" href="/academia/clases">
            {tc("back")}
          </Button>
        </div>
      )}
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {state === "ready" && roster && (
        <>
          {/* Back de consola (regla 5): el padre canónico del roster
              es la ficha de la serie (de ahí salen sus clases en
              próximas/historial) - la edición del horario es una
              superficie a la que se entra explícito, no un destino de
              "volver". El instructor vuelve a su listado de clases.
              `?from=` (ficha del profesor, etc.) manda sobre el
              canónico; el boundary Suspense lo exige useSearchParams. */}
          <Suspense fallback={null}>
            <RosterBack roster={roster} />
          </Suspense>
          <RosterDetail
            roster={roster}
            classId={classId}
            onChanged={markAttended}
            onCancelled={() => {
              setNotice({ text: ts("classCancelled") });
              void load();
            }}
            onCancelError={(msg) =>
              setNotice({ text: msg, error: true })
            }
          />
          {/* Tour de primera visita del roster - los anchors montan
              con el detalle (state ready). */}
          <ClaseTour />
        </>
      )}

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </main>
  );
}

// Back contextual: `?from=` válido (clase abierta desde la ficha del
// profesor u otra ficha) manda sobre el padre canónico; sin él el back
// va a la serie (owner) o al listado de clases (instructor).
function RosterBack({ roster }: { roster: ClassRoster }) {
  const t = useTranslations("instructor");
  const ts = useTranslations("academySeries");
  const tc = useTranslations("common");
  const backFrom = safeInternalPath(useSearchParams().get("from"));
  const canonicalHref = roster.canCancel
    ? roster.class.seriesId
      ? `/academia/series/${roster.class.seriesId}`
      : // Clase sin serie (taller suelto): /clases es la vista del
        // instructor y rebota al owner a /inicio - el padre navegable
        // es el listado de series.
        "/academia/series"
    : "/academia/clases";
  return (
    <ConsoleHeader
      backHref={backFrom ?? canonicalHref}
      backLabel={
        backFrom
          ? tc("back")
          : roster.canCancel
            ? (roster.class.seriesName ?? ts("title"))
            : t("title")
      }
    />
  );
}

function ClaseTour() {
  const tt = useTranslations("tours.academia-clase");
  return (
    <OnboardingRunner
      tour="academia-clase"
      steps={
        [
          {
            element: "[data-tour='academy-clase-meta']",
            title: tt("s1.title"),
            description: tt("s1.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-clase-quorum']",
            title: tt("s2.title"),
            description: tt("s2.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-clase-booked']",
            title: tt("s3.title"),
            description: tt("s3.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-clase-waitlist']",
            title: tt("s4.title"),
            description: tt("s4.desc"),
            side: "top",
          },
        ] satisfies TourStep[]
      }
    />
  );
}

function RosterDetail({
  roster,
  classId,
  onChanged,
  onCancelled,
  onCancelError,
}: {
  roster: ClassRoster;
  classId: string;
  onChanged: (personId: string) => void;
  onCancelled: () => void;
  onCancelError: (msg: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("instructor");
  const ts = useTranslations("academySeries");
  const tc = useTranslations("common");
  const c = roster.class;
  const booked = roster.booked.length;
  // Ventana de marcaje: solo dentro de [start-30min, start+30min]
  // (spec academies/class-series). Fuera de ella el server rechaza el
  // POST - acá el control se oculta y se muestra la pista de horario.
  const now = Date.now();
  const windowOpen =
    now >= Date.parse(roster.attendanceWindow.opensAt) &&
    now <= Date.parse(roster.attendanceWindow.closesAt);
  const showMarking = roster.canMark && windowOpen;
  // Clase culminada: la instancia ya terminó (fin < ahora, misma
  // aritmética medianoche-UTC + HH:MM del API). Una clase pasada no
  // se edita ni se cancela: el header queda plano (sin affordance a
  // la ficha del horario) y la zona roja se oculta - el server ya
  // rechaza el cancel de clase pasada con 404.
  const [endH, endM] = c.endTime.split(":").map(Number);
  const ended =
    Date.parse(c.date) + endH * 3_600_000 + endM * 60_000 <= now;
  // Paginación de listas pesadas (regla 20 desktop / 10 mobile,
  // lib/console-page-size): booked y waitlist son listas client-side
  // del payload del roster - slice local + Pager solo cuando exceden.
  const pageSize = useConsolePageSize();
  const [bookedPage, setBookedPage] = useState(1);
  const [waitlistPage, setWaitlistPage] = useState(1);
  useEffect(() => {
    setBookedPage(1);
    setWaitlistPage(1);
  }, [pageSize]);
  const bookedItems = roster.booked.slice(
    (bookedPage - 1) * pageSize,
    bookedPage * pageSize,
  );
  const waitlistItems = roster.waitlist.slice(
    (waitlistPage - 1) * pageSize,
    waitlistPage * pageSize,
  );
  // POST /classes/:id/attendance - solo si el caller es el instructor
  // efectivo (canMark del server); el owner no marca asistencia.
  const [markingId, setMarkingId] = useState<string | null>(null);
  // Cancelación por instancia (spec workshop-one-off-class): zona roja
  // solo con cap schedule/classes (canCancel del server).
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  // Plantel completo (multi-instructor): "María · Eduardo".
  const names = (
    c.instructors?.length ? c.instructors : c.instructor ? [c.instructor] : []
  )
    .map((i) => i.name ?? shortId(i.id))
    .join(" · ");

  // Header de entidad desnudo (console-patterns §3): la clase se
  // identifica por su serie + fecha/hora; las cajas quedan para las
  // secciones. Es texto plano: la edición del horario se entra solo
  // desde la ficha de la serie, no desde el roster (review 2026-11-05).
  const entityHeader = (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-3">
        <h2 className="truncate text-lg font-semibold">
          {c.seriesName ?? t("classFallback")}
        </h2>
        {c.cancelled && <Badge variant="muted">{ts("cancelled")}</Badge>}
      </div>
      <p className="text-sm text-ink/70">
        <span className="capitalize">
          {classDayFmt(locale).format(new Date(c.date))}
        </span>
        {" · "}
        <span className="tabular-nums">
          {c.startTime}–{c.endTime}
        </span>
      </p>
      {(c.styleName || c.levelName) && (
        <div className="flex flex-wrap gap-1.5">
          {c.styleName && <Badge variant="neon">{c.styleName}</Badge>}
          {c.levelName && <Badge variant="muted">{c.levelName}</Badge>}
        </div>
      )}
      {names && (
        <p className="text-xs text-ink/60">
          {t("taughtBy")}: {names}
        </p>
      )}
    </div>
  );

  async function cancelClass(): Promise<void> {
    if (cancelBusy) return;
    setCancelBusy(true);
    try {
      const res = await apiFetch(
        `/academies/${c.academyId}/classes/${classId}/cancel`,
        { method: "POST" },
      );
      if (!res.ok) {
        // Cierra el sheet para que el aviso de error quede visible.
        setConfirmCancel(false);
        onCancelError((await readError(res)) ?? tc("error"));
        return;
      }
      setConfirmCancel(false);
      onCancelled();
    } catch {
      setConfirmCancel(false);
      onCancelError(tc("error"));
    } finally {
      setCancelBusy(false);
    }
  }

  async function markPresent(personId: string): Promise<void> {
    setMarkingId(personId);
    try {
      const res = await apiFetch(`/classes/${classId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId }),
      });
      if (!res.ok) {
        showActionNotice({ text: tc("error"), error: true });
        return;
      }
      onChanged(personId);
      showActionNotice({ text: t("marked") });
    } catch {
      showActionNotice({ text: tc("error"), error: true });
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Entidad desnuda y plana: la ficha del horario se abre solo
          desde la serie; el roster no es puerta a la edición. */}
      <div data-tour="academy-clase-meta">{entityHeader}</div>

      {/* Quórum destacado */}
      <Card
        className="flex flex-col gap-2 p-4 lg:max-w-sm"
        data-tour="academy-clase-quorum"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
          {t("quorum")}
        </p>
        <p className="text-3xl font-bold leading-none tabular-nums">
          <span className="text-neon">{booked}</span>
          <span className="text-ink/50">/{roster.quorum}</span>
        </p>
        <QuorumBar booked={booked} quorum={roster.quorum} />
      </Card>

      {/* Métricas del horario: mismas mini-stats ÚLT./PROM./PRÓX. de
          la agenda "Niveles y cupos" del inicio (solo quien tiene
          acceso a insights las ve; el resto ni siquiera ve la sección). */}
      <SlotCupos academyId={c.academyId} slotId={c.classSlotId} />

      {/* Reservados */}
      <section
        aria-label={t("booked")}
        className="flex flex-col gap-2"
        data-tour="academy-clase-booked"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("booked")} ({booked})
        </h3>
        {roster.booked.length === 0 ? (
          <p className="text-sm text-ink/50">{t("emptyBooked")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {bookedItems.map((b) => (
              <li
                key={b.personId}
                className="flex items-center gap-3 rounded-xl border border-line bg-elevated/60 px-4 py-3 text-sm"
              >
                <Link
                  href={`/academia/alumnos/${b.personId}`}
                  className="flex min-h-11 min-w-0 flex-1 items-center rounded-sm transition-colors hover:text-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                  {b.name ?? t("personFallback", { id: shortId(b.personId) })}
                </Link>
                {b.attended ? (
                  <Badge variant="neon">{t("present")}</Badge>
                ) : showMarking ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={markingId === b.personId}
                    onClick={() => void markPresent(b.personId)}
                  >
                    {markingId === b.personId ? (
                      <Spinner size="sm" />
                    ) : (
                      t("markPresent")
                    )}
                  </Button>
                ) : (
                  // Sin marcar: la reserva sigue consumiendo cupo pero
                  // el alumno queda "sin confirmar" (spec class-series).
                  <Badge variant="muted">{t("unconfirmed")}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
        {roster.booked.length > pageSize && (
          <Pager
            page={bookedPage}
            pageSize={pageSize}
            total={roster.booked.length}
            onPage={setBookedPage}
          />
        )}
        {roster.canMark && !windowOpen && (
          <p className="text-xs text-ink/50">
            {t("attendanceWindow", {
              opens: getDateFmt(locale, {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(roster.attendanceWindow.opensAt)),
              closes: getDateFmt(locale, {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(roster.attendanceWindow.closesAt)),
            })}
          </p>
        )}
      </section>

      {/* Lista de espera */}
      <section
        aria-label={t("waitlistTitle")}
        className="flex flex-col gap-2"
        data-tour="academy-clase-waitlist"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("waitlistTitle")} ({roster.waitlist.length})
        </h3>
        {roster.waitlist.length === 0 ? (
          <p className="text-sm text-ink/50">{t("emptyWaitlist")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {waitlistItems.map((w, i) => (
              <li
                key={w.personId}
                className="flex items-center gap-3 rounded-xl border border-line bg-elevated/60 px-4 py-3 text-sm"
              >
                <span className="text-xs tabular-nums text-ink/40">
                  #{(waitlistPage - 1) * pageSize + i + 1}
                </span>
                <Link
                  href={`/academia/alumnos/${w.personId}`}
                  className="flex min-h-11 min-w-0 flex-1 items-center rounded-sm transition-colors hover:text-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                  {w.name ??
                    t("personFallback", { id: shortId(w.personId) })}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {roster.waitlist.length > pageSize && (
          <Pager
            page={waitlistPage}
            pageSize={pageSize}
            total={roster.waitlist.length}
            onPage={setWaitlistPage}
          />
        )}
      </section>

      {/* Zona roja canónica (console-patterns §4): div centrado al pie
          separado por border-t, ghost rojo + ConfirmSheet. La
          descripción de la cascada la muestra el propio sheet. */}
      {roster.canCancel && !c.cancelled && !ended && (
        <div className="flex justify-center border-t border-line pt-6">
          <Button
            variant="ghost"
            size="sm"
            disabled={cancelBusy}
            className="text-red-400 hover:text-red-300"
            onClick={() => setConfirmCancel(true)}
          >
            {ts("cancelClass")}
          </Button>
        </div>
      )}
      <ConfirmSheet
        open={confirmCancel}
        title={ts("cancelClass")}
        description={ts("cancelClassDesc")}
        confirmLabel={ts("cancelClass")}
        busy={cancelBusy}
        onConfirm={() => void cancelClass()}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  );
}

/** Métricas de cupo del horario de esta clase (ÚLT./PROM./PRÓX. con
    desglose de género): el mismo bloque de la agenda "Niveles y
    cupos" del inicio. Fetch propio contra insights/levels - ese
    endpoint es owner/ADMIN + feature `insights`, así que en 403/404
    (instructor u otro lente sin privilegio) la sección no se
    renderiza, igual que la card del inicio. Sin skeleton: para ese
    perfil el estado "loading" siempre termina oculto y un skeleton
    sería un flash vacío; la sección aparece solo con data lista. */
function SlotCupos({
  academyId,
  slotId,
}: {
  academyId: string;
  slotId: string;
}) {
  const ta = useTranslations("academy");
  const tc = useTranslations("common");
  // Mismo formato de la agenda: promedio con un decimal.
  const numFmt = useNumFmt({ maximumFractionDigits: 1 });
  const [slot, setSlot] = useState<
    AcademyLevelInsights["bySlot"][number] | null
  >(null);
  const [state, setState] = useState<
    "loading" | "ready" | "hidden" | "error"
  >("loading");
  // Retry del fetch: bump del nonce re-dispara el efecto.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await apiFetch(
          `/academies/${academyId}/insights/levels`,
        );
        if (!alive) return;
        if (res.status === 403 || res.status === 404) {
          setState("hidden");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        const data = (await res.json()) as AcademyLevelInsights;
        const found =
          data.bySlot.find((x) => x.slotId === slotId) ?? null;
        setSlot(found);
        // Slot borrado o sin historial aún: nada que mostrar.
        setState(found ? "ready" : "hidden");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [academyId, slotId, nonce]);

  if (state === "loading" || state === "hidden") return null;
  return (
    <section
      aria-label={ta("levels.title")}
      className="flex flex-col gap-2"
    >
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {ta("levels.title")}
      </h3>
      {state === "error" || !slot ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-xs text-ink/50">
            {ta("levels.loadError")}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      ) : (
        <Card className="px-4 py-3">
          <MetricsGrid slot={slot} numFmt={numFmt} divided={false} />
        </Card>
      )}
    </section>
  );
}

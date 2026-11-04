"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  ConfirmSheet,
  RefreshIcon,
} from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import {
  ActionNotice,
  showActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { InstructorChecklist } from "@/components/academy/instructor-checklist";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyTierGate } from "@/components/academy/academy-tier-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { CourseSurveyResults } from "@/components/academy/survey-results";
import {
  inputCls,
  readError,
  type AcademyInstructor,
  type Series,
} from "@/components/academy/shared";
import { Link, useRouter } from "@/i18n/navigation";
import { useDateFmt, useNumFmt } from "@/lib/intl";

// Filas visibles por defecto en próximas/historial; "Ver todo"
// expande al listado completo dentro de la misma ficha.
const LIST_PREVIEW = 5;

type SeriesClass = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  cancelled: boolean;
  instructorName: string | null;
  // Plantel completo (multi-instructor): primario + co-profes.
  instructors?: { id: string; name: string | null }[];
  bookedCount: number;
  attendanceCount: number;
};

// "María · Eduardo" - primario + co-profes; cae al nombre plano si el
// backend aún no expone el plantel.
function rosterNames(c: {
  instructorName: string | null;
  instructors?: { name: string | null }[];
}): string | null {
  if (c.instructors?.length) {
    const joined = c.instructors
      .map((i) => i.name)
      .filter(Boolean)
      .join(" · ");
    if (joined) return joined;
  }
  return c.instructorName;
}

/**
 * /academia/series/[id] - detalle de la clase (serie): datos + acciones
 * (editar, desactivar/reactivar, eliminar lógico), gestión de horarios,
 * próximas clases con reservas e historial con asistencia + profesor.
 * El listado /academia/series solo navega hasta acá (spec
 * academies/class-series).
 */
export default function SerieDetailPage() {
  const t = useTranslations("academySeries");
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:gap-4 lg:px-4">
      <ConsoleHeader backHref="/academia/series" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <AcademyTierGate academy={academy} feature="classes"><SeriesDetail
            key={`${academy.id}:${params.id}`}
            academyId={academy.id}
            seriesId={params.id}
          /></AcademyTierGate>
        )}
      </AcademyGate>
    </main>
  );
}

function SeriesDetail({
  academyId,
  seriesId,
}: {
  academyId: string;
  seriesId: string;
}) {
  const locale = useLocale();
  const t = useTranslations("academySeries");
  const ta = useTranslations("academy");
  const tc = useTranslations("common");
  const router = useRouter();

  const [series, setSeries] = useState<Series | null>(null);
  const [classes, setClasses] = useState<{
    upcoming: SeriesClass[];
    past: SeriesClass[];
  } | null>(null);
  const [loadError, setLoadError] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);
  // Preview acotado de las listas: 5 filas + "Ver todo" expande (el
  // historial puede ser largo en series viejas).
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  // Confirmación destructiva compartida: serie entera o un horario.
  // La cancelación por instancia vive en la ficha de la clase
  // (/academia/clases/[id], zona roja - spec workshop-one-off-class).
  const [confirm, setConfirm] = useState<
    | { kind: "series" }
    | { kind: "slot"; slotId: string }
    | null
  >(null);

  // ─── mini-form "agregar horario" (PATCH addSlots) - día/hora +
  // instructor opcional; cupos y modalidad son de la serie. ───
  const [slotForm, setSlotForm] = useState(false);
  const [nsWeekday, setNsWeekday] = useState(1);
  const [nsStart, setNsStart] = useState("19:00");
  const [nsEnd, setNsEnd] = useState("20:00");
  const [nsInstructors, setNsInstructors] = useState<string[]>([]);
  const [instructors, setInstructors] = useState<AcademyInstructor[] | null>(
    null,
  );

  const clpFmt = useNumFmt({
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      });
  // Class.date llega a medianoche UTC: formatear en UTC para que el día
  // no se corra en zonas negativas (mismo contrato que classDayFmt).
  const dayFmt = useDateFmt({
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
  // Fecha puntual del slot de taller (oneOffDate, medianoche UTC):
  // "15 nov" en la fila de horarios, sin weekday ni año.
  const slotDateFmt = useDateFmt({
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const [sRes, cRes] = await Promise.all([
        apiFetch(`/academies/${academyId}/series/${seriesId}`),
        apiFetch(`/academies/${academyId}/series/${seriesId}/classes`),
      ]);
      if (!sRes.ok) {
        setLoadError(sRes.status);
        return;
      }
      setSeries((await sRes.json()) as Series);
      setClasses(
        cRes.ok
          ? ((await cRes.json()) as {
              upcoming: SeriesClass[];
              past: SeriesClass[];
            })
          : { upcoming: [], past: [] },
      );
    } catch {
      setLoadError(0);
    }
  }, [academyId, seriesId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Instructores de la academia para el override del horario.
  // GET /academies/:id ya trae los nombres - el directorio completo
  // era un request extra solo por ellos.
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch(`/academies/${academyId}`);
        const detail = res.ok
          ? ((await res.json()) as {
              instructors?: { personId: string; name?: string | null }[];
            })
          : null;
        setInstructors(
          (detail?.instructors ?? []).map((i) => ({
            personId: i.personId,
            name: i.name ?? null,
          })),
        );
      } catch {
        setInstructors([]);
      }
    })();
  }, [academyId]);

  // Devuelve éxito: el caller decide si cerrar UI asociada (ej. el
  // mini-form de horario no se cierra si el PATCH falla).
  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/series/${seriesId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return false;
      }
      setNotice({ text: t("updated") });
      await reload();
      return true;
    } catch {
      setNotice({ text: t("error"), error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  // DELETE = borrado lógico (spec academies/class-series): la serie se
  // desactiva y se oculta de la consola; sigue en analítica.
  async function remove(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/series/${seriesId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setConfirm(null);
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      showActionNotice({ text: t("seriesDeleted") });
      router.replace("/academia/series");
    } catch {
      setConfirm(null);
      setNotice({ text: t("error"), error: true });
      setBusy(false);
    }
  }

  async function addSlot(): Promise<void> {
    if (!nsStart || !nsEnd || nsStart >= nsEnd) {
      setNotice({ text: t("error"), error: true });
      return;
    }
    const ok = await patch({
      addSlots: [
        {
          weekday: nsWeekday,
          startTime: nsStart,
          endTime: nsEnd,
          ...(nsInstructors.length ? { instructorIds: nsInstructors } : {}),
        },
      ],
    });
    // Solo cerrar el mini-form si el PATCH salió bien: si falla, el
    // usuario conserva lo que cargó y el error queda visible.
    if (ok) setSlotForm(false);
  }

  async function removeSlot(slotId: string): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/slots/${slotId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setConfirm(null);
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      setConfirm(null);
      setNotice({ text: t("updated") });
      await reload();
    } catch {
      setConfirm(null);
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  if (loadError !== null) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {loadError === 404 ? t("empty") : tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void reload()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (!series || !classes) {
    return <SkeletonList />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Datos de la clase - header de entidad: headline
          identidad+estado, clasificación, descripción y datos en
          <dl>. Desactivar/Reactivar vive en la zona inferior junto a
          Eliminar. */}
      {/* Header de entidad desnudo (estándar industria: la identidad
          de la página va sobre el canvas, las cajas se reservan a las
          secciones) - el bloque completo navega a editar: chevron +
          nombre/chevron neon en hover + focus ring en el Link. */}
      <Link
        href={`/academia/series/nueva?edit=${series.id}`}
        className="group block rounded-2xl transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
      >
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-lg font-semibold transition-colors group-hover:text-neon">
              {series.name}
            </h2>
            {!series.active && (
              <Badge variant="live">{t("inactive")}</Badge>
            )}
          </div>
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40 transition-colors group-hover:text-neon" />
        </div>
        {(series.style || series.level || series.types.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {series.style && (
              <Badge variant="neon">{series.style.name}</Badge>
            )}
            {series.level && (
              <Badge variant="muted">{series.level.name}</Badge>
            )}
            {series.types.map((x) => (
              <Badge key={x.type.id} variant="outline">
                {x.type.name}
              </Badge>
            ))}
          </div>
        )}
        {series.description && (
          <p className="text-sm text-ink/60">{series.description}</p>
        )}
        {(series.quorum != null || series.dropInPrice != null) && (
          <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-3 text-xs">
            {series.quorum != null && (
              <div className="flex items-baseline gap-1.5">
                <dt className="text-ink/50">{t("quorum")}</dt>
                <dd className="tabular-nums text-ink/80">
                  {series.quorum}
                </dd>
              </div>
            )}
            {series.dropInPrice != null && (
              <div className="flex items-baseline gap-1.5">
                <dt className="text-ink/50">{t("dropIn")}</dt>
                <dd className="tabular-nums text-ink/80">
                  {clpFmt.format(series.dropInPrice)}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
      </Link>

      {/* El DOM ordena mobile: Horarios → Encuestas → Próximas →
          Pasadas. En lg la posición explícita por celda recompone el
          2×2: Horarios+Próximas a la izquierda, Encuestas+Pasadas a la
          derecha. La celda de encuestas es fija porque el componente
          puede devolver null (carga, 403, sin permiso). */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* Horarios de la serie */}
      <section
        aria-label={t("slotsTitle")}
        className="flex flex-col gap-3 lg:col-start-1 lg:row-start-1"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            {t("slotsTitle")}
          </h3>
          {series.active && !slotForm && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                setSlotForm(true);
                setNsWeekday(1);
                setNsStart("19:00");
                setNsEnd("20:00");
                setNsInstructors([]);
                setNotice(null);
              }}
            >
              + {t("addSlot")}
            </Button>
          )}
        </div>
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {series.slots.map((slot) => (
              <li key={slot.id}>
                {/* El tap abre la ficha del horario: editar día/hora,
                    asignar plantel y eliminar viven ahí (console-patterns). */}
                <Link
                  href={`/academia/series/${seriesId}/horarios/${slot.id}`}
                  className="flex items-center gap-2 px-4 py-3 text-sm transition-colors hover:bg-elevated"
                >
                  <span className="tabular-nums text-ink/80">
                    {/* Slot de taller: muestra su fecha puntual, no el
                        weekday recurrente (spec workshop-one-off-class). */}
                    {slot.oneOffDate
                      ? slotDateFmt.format(new Date(slot.oneOffDate))
                      : ta(`weekday.${slot.weekday}`)}{" "}
                    {slot.startTime}–{slot.endTime}
                  </span>
                  {slot.oneOffDate && (
                    <Badge variant="neon">{t("workshopBadge")}</Badge>
                  )}
                  {/* Plantel del horario (multi-instructor): co-profes
                      separados por " · " junto al horario. */}
                  {!!slot.instructors?.length && (
                    <span className="min-w-0 truncate text-xs text-ink/50">
                      {slot.instructors
                        .map((i) => i.person.name)
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  <ChevronRightIcon className="ml-auto h-4 w-4 shrink-0 text-ink/40" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        {series.active && slotForm && (
          <form
            className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-elevated p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void addSlot();
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("weekday")}</span>
              <select
                className={inputCls}
                value={nsWeekday}
                onChange={(e) => setNsWeekday(Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {ta(`weekday.${d}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("start")}</span>
              <input
                type="time"
                className={inputCls}
                value={nsStart}
                onChange={(e) => setNsStart(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("end")}</span>
              <input
                type="time"
                className={inputCls}
                value={nsEnd}
                onChange={(e) => setNsEnd(e.target.value)}
                required
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("slotInstructors")}</span>
              {/* Solo el roster habilitado de la serie es asignable. */}
              <InstructorChecklist
                options={((series as { instructors?: { person: { id: string; name: string | null } }[] } | null)?.instructors ?? []).map((i) => ({ id: i.person.id, name: i.person.name }))}
                selected={nsInstructors}
                onChange={setNsInstructors}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? tc("loading") : t("addSlot")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSlotForm(false)}
              >
                {tc("cancel")}
              </Button>
            </div>
          </form>
        )}
      </section>

      {/* Encuestas mensuales del curso - solo owner/ADMIN (el endpoint
          403 se oculta solo); anónimas por contrato. El wrapper sostiene
          la celda del grid aunque el componente devuelva null. */}
      <div className="lg:col-start-2 lg:row-start-1">
        <CourseSurveyResults academyId={academyId} seriesId={series.id} />
      </div>

      {/* Próximas clases con reservas */}
      <section
        aria-label={t("upcomingTitle")}
        className="flex flex-col gap-3 lg:col-start-1 lg:row-start-2"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("upcomingTitle")}
        </h3>
        <Card padded={false}>
          {classes.upcoming.length === 0 ? (
            <p className="px-4 py-4 text-sm text-ink/50">
              {t("upcomingEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {classes.upcoming
                .slice(0, showAllUpcoming ? undefined : LIST_PREVIEW)
                .map((c) => (
                <li key={c.id} className="flex items-center">
                  <Link
                    href={`/academia/clases/${c.id}`}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neon"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium capitalize">
                        {dayFmt.format(new Date(c.date))}
                        {c.cancelled && (
                          <Badge variant="live" className="ml-2">
                            {t("cancelled")}
                          </Badge>
                        )}
                      </span>
                      <span className="block text-xs tabular-nums text-ink/50">
                        {c.startTime}–{c.endTime}
                        {(() => {
                          const n = rosterNames(c);
                          return n ? ` · ${n}` : "";
                        })()}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-ink/50">
                      {t("bookedCount", { count: c.bookedCount })}
                    </span>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                  </Link>
                </li>
              ))}
              {classes.upcoming.length > LIST_PREVIEW && (
                <li>
                  <button
                    type="button"
                    onClick={() => setShowAllUpcoming((v) => !v)}
                    className="flex min-h-11 w-full items-center justify-center gap-1 px-4 py-2 text-sm font-medium text-neon transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neon"
                  >
                    {showAllUpcoming
                      ? tc("showLess")
                      : `${tc("seeAll")} (${classes.upcoming.length})`}
                  </button>
                </li>
              )}
            </ul>
          )}
        </Card>
      </section>

      {/* Historial: clases pasadas con asistencia + profesor */}
      <section
        aria-label={t("pastTitle")}
        className="flex flex-col gap-3 lg:col-start-2 lg:row-start-2"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("pastTitle")}
        </h3>
        <Card padded={false}>
          {classes.past.length === 0 ? (
            <p className="px-4 py-4 text-sm text-ink/50">{t("pastEmpty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {classes.past
                .slice(0, showAllPast ? undefined : LIST_PREVIEW)
                .map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/academia/clases/${c.id}`}
                    className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neon"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium capitalize">
                        {dayFmt.format(new Date(c.date))}
                        {c.cancelled && (
                          <Badge variant="live" className="ml-2">
                            {t("cancelled")}
                          </Badge>
                        )}
                      </span>
                      <span className="block text-xs tabular-nums text-ink/50">
                        {c.startTime}–{c.endTime}
                        {(() => {
                          const n = rosterNames(c);
                          return n ? ` · ${n}` : "";
                        })()}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-ink/50">
                      {t("attendedCount", { count: c.attendanceCount })}
                    </span>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                  </Link>
                </li>
              ))}
              {classes.past.length > LIST_PREVIEW && (
                <li>
                  <button
                    type="button"
                    onClick={() => setShowAllPast((v) => !v)}
                    className="flex min-h-11 w-full items-center justify-center gap-1 px-4 py-2 text-sm font-medium text-neon transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neon"
                  >
                    {showAllPast
                      ? tc("showLess")
                      : `${tc("seeAll")} (${classes.past.length})`}
                  </button>
                </li>
              )}
            </ul>
          )}
        </Card>
      </section>
      </div>

      {/* Zona destructiva al pie: separada con border-t, centrada,
          ghost rojo + ConfirmSheet (console-patterns §4). Borrado
          lógico: la serie se desactiva y sale de la consola. */}
      <div className="flex justify-center gap-2 border-t border-line pt-6">
        {series.active ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void patch({ active: false })}
          >
            {t("deactivate")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void patch({ active: true })}
          >
            {t("reactivate")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-red-400 hover:text-red-300"
          disabled={busy}
          onClick={() => setConfirm({ kind: "series" })}
        >
          {t("delete")}
        </Button>
      </div>

      <ConfirmSheet
        open={confirm !== null}
        title={
          confirm?.kind === "slot"
            ? t("removeSlotConfirm")
            : t("deleteConfirm")
        }
        confirmLabel={
          confirm?.kind === "slot" ? t("removeSlot") : t("delete")
        }
        busy={busy}
        onConfirm={() =>
          confirm?.kind === "slot"
            ? void removeSlot(confirm.slotId)
            : void remove()
        }
        onClose={() => setConfirm(null)}
      />

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}

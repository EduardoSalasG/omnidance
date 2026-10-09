"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  RefreshIcon,
  XIcon,
} from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { CourseSurveyResults } from "@/components/academy/survey-results";
import {
  inputCls,
  readError,
  type AcademyInstructor,
  type Series,
} from "@/components/academy/shared";

type SeriesClass = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  cancelled: boolean;
  instructorName: string | null;
  bookedCount: number;
  attendanceCount: number;
};

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
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader backHref="/academia/series" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <SeriesDetail
            key={`${academy.id}:${params.id}`}
            academyId={academy.id}
            seriesId={params.id}
          />
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // ─── mini-form "agregar horario" (PATCH addSlots) - día/hora +
  // instructor opcional; cupos y modalidad son de la serie. ───
  const [slotForm, setSlotForm] = useState(false);
  const [nsWeekday, setNsWeekday] = useState(1);
  const [nsStart, setNsStart] = useState("19:00");
  const [nsEnd, setNsEnd] = useState("20:00");
  const [nsInstructor, setNsInstructor] = useState("");
  const [instructors, setInstructors] = useState<AcademyInstructor[] | null>(
    null,
  );

  const clpFmt = useMemo(
    () =>
      new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }),
    [],
  );
  const dayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("es-CL", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    [],
  );

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
  useEffect(() => {
    void (async () => {
      try {
        const [detailRes, dirRes] = await Promise.all([
          apiFetch(`/academies/${academyId}`),
          apiFetch("/academies"),
        ]);
        const detail = detailRes.ok
          ? ((await detailRes.json()) as {
              instructors?: { personId: string }[];
            })
          : null;
        const directory = dirRes.ok
          ? ((await dirRes.json()) as {
              id: string;
              instructors?: { personId: string; name: string | null }[];
            }[])
          : [];
        const dirEntry = directory.find((a) => a.id === academyId);
        const names = new Map(
          (dirEntry?.instructors ?? []).map((i) => [i.personId, i.name]),
        );
        const ids =
          detail?.instructors?.map((i) => i.personId) ??
          dirEntry?.instructors?.map((i) => i.personId) ??
          [];
        setInstructors(
          ids.map((personId) => ({
            personId,
            name: names.get(personId) ?? null,
          })),
        );
      } catch {
        setInstructors([]);
      }
    })();
  }, [academyId]);

  async function patch(body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setActionError(null);
    setFeedback(null);
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
        setActionError((await readError(res)) ?? t("error"));
        return;
      }
      setFeedback(t("updated"));
      await reload();
    } catch {
      setActionError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  // DELETE = borrado lógico (spec academies/class-series): la serie se
  // desactiva y se oculta de la consola; sigue en analítica.
  async function remove(): Promise<void> {
    if (!window.confirm(t("deleteConfirm"))) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/series/${seriesId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setActionError((await readError(res)) ?? t("error"));
        return;
      }
      router.replace("/academia/series");
    } catch {
      setActionError(t("error"));
      setBusy(false);
    }
  }

  async function addSlot(): Promise<void> {
    if (!nsStart || !nsEnd || nsStart >= nsEnd) {
      setActionError(t("error"));
      return;
    }
    await patch({
      addSlots: [
        {
          weekday: nsWeekday,
          startTime: nsStart,
          endTime: nsEnd,
          ...(nsInstructor ? { instructorId: nsInstructor } : {}),
        },
      ],
    });
    setSlotForm(false);
  }

  async function removeSlot(slotId: string): Promise<void> {
    if (!window.confirm(t("removeSlotConfirm"))) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/slots/${slotId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setActionError((await readError(res)) ?? t("error"));
        return;
      }
      await reload();
    } catch {
      setActionError(t("error"));
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
      {/* Datos de la clase */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">{series.name}</h2>
          {!series.active && <Badge variant="live">{t("inactive")}</Badge>}
        </div>
        {series.description && (
          <p className="text-sm text-ink/60">{series.description}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {series.style && <Badge variant="neon">{series.style.name}</Badge>}
          {series.level && <Badge variant="muted">{series.level.name}</Badge>}
          {series.quorum != null && (
            <Badge variant="outline">
              {t("quorumValue", { value: series.quorum })}
            </Badge>
          )}
          {series.types.map((x) => (
            <Badge key={x.type.id} variant="outline">
              {x.type.name}
            </Badge>
          ))}
          {series.dropInPrice != null && (
            <Badge variant="outline">
              {t("dropInValue", { value: clpFmt.format(series.dropInPrice) })}
            </Badge>
          )}
        </div>
      </section>

      {/* Acciones de la clase */}
      <section aria-label={t("actions")} className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          href={`/academia/series/nueva?edit=${series.id}`}
        >
          {t("edit")}
        </Button>
        {series.active ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void patch({ active: false })}
          >
            {t("deactivate")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void patch({ active: true })}
          >
            {t("reactivate")}
          </Button>
        )}
      </section>

      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {actionError}
        </p>
      )}

      {/* Horarios de la serie */}
      <section aria-label={t("slotsTitle")} className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("slotsTitle")}
        </h3>
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {series.slots.map((slot) => (
              <li
                key={slot.id}
                className="flex items-center gap-2 px-4 py-3 text-sm"
              >
                <span className="tabular-nums text-ink/80">
                  {ta(`weekday.${slot.weekday}`)} {slot.startTime}–
                  {slot.endTime}
                </span>
                {series.active && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto px-2"
                    aria-label={t("removeSlot")}
                    disabled={busy}
                    onClick={() => void removeSlot(slot.id)}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
        {series.active && !slotForm && (
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setSlotForm(true);
                setNsWeekday(1);
                setNsStart("19:00");
                setNsEnd("20:00");
                setNsInstructor("");
                setActionError(null);
              }}
            >
              + {t("addSlot")}
            </Button>
          </div>
        )}
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
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("instructor")}</span>
              <select
                className={`${inputCls} disabled:opacity-50`}
                value={nsInstructor}
                onChange={(e) => setNsInstructor(e.target.value)}
                disabled={instructors === null}
                aria-busy={instructors === null}
              >
                <option value="">·</option>
                {(instructors ?? []).map((i) => (
                  <option key={i.personId} value={i.personId}>
                    {i.name ?? i.personId.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
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

      {/* Próximas clases con reservas */}
      <section
        aria-label={t("upcomingTitle")}
        className="flex flex-col gap-3"
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
              {classes.upcoming.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/academia/clases/${c.id}`}
                    className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neon"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium capitalize">
                        {dayFmt.format(new Date(c.date))}
                      </span>
                      <span className="block text-xs tabular-nums text-ink/50">
                        {c.startTime}–{c.endTime}
                        {c.instructorName ? ` · ${c.instructorName}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-ink/50">
                      {t("bookedCount", { count: c.bookedCount })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Historial: clases pasadas con asistencia + profesor */}
      <section aria-label={t("pastTitle")} className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("pastTitle")}
        </h3>
        <Card padded={false}>
          {classes.past.length === 0 ? (
            <p className="px-4 py-4 text-sm text-ink/50">{t("pastEmpty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {classes.past.map((c) => (
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
                        {c.instructorName ? ` · ${c.instructorName}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-ink/50">
                      {t("attendedCount", { count: c.attendanceCount })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Encuestas mensuales del curso - solo owner/ADMIN (el endpoint
          403 se oculta solo); anónimas por contrato. */}
      <CourseSurveyResults academyId={academyId} seriesId={series.id} />

      <p role="status" aria-live="polite" className="text-sm text-neon">
        {feedback}
      </p>

      {/* Zona destructiva al pie, centrada y en rojo - mismo patrón que
          "Eliminar amigo" (/amigos/[id]). Borrado lógico: la serie se
          desactiva y sale de la consola. */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-red-400/80 transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon disabled:opacity-50"
        >
          {t("delete")}
        </button>
      </div>
    </div>
  );
}

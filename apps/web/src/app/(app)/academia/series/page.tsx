"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon, XIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { FilterBar } from "@/components/query/FilterBar";
import {
  filterQuery,
  inputCls,
  readError,
  type AcademyInstructor,
  type FilterOption,
  type Series,
  type SeriesStyle,
} from "@/components/academy/shared";

// Las series no son entidad del catálogo ACADEMY_OWNER: EntityDef local
// con claves del contrato (spec analytics/query-console) - q sobre el
// nombre, status = active|inactive y styleId exacto (whitelist del
// endpoint).
const SERIES_ENTITY: EntityDef = {
  entity: "class_series",
  filters: [
    { key: "q", type: "text" },
    { key: "status", type: "enum", options: ["active", "inactive"] },
    { key: "styleId", type: "fk", source: "styles" },
  ],
  columns: [],
};

/**
 * /academia/series - listado de las series de clases mensuales de la
 * academia seleccionada. Crear/editar vive en la página dedicada
 * /academia/series/nueva (?edit=<seriesId>) detrás del CTA; quedan
 * inline las acciones por card: agregar horario (addSlots), quitar
 * horario, desactivar/reactivar. Los selects del mini-form de horario
 * se alimentan de GET /classes/catalogs y el directorio de academias.
 */
export default function AcademiaSeriesPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <SeriesModule key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function SeriesModule({ academyId }: { academyId: string }) {
  const t = useTranslations("academySeries");
  const ta = useTranslations("academy");
  const tc = useTranslations("common");

  const [series, setSeries] = useState<Series[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState<QueryFilters>({});
  // Opciones del filtro styleId - GET /styles (mismo catálogo que el
  // form de serie).
  const [styleOptions, setStyleOptions] = useState<FilterOption[]>([]);

  // ─── catálogo del mini-form "agregar horario" ───
  // null = fetch en vuelo → el select de instructor queda disabled.
  const [instructors, setInstructors] = useState<AcademyInstructor[] | null>(
    null,
  );

  // ─── mini-form "agregar horario" por serie activa (PATCH addSlots) ───
  // Solo día/horas/instructor: cupos y modalidad son de la serie
  // (spec academies/class-series).
  const [slotFormFor, setSlotFormFor] = useState<string | null>(null);
  const [nsWeekday, setNsWeekday] = useState(1);
  const [nsStart, setNsStart] = useState("19:00");
  const [nsEnd, setNsEnd] = useState("20:00");
  const [nsInstructor, setNsInstructor] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const clpFmt = useMemo(
    () =>
      new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }),
    [],
  );

  const reload = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/series${filterQuery(filters)}`,
      );
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      setSeries((await res.json()) as Series[]);
    } catch {
      setLoadError(true);
    }
  }, [academyId, filters]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Catálogos: instructores (mini-form de horario) y styles (filtro
  // styleId). Si fallan se resuelven a [] - la lista igual se muestra.
  useEffect(() => {
    apiFetch("/styles")
      .then(async (res) =>
        res.ok ? ((await res.json()) as SeriesStyle[]) : [],
      )
      .then((styles) =>
        setStyleOptions(
          styles.map((s) => ({ value: s.id, label: s.name })),
        ),
      )
      .catch(() => setStyleOptions([]));
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
        // Sin instructores - el select queda solo con "·".
        setInstructors([]);
      }
    })();
  }, [academyId]);

  // DELETE /academies/:id/series/:seriesId - desactiva y cancela las
  // clases futuras (el backend libera las reservas).
  async function deactivate(s: Series): Promise<void> {
    if (!window.confirm(t("deactivateConfirm"))) return;
    setBusyId(s.id);
    setActionError(null);
    setFeedback(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/series/${s.id}`,
        { method: "DELETE" },
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
      setBusyId(null);
    }
  }

  // PATCH {active:true} - reactiva la serie (no re-materializa clases
  // canceladas; las futuras se crean desde los slots al navegar el mes).
  async function reactivate(s: Series): Promise<void> {
    setBusyId(s.id);
    setActionError(null);
    setFeedback(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/series/${s.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true }),
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
      setBusyId(null);
    }
  }

  // PATCH {addSlots:[…]} - agrega un horario a la serie y materializa
  // las clases futuras de la ventana rodante en ese día. El instructor
  // es el único override del slot (cupos/modalidad son de la serie).
  async function addSlot(s: Series): Promise<void> {
    if (!nsStart || !nsEnd || nsStart >= nsEnd) {
      setActionError(t("error"));
      return;
    }
    setBusyId(s.id);
    setActionError(null);
    setFeedback(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/series/${s.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            addSlots: [
              {
                weekday: nsWeekday,
                startTime: nsStart,
                endTime: nsEnd,
                ...(nsInstructor ? { instructorId: nsInstructor } : {}),
              },
            ],
          }),
        },
      );
      if (!res.ok) {
        setActionError((await readError(res)) ?? t("error"));
        return;
      }
      setFeedback(t("slotAdded"));
      setSlotFormFor(null);
      await reload();
    } catch {
      setActionError(t("error"));
    } finally {
      setBusyId(null);
    }
  }

  // DELETE /academies/:id/slots/:slotId - quita el horario y cancela
  // sus clases futuras.
  async function removeSlot(slotId: string): Promise<void> {
    if (!window.confirm(t("removeSlotConfirm"))) return;
    setBusyId(slotId);
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
      setBusyId(null);
    }
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void reload()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (series === null) {
    return <SkeletonList />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Button href="/academia/series/nueva" size="sm" className="self-start">
        + {t("new")}
      </Button>

      <FilterBar
        entity={SERIES_ENTITY}
        filters={filters}
        onChange={setFilters}
        options={{ styles: styleOptions }}
      />

      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {actionError}
        </p>
      )}

      {series.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink/50">{t("empty")}</p>
          <Button href="/academia/series/nueva" size="sm">
            + {t("new")}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
          {series.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-semibold">{s.name}</p>
                  {!s.active && <Badge variant="live">{t("inactive")}</Badge>}
                </div>
                {s.description && (
                  <p className="text-sm text-ink/60">{s.description}</p>
                )}
                {(s.style ||
                  s.level ||
                  s.types.length > 0 ||
                  s.quorum != null ||
                  s.dropInPrice != null) && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.style && <Badge variant="neon">{s.style.name}</Badge>}
                    {s.level && <Badge variant="muted">{s.level.name}</Badge>}
                    {s.quorum != null && (
                      <Badge variant="outline">
                        {t("quorumValue", { value: s.quorum })}
                      </Badge>
                    )}
                    {s.types.map((x) => (
                      <Badge key={x.type.id} variant="outline">
                        {x.type.name}
                      </Badge>
                    ))}
                    {s.dropInPrice != null && (
                      <Badge variant="outline">
                        {t("dropInValue", {
                          value: clpFmt.format(s.dropInPrice),
                        })}
                      </Badge>
                    )}
                  </div>
                )}
                {s.slots.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {s.slots.map((slot) => (
                      <li
                        key={slot.id}
                        className="flex items-center gap-2 text-sm text-ink/70"
                      >
                        {/* Cupos/modalidad viven en la serie (badges
                            arriba) - el slot solo muestra día y hora. */}
                        <span className="tabular-nums">
                          {ta(`weekday.${slot.weekday}`).slice(0, 3)}{" "}
                          {slot.startTime}–{slot.endTime}
                        </span>
                        {s.active && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="px-2"
                            aria-label={t("removeSlot")}
                            disabled={busyId === slot.id}
                            onClick={() => void removeSlot(slot.id)}
                          >
                            <XIcon className="h-4 w-4" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {s.active && slotFormFor !== s.id && (
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSlotFormFor(s.id);
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
                {s.active && slotFormFor === s.id && (
                  <form
                    className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-elevated p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void addSlot(s);
                    }}
                  >
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-ink/50">
                        {t("weekday")}
                      </span>
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
                      <span className="text-xs text-ink/50">
                        {t("start")}
                      </span>
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
                      <span className="text-xs text-ink/50">
                        {t("instructor")}
                      </span>
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
                      <Button
                        type="submit"
                        size="sm"
                        disabled={busyId === s.id}
                      >
                        {busyId === s.id ? tc("loading") : t("addSlot")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSlotFormFor(null)}
                      >
                        {tc("cancel")}
                      </Button>
                    </div>
                    <p className="w-full text-xs text-ink/40">
                      {t("addSlotHint")}
                    </p>
                  </form>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    href={`/academia/series/nueva?edit=${s.id}`}
                  >
                    {t("edit")}
                  </Button>
                  {s.active ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === s.id}
                      onClick={() => void deactivate(s)}
                    >
                      {t("deactivate")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === s.id}
                      onClick={() => void reactivate(s)}
                    >
                      {t("reactivate")}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p role="status" aria-live="polite" className="text-sm text-neon">
        {feedback}
      </p>
    </div>
  );
}

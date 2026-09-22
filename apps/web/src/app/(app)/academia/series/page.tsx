"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls, readError } from "@/components/academy/shared";

type NamedRef = { id: string; name: string };
type Style = NamedRef & { genre: string };
type Level = NamedRef & { order: number };

// GET /academies/:id/series — espejo del SERIES_INCLUDE del controller
// (style/level/types via join, slots ordenados por weekday+startTime).
type SeriesSlot = {
  id: string;
  weekday: number; // 0-6, domingo = 0
  startTime: string; // "19:00"
  endTime: string;
  capacity: number;
  instructorId: string | null;
  // Modalidad propia del horario — vacío = hereda los types de la serie.
  types: { type: NamedRef }[];
};

type Series = {
  id: string;
  name: string;
  description: string | null;
  month: string; // "YYYY-MM"
  active: boolean;
  instructorId: string | null;
  // Override de quórum por serie (PATCH acepta quorum; null = hereda el
  // defaultQuorum de la academia). Opcional hasta que el backend lo exponga.
  quorum?: number | null;
  // CLP — precio de la clase suelta (null = no se vende suelta).
  dropInPrice?: number | null;
  style: NamedRef | null;
  level: NamedRef | null;
  types: { type: NamedRef }[];
  slots: SeriesSlot[];
};

// GET /academies/:id solo devuelve personIds; los nombres se cosechan
// del directorio GET /academies (mismo patrón que private-lessons).
type Instructor = { personId: string; name: string | null };

type SlotDraft = {
  weekday: number;
  startTime: string;
  endTime: string;
  capacity: string; // string para el input controlado; se parsea al enviar
  // Modalidad propia del horario — vacío = hereda los types de la serie.
  typeIds: string[];
};

const emptySlot = (): SlotDraft => ({
  weekday: 1,
  startTime: "19:00",
  endTime: "20:00",
  capacity: "20",
  typeIds: [],
});

/** "YYYY-MM" del mes actual en hora local — default del input month. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * /academia/series — gestión de las series de clases mensuales de la
 * academia seleccionada. El gate resuelve auth + academia; adentro va el
 * formulario de creación/edición y la lista con acciones (desactivar,
 * quitar slot). Los selects se alimentan de GET /styles,
 * GET /classes/catalogs y el detalle/directorio de academias.
 */
export default function AcademiaSeriesPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
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
  const tClasses = useTranslations("classes");

  const [series, setSeries] = useState<Series[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  // ─── catálogos para los selects ───
  const [styles, setStyles] = useState<Style[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [types, setTypes] = useState<NamedRef[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);

  // ─── formulario (crear / editar) ───
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Series | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [styleId, setStyleId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [instructorId, setInstructorId] = useState("");
  // Quórum opcional (override de serie) — string para el input controlado;
  // vacío = null = hereda el defaultQuorum de la academia.
  const [quorum, setQuorum] = useState("");
  // Precio clase suelta (CLP) — vacío = null = no se vende suelta.
  const [dropIn, setDropIn] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [slots, setSlots] = useState<SlotDraft[]>([emptySlot()]);

  // ─── mini-form "agregar horario" por serie activa (PATCH addSlots) ───
  const [slotFormFor, setSlotFormFor] = useState<string | null>(null);
  const [nsWeekday, setNsWeekday] = useState(1);
  const [nsStart, setNsStart] = useState("19:00");
  const [nsEnd, setNsEnd] = useState("20:00");
  const [nsCapacity, setNsCapacity] = useState("");
  const [nsInstructor, setNsInstructor] = useState("");
  const [nsTypeIds, setNsTypeIds] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const monthFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }),
    [],
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

  const reload = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiFetch(`/academies/${academyId}/series`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      setSeries((await res.json()) as Series[]);
    } catch {
      setLoadError(true);
    }
  }, [academyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Catálogos públicos + instructores de la academia. Si fallan, los
  // selects quedan vacíos pero la lista de series igual se muestra.
  useEffect(() => {
    apiFetch("/styles")
      .then(async (res) => (res.ok ? ((await res.json()) as Style[]) : []))
      .then(setStyles)
      .catch(() => {});
    apiFetch("/classes/catalogs")
      .then(async (res) =>
        res.ok
          ? ((await res.json()) as { levels: Level[]; types: NamedRef[] })
          : { levels: [], types: [] },
      )
      .then((c) => {
        setLevels(c.levels);
        setTypes(c.types);
      })
      .catch(() => {});
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
        // Sin instructores — el select queda solo con "—".
      }
    })();
  }, [academyId]);

  function monthLabel(m: string): string {
    const [y, mo] = m.split("-").map(Number);
    if (!y || !mo) return m;
    return monthFmt.format(new Date(Date.UTC(y, mo - 1, 1)));
  }

  function resetForm(): void {
    setEditing(null);
    setName("");
    setDescription("");
    setStyleId("");
    setLevelId("");
    setTypeIds([]);
    setInstructorId("");
    setQuorum("");
    setDropIn("");
    setMonth(currentMonth());
    setSlots([emptySlot()]);
    setFormError(null);
  }

  function openCreate(): void {
    resetForm();
    setFormOpen(true);
  }

  // PATCH solo acepta metadatos (no slots ni month) — en modo edición
  // se ocultan esos campos del formulario.
  function openEdit(s: Series): void {
    setEditing(s);
    setName(s.name);
    setDescription(s.description ?? "");
    setStyleId(s.style?.id ?? "");
    setLevelId(s.level?.id ?? "");
    setTypeIds(s.types.map((x) => x.type.id));
    setInstructorId(s.instructorId ?? "");
    setQuorum(s.quorum != null ? String(s.quorum) : "");
    setDropIn(s.dropInPrice != null ? String(s.dropInPrice) : "");
    setMonth(s.month);
    setSlots([emptySlot()]);
    setFormError(null);
    setFormOpen(true);
  }

  function toggleType(id: string): void {
    setTypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const toggleIn = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  function toggleSlotType(i: number, id: string): void {
    setSlots((prev) =>
      prev.map((s, j) =>
        j === i ? { ...s, typeIds: toggleIn(s.typeIds, id) } : s,
      ),
    );
  }

  function updateSlot(i: number, patch: Partial<SlotDraft>): void {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  // Quórum del form: "" → null (PATCH limpia el override → hereda el
  // default de la academia); número inválido → null también.
  function parsedQuorum(): number | null {
    const v = quorum.trim();
    if (!v) return null;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  // Misma convención que quorum: vacío/inválido → null (deja de venderse).
  function parsedDropIn(): number | null {
    const v = dropIn.trim();
    if (!v) return null;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!editing && (!month || slots.length === 0)) return;
    const q = parsedQuorum();
    const drop = parsedDropIn();
    setBusy(true);
    setFormError(null);
    setFeedback(null);
    try {
      const res = editing
        ? await apiFetch(`/academies/${academyId}/series/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: trimmed,
              description: description.trim() || null,
              styleId: styleId || null,
              levelId: levelId || null,
              typeIds,
              instructorId: instructorId || null,
              quorum: q,
              dropInPrice: drop,
            }),
          })
        : await apiFetch(`/academies/${academyId}/series`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: trimmed,
              ...(description.trim()
                ? { description: description.trim() }
                : {}),
              ...(styleId ? { styleId } : {}),
              ...(levelId ? { levelId } : {}),
              ...(typeIds.length ? { typeIds } : {}),
              ...(instructorId ? { instructorId } : {}),
              ...(q !== null ? { quorum: q } : {}),
              ...(drop !== null ? { dropInPrice: drop } : {}),
              month,
              slots: slots.map((s) => ({
                weekday: s.weekday,
                startTime: s.startTime,
                endTime: s.endTime,
                capacity: Number.parseInt(s.capacity, 10) || 1,
                ...(s.typeIds.length ? { typeIds: s.typeIds } : {}),
              })),
            }),
          });
      if (!res.ok) {
        setFormError((await readError(res)) ?? t("error"));
        return;
      }
      setFeedback(editing ? t("updated") : t("created"));
      resetForm();
      setFormOpen(false);
      await reload();
    } catch {
      setFormError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  // DELETE /academies/:id/series/:seriesId — desactiva y cancela las
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

  // PATCH {active:true} — reactiva la serie (no re-materializa clases
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

  // PATCH {addSlots:[…]} — agrega un horario a la serie y materializa las
  // clases que quedan del mes en ese día. Cupo/instructor opcionales: el
  // backend hereda los defaults de la serie.
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
                ...(nsCapacity
                  ? { capacity: Number.parseInt(nsCapacity, 10) || 1 }
                  : {}),
                ...(nsInstructor ? { instructorId: nsInstructor } : {}),
                ...(nsTypeIds.length ? { typeIds: nsTypeIds } : {}),
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

  // DELETE /academies/:id/slots/:slotId — quita el horario y cancela
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
        <p role="alert" className="text-sm text-white/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void reload()}>
          ↻ {tc("retry")}
        </Button>
      </div>
    );
  }
  if (series === null) {
    return <PageLoading />;
  }

  return (
    <div className="flex flex-col gap-6">
      {!formOpen && (
        <Button size="sm" className="self-start" onClick={openCreate}>
          + {t("new")}
        </Button>
      )}

      {formOpen && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {editing ? t("edit") : t("new")}
          </h2>
          <form
            onSubmit={submit}
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-white/50">
                {t("name")}
                <span aria-hidden="true" className="text-neon">
                  {" "}
                  *
                </span>
              </span>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                required
              />
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-white/50">{t("description")}</span>
              <textarea
                className={inputCls}
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">{t("style")}</span>
              <select
                className={inputCls}
                value={styleId}
                onChange={(e) => setStyleId(e.target.value)}
              >
                <option value="">—</option>
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">{t("level")}</span>
              <select
                className={inputCls}
                value={levelId}
                onChange={(e) => setLevelId(e.target.value)}
              >
                <option value="">—</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">{t("instructor")}</span>
              <select
                className={inputCls}
                value={instructorId}
                onChange={(e) => setInstructorId(e.target.value)}
              >
                <option value="">—</option>
                {instructors.map((i) => (
                  <option key={i.personId} value={i.personId}>
                    {i.name ?? i.personId.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">{t("quorum")}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className={inputCls}
                value={quorum}
                onChange={(e) => setQuorum(e.target.value)}
              />
              <span className="text-xs text-white/40">{t("quorumHint")}</span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">{t("dropIn")}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={500}
                className={inputCls}
                value={dropIn}
                onChange={(e) => setDropIn(e.target.value)}
                placeholder="8000"
              />
              <span className="text-xs text-white/40">{t("dropInHint")}</span>
            </label>

            {!editing && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-white/50">
                  {t("month")}
                  <span aria-hidden="true" className="text-neon">
                    {" "}
                    *
                  </span>
                </span>
                <input
                  type="month"
                  className={inputCls}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  required
                />
                <span className="text-xs text-white/40">{t("monthHint")}</span>
              </label>
            )}

            {types.length > 0 && (
              <fieldset className="flex flex-col gap-2 sm:col-span-2">
                <legend className="text-xs text-white/50">{t("types")}</legend>
                <div className="flex flex-wrap gap-2">
                  {types.map((ty) => (
                    <label
                      key={ty.id}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-night-700 bg-night-800 px-3 text-sm text-white"
                    >
                      <input
                        type="checkbox"
                        checked={typeIds.includes(ty.id)}
                        onChange={() => toggleType(ty.id)}
                        className="accent-neon"
                      />
                      {ty.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {!editing && (
              <fieldset className="flex flex-col gap-2 sm:col-span-2">
                <legend className="text-xs text-white/50">{t("slots")}</legend>
                <ul className="flex flex-col gap-2">
                  {slots.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-white/50">
                          {t("weekday")}
                        </span>
                        <select
                          className={inputCls}
                          value={s.weekday}
                          onChange={(e) =>
                            updateSlot(i, {
                              weekday: Number(e.target.value),
                            })
                          }
                        >
                          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                            <option key={d} value={d}>
                              {ta(`weekday.${d}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-white/50">
                          {t("start")}
                        </span>
                        <input
                          type="time"
                          className={inputCls}
                          value={s.startTime}
                          onChange={(e) =>
                            updateSlot(i, { startTime: e.target.value })
                          }
                          required
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-white/50">{t("end")}</span>
                        <input
                          type="time"
                          className={inputCls}
                          value={s.endTime}
                          onChange={(e) =>
                            updateSlot(i, { endTime: e.target.value })
                          }
                          required
                        />
                      </label>
                      <label className="flex w-24 flex-col gap-1">
                        <span className="text-xs text-white/50">
                          {t("capacity")}
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          className={inputCls}
                          value={s.capacity}
                          onChange={(e) =>
                            updateSlot(i, { capacity: e.target.value })
                          }
                          required
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t("removeSlot")}
                        disabled={slots.length <= 1}
                        onClick={() =>
                          setSlots((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        ✕
                      </Button>
                      {types.length > 0 && (
                        <div className="flex basis-full flex-wrap items-center gap-1.5">
                          <span className="text-xs text-white/40">
                            {t("slotTypes")}:
                          </span>
                          {types.map((ty) => (
                            <label
                              key={ty.id}
                              className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-night-700 bg-night-900 px-2 text-xs text-white"
                            >
                              <input
                                type="checkbox"
                                checked={s.typeIds.includes(ty.id)}
                                onChange={() => toggleSlotType(i, ty.id)}
                                className="accent-neon"
                              />
                              {ty.name}
                            </label>
                          ))}
                          <span className="text-xs text-white/40">
                            {t("slotTypesHint")}
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setSlots((prev) => [...prev, emptySlot()])}
                  >
                    + {t("addSlot")}
                  </Button>
                </div>
              </fieldset>
            )}

            {formError && (
              <p role="alert" className="text-sm text-red-400 sm:col-span-2">
                {formError}
              </p>
            )}

            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" size="sm" disabled={busy}>
                {busy
                  ? editing
                    ? tc("loading")
                    : t("creating")
                  : editing
                    ? t("save")
                    : t("create")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFormOpen(false);
                  resetForm();
                }}
              >
                {tc("cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {actionError}
        </p>
      )}

      {series.length === 0 ? (
        <p className="text-sm text-white/50">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {series.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-semibold">{s.name}</p>
                  {!s.active && <Badge variant="live">{t("inactive")}</Badge>}
                  <span className="text-xs capitalize text-white/50">
                    {monthLabel(s.month)}
                  </span>
                </div>
                {s.description && (
                  <p className="text-sm text-white/60">{s.description}</p>
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
                        className="flex items-center gap-2 text-sm text-white/70"
                      >
                        <span className="tabular-nums">
                          {ta(`weekday.${slot.weekday}`).slice(0, 3)}{" "}
                          {slot.startTime}–{slot.endTime} ·{" "}
                          {tClasses("spotsLeft", { count: slot.capacity })}
                          {slot.types.length > 0 &&
                            ` · ${slot.types.map((x) => x.type.name).join(" + ")}`}
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
                            ✕
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
                        setNsCapacity("");
                        setNsInstructor("");
                        setNsTypeIds([]);
                        setActionError(null);
                      }}
                    >
                      + {t("addSlot")}
                    </Button>
                  </div>
                )}
                {s.active && slotFormFor === s.id && (
                  <form
                    className="flex flex-wrap items-end gap-2 rounded-xl border border-night-700 bg-night-800 p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void addSlot(s);
                    }}
                  >
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-white/50">
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
                      <span className="text-xs text-white/50">
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
                      <span className="text-xs text-white/50">{t("end")}</span>
                      <input
                        type="time"
                        className={inputCls}
                        value={nsEnd}
                        onChange={(e) => setNsEnd(e.target.value)}
                        required
                      />
                    </label>
                    <label className="flex w-24 flex-col gap-1">
                      <span className="text-xs text-white/50">
                        {t("capacity")}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        className={inputCls}
                        value={nsCapacity}
                        onChange={(e) => setNsCapacity(e.target.value)}
                        placeholder={t("capacityOptional")}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-white/50">
                        {t("instructor")}
                      </span>
                      <select
                        className={inputCls}
                        value={nsInstructor}
                        onChange={(e) => setNsInstructor(e.target.value)}
                      >
                        <option value="">—</option>
                        {instructors.map((i) => (
                          <option key={i.personId} value={i.personId}>
                            {i.name ?? i.personId.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {types.length > 0 && (
                      <div className="flex w-full flex-wrap items-center gap-1.5">
                        <span className="text-xs text-white/40">
                          {t("slotTypes")}:
                        </span>
                        {types.map((ty) => (
                          <label
                            key={ty.id}
                            className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-night-700 bg-night-900 px-2 text-xs text-white"
                          >
                            <input
                              type="checkbox"
                              checked={nsTypeIds.includes(ty.id)}
                              onChange={() =>
                                setNsTypeIds((prev) => toggleIn(prev, ty.id))
                              }
                              className="accent-neon"
                            />
                            {ty.name}
                          </label>
                        ))}
                        <span className="text-xs text-white/40">
                          {t("slotTypesHint")}
                        </span>
                      </div>
                    )}
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
                    <p className="w-full text-xs text-white/40">
                      {t("addSlotHint")}
                    </p>
                  </form>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openEdit(s)}
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

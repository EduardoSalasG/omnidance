"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, Skeleton, XIcon } from "@/components/ui";
import {
  inputCls,
  readError,
  type AcademyInstructor,
  type NamedRef,
  type Series,
  type SeriesLevel,
  type SeriesStyle,
} from "./shared";

type SlotDraft = {
  // El horario solo fija día/horas - cupos (quórum) y modalidad son
  // atributos de la serie completa (spec academies/class-series).
  weekday: number;
  startTime: string;
  endTime: string;
};

const emptySlot = (): SlotDraft => ({
  weekday: 1,
  startTime: "19:00",
  endTime: "20:00",
});

/**
 * Formulario de serie de clases - vive en la página dedicada
 * /academia/series/nueva (crear) y ?edit=<seriesId> (editar). POST crea
 * la serie con sus slots; la vigencia es ilimitada hasta desactivarla
 * (el backend materializa una ventana rodante hoy → fin del mes
 * siguiente). PATCH solo acepta metadatos (no slots) - en modo edición
 * el fieldset de horarios se oculta. Los selects se alimentan de
 * GET /styles, GET /classes/catalogs y el detalle/directorio de academias.
 */
export function SeriesForm({
  academyId,
  editing,
}: {
  academyId: string;
  /** null = crear; serie precargada = editar. */
  editing: Series | null;
}) {
  const t = useTranslations("academySeries");
  const ta = useTranslations("academy");
  const tc = useTranslations("common");
  const router = useRouter();

  // ─── catálogos para los selects ───
  // null = fetch en vuelo → los selects quedan disabled y las chips de
  // types muestran skeleton; elegir contra un catálogo vacío dejaría
  // una selección que "salta" cuando llegan las options reales.
  const [styles, setStyles] = useState<SeriesStyle[] | null>(null);
  const [levels, setLevels] = useState<SeriesLevel[] | null>(null);
  const [types, setTypes] = useState<NamedRef[] | null>(null);
  const [instructors, setInstructors] = useState<AcademyInstructor[] | null>(
    null,
  );

  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [styleId, setStyleId] = useState(editing?.style?.id ?? "");
  const [levelId, setLevelId] = useState(editing?.level?.id ?? "");
  const [typeIds, setTypeIds] = useState<string[]>(
    editing ? editing.types.map((x) => x.type.id) : [],
  );
  const [instructorId, setInstructorId] = useState(editing?.instructorId ?? "");
  // Quórum opcional (override de serie) - string para el input controlado;
  // vacío = null = hereda el defaultQuorum de la academia.
  const [quorum, setQuorum] = useState(
    editing?.quorum != null ? String(editing.quorum) : "",
  );
  // Precio clase suelta (CLP) - vacío = null = no se vende suelta.
  const [dropIn, setDropIn] = useState(
    editing?.dropInPrice != null ? String(editing.dropInPrice) : "",
  );
  const [slots, setSlots] = useState<SlotDraft[]>([emptySlot()]);

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Éxito breve antes de volver al listado (que refetchea al montar).
  const [saved, setSaved] = useState(false);

  // Catálogos públicos + instructores de la academia. Si fallan se
  // resuelven a [] (selects habilitados con solo "·").
  useEffect(() => {
    apiFetch("/styles")
      .then(async (res) => (res.ok ? ((await res.json()) as SeriesStyle[]) : []))
      .then(setStyles)
      .catch(() => setStyles([]));
    apiFetch("/classes/catalogs")
      .then(async (res) =>
        res.ok
          ? ((await res.json()) as {
              levels: SeriesLevel[];
              types: NamedRef[];
            })
          : { levels: [], types: [] },
      )
      .then((c) => {
        setLevels(c.levels);
        setTypes(c.types);
      })
      .catch(() => {
        setLevels([]);
        setTypes([]);
      });
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

  function toggleType(id: string): void {
    setTypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
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
    if (!editing && slots.length === 0) return;
    const q = parsedQuorum();
    const drop = parsedDropIn();
    setBusy(true);
    setFormError(null);
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
              slots: slots.map((s) => ({
                weekday: s.weekday,
                startTime: s.startTime,
                endTime: s.endTime,
              })),
            }),
          });
      if (!res.ok) {
        setFormError((await readError(res)) ?? t("error"));
        return;
      }
      setSaved(true);
      setTimeout(() => router.push("/academia/series"), 1200);
    } catch {
      setFormError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      {saved ? (
        <p role="status" className="text-sm text-neon">
          {editing ? t("updated") : t("created")}
        </p>
      ) : (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            {editing ? t("editTitle") : t("newTitle")}
          </h2>
          <form
            onSubmit={submit}
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-ink/50">
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
              <span className="text-xs text-ink/50">{t("description")}</span>
              <textarea
                className={inputCls}
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("style")}</span>
              <select
                className={`${inputCls} disabled:opacity-50`}
                value={styleId}
                onChange={(e) => setStyleId(e.target.value)}
                disabled={styles === null}
                aria-busy={styles === null}
              >
                <option value="">·</option>
                {(styles ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("level")}</span>
              <select
                className={`${inputCls} disabled:opacity-50`}
                value={levelId}
                onChange={(e) => setLevelId(e.target.value)}
                disabled={levels === null}
                aria-busy={levels === null}
              >
                <option value="">·</option>
                {(levels ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("instructor")}</span>
              <select
                className={`${inputCls} disabled:opacity-50`}
                value={instructorId}
                onChange={(e) => setInstructorId(e.target.value)}
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

            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("quorum")}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className={inputCls}
                value={quorum}
                onChange={(e) => setQuorum(e.target.value)}
              />
              <span className="text-xs text-ink/40">{t("quorumHint")}</span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/50">{t("dropIn")}</span>
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
              <span className="text-xs text-ink/40">{t("dropInHint")}</span>
            </label>

            {types === null ? (
              /* Chips de modalidad en vuelo - skeleton con la forma de
                 las chips para que el fieldset no salte al resolver. */
              <fieldset
                aria-hidden="true"
                className="flex flex-col gap-2 sm:col-span-2"
              >
                <legend className="text-xs text-ink/50">
                  {t("types")}
                </legend>
                <div className="page-loading flex flex-wrap gap-2">
                  <Skeleton className="h-11 w-24 rounded-xl" />
                  <Skeleton className="h-11 w-28 rounded-xl" />
                  <Skeleton className="h-11 w-20 rounded-xl" />
                </div>
              </fieldset>
            ) : (
              types.length > 0 && (
              <fieldset className="flex flex-col gap-2 sm:col-span-2">
                <legend className="text-xs text-ink/50">{t("types")}</legend>
                <div className="flex flex-wrap gap-2">
                  {types.map((ty) => (
                    <label
                      key={ty.id}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-elevated px-3 text-sm text-ink"
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
              )
            )}

            {!editing && (
              <fieldset className="flex flex-col gap-2 sm:col-span-2">
                <legend className="text-xs text-ink/50">{t("slots")}</legend>
                <ul className="flex flex-col gap-2">
                  {slots.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-ink/50">
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
                        <span className="text-xs text-ink/50">
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
                        <span className="text-xs text-ink/50">{t("end")}</span>
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
                        <XIcon className="h-4 w-4" />
                      </Button>
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

            {/* Sin Cancelar: el abort lo da el ‹ back del chrome
                (appbar/ConsoleHeader) en móvil y desktop. */}
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
            </div>
          </form>
        </>
      )}
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon, SkeletonText } from "@/components/ui";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { readError, type NamedRef, type SeriesLevel } from "./shared";

// Chip del editor: mismo lenguaje visual que los toggles de
// género (pills con aria-pressed, activo neon).
const chipBase =
  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50";

type Catalogs = { levels: SeriesLevel[]; types: NamedRef[] };
type LoadState = "loading" | "ready" | "error";

/**
 * Editor de niveles del alumno por tipo de clase (spec
 * academies/enrollment-levels): por cada ClassType un grupo de chips
 * de selección única (un nivel por tipo). PATCH
 * /enrollments/:id/levels reemplaza el set completo: se envían todos
 * los tipos del catálogo para que un tipo sin marca quede vacío.
 *
 * Solo lo ve quien puede mutar el enrollment (cap `students`: owner,
 * ADMIN o staff; el padre decide); el alumno nunca se auto-nivela.
 */
export function EnrollmentLevelsEditor({
  enrollmentId,
  academyId,
  initialLevels = [],
}: {
  enrollmentId: string;
  /** Academia del alumno: las opciones de nivel son su línea efectiva
   *  (custom si tiene, global si no - spec academies/class-levels). */
  academyId: string;
  /** Niveles vigentes del alumno (viene del GET de ficha): el editor
   *  abre con la marca actual, no vacío. */
  initialLevels?: { classTypeId: string; levelId: string }[];
}) {
  const t = useTranslations("academy.levels.editor");
  const tc = useTranslations("common");

  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  // Selección por tipo: typeId → levelIds marcados.
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const l of initialLevels) {
      (init[l.classTypeId] ??= []).push(l.levelId);
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/classes/catalogs?academyId=${academyId}`);
      if (!res.ok) {
        setState("error");
        return;
      }
      setCatalogs((await res.json()) as Catalogs);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Un solo nivel por tipo (spec: el alumno no acumula niveles del
  // mismo tipo - evita conteos duplicados en "Niveles y cupos").
  // Clic en el marcado lo desmarca → sin nivel en ese tipo.
  function toggle(typeId: string, levelId: string) {
    setSelected((prev) => {
      const cur = prev[typeId] ?? [];
      const next = cur.includes(levelId) ? [] : [levelId];
      return { ...prev, [typeId]: next };
    });
  }

  async function save() {
    if (!catalogs || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/enrollments/${enrollmentId}/levels`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Reemplazo completo: van todos los tipos; el que quedó sin
          // marca viaja con levelIds [] y limpia ese tipo en el server.
          levels: catalogs.types.map((ty) => ({
            classTypeId: ty.id,
            levelIds: selected[ty.id] ?? [],
          })),
        }),
      });
      if (!res.ok) {
        setNotice({
          text: (await readError(res)) ?? t("saveError"),
          error: true,
        });
        return;
      }
      // El server devuelve el set persistido: se adopta como verdad.
      const updated = (await res.json()) as {
        levels: { classTypeId: string; levelIds: string[] }[];
      };
      setSelected(
        Object.fromEntries(
          updated.levels.map((l) => [l.classTypeId, l.levelIds]),
        ),
      );
      setNotice({ text: t("saved") });
    } catch {
      setNotice({ text: t("saveError"), error: true });
    } finally {
      setSaving(false);
    }
  }

  if (state === "loading") {
    return (
      <section aria-label={t("title")}>
        <SkeletonText lines={3} />
      </section>
    );
  }
  if (state === "error" || !catalogs) {
    return (
      <section
        aria-label={t("title")}
        className="flex items-center gap-3"
      >
        <p role="alert" className="text-sm text-ink/60">
          {t("loadError")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </section>
    );
  }
  if (catalogs.types.length === 0 || catalogs.levels.length === 0) {
    return null;
  }

  return (
    <section aria-label={t("title")} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("title")}
      </h3>
      <Card className="flex flex-col gap-4 p-4">
        <p className="text-xs text-ink/50">{t("hint")}</p>
        {catalogs.types.map((ty) => {
          const marked = selected[ty.id] ?? [];
          return (
            <fieldset key={ty.id} className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">{ty.name}</legend>
              <div className="flex flex-wrap gap-2">
                {catalogs.levels.map((lv) => {
                  const active = marked.includes(lv.id);
                  return (
                    <button
                      key={lv.id}
                      type="button"
                      aria-pressed={active}
                      disabled={saving}
                      onClick={() => toggle(ty.id, lv.id)}
                      className={`${chipBase} ${
                        active
                          ? "border-neon bg-neon/15 text-neon"
                          : "border-line bg-elevated text-ink/70 hover:text-ink"
                      }`}
                    >
                      {lv.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => void save()}
          >
            {t("save")}
          </Button>
        </div>
      </Card>
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </section>
  );
}

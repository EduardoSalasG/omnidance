"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, Spinner, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { ActionNotice } from "@/components/ui/action-notice";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { inputCls, readError } from "@/components/academy/shared";

type Level = { id: string; name: string; order: number };

type LevelsResp = {
  custom: Level[];
  global: Level[];
  usingGlobal: boolean;
};

/**
 * /academia/niveles - mantenedor de la línea de niveles de la academia.
 * La academia decide cuántos niveles tiene y cómo se llaman; sin niveles
 * propios hereda la línea global que el negocio edita en /admin/catalogos
 * (y que usan los sociales de la app). El insight de cupos numera los
 * chips 1..N en este orden.
 */
export default function AcademiaNivelesPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => <LevelsModule key={academy.id} academyId={academy.id} />}
      </AcademyGate>
    </main>
  );
}

function LevelsModule({ academyId }: { academyId: string }) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const [data, setData] = useState<LevelsResp | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(
    null,
  );

  const load = useCallback(async () => {
    const res = await apiFetch(`/academies/${academyId}/class-levels`);
    if (!res.ok) {
      setNotice({ text: t("levelsConfig.error"), error: true });
      return;
    }
    setData((await res.json()) as LevelsResp);
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setNotice(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setNotice({
        text: e instanceof Error ? e.message : t("levelsConfig.error"),
        error: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const personalize = () =>
    act(async () => {
      for (const l of data?.global ?? []) {
        await apiFetch(`/academies/${academyId}/class-levels`, {
          method: "POST",
          body: JSON.stringify({ name: l.name, order: l.order }),
        });
      }
      setNotice({ text: t("levelsConfig.personalized") });
    });

  // Reset a la línea global (spec academies/class-levels): un solo
  // DELETE bulk. Si algún nivel está en uso el server responde 409 con
  // los nombres - el mensaje viaja tal cual al ActionNotice.
  const resetToGlobal = () =>
    act(async () => {
      const res = await apiFetch(`/academies/${academyId}/class-levels`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setNotice({
          text: (await readError(res)) ?? t("levelsConfig.error"),
          error: true,
        });
        return;
      }
      setNotice({ text: t("levelsConfig.backToGlobalDone") });
    }).finally(() => setConfirmReset(false));

  if (!data) {
    // Error de carga: el aviso queda visible sobre el skeleton en vez
    // de quedar cargando para siempre.
    return (
      <div className="flex flex-col gap-4">
        {notice ? (
          <ActionNotice
            notice={notice}
            onDismiss={() => setNotice(null)}
          />
        ) : null}
        {notice?.error ? (
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        ) : (
          <SkeletonList />
        )}
      </div>
    );
  }

  const levels = data.usingGlobal ? [] : (data.custom ?? []);

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <ActionNotice
          notice={notice}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      {data.usingGlobal ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm text-ink/70">
            {t("levelsConfig.globalHint")}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {data.global.map((l, i) => (
              <li
                key={l.id}
                className="rounded-full border border-line px-3 py-1 text-xs text-ink/70"
              >
                {i + 1} · {l.name}
              </li>
            ))}
          </ul>
          <div>
            <Button size="sm" onClick={personalize} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : null}
              {t("levelsConfig.personalize")}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-xs text-ink/50">{t("levelsConfig.customHint")}</p>
          <ul className="flex flex-col gap-2">
            {levels.map((l, i) => (
              <LevelRow
                key={l.id}
                level={l}
                index={i}
                disabled={saving}
                onRename={(name) =>
                  act(async () => {
                    await apiFetch(
                      `/academies/${academyId}/class-levels/${l.id}`,
                      {
                        method: "PATCH",
                        body: JSON.stringify({ name }),
                      },
                    );
                  })
                }
                onDelete={() =>
                  act(async () => {
                    await apiFetch(
                      `/academies/${academyId}/class-levels/${l.id}`,
                      { method: "DELETE" },
                    );
                  })
                }
              />
            ))}
          </ul>
          <form
            className="flex items-center gap-2 border-t border-line/50 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newName.trim();
              if (!name) return;
              void act(async () => {
                await apiFetch(`/academies/${academyId}/class-levels`, {
                  method: "POST",
                  body: JSON.stringify({ name }),
                });
                setNewName("");
              });
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("levelsConfig.newPlaceholder")}
              className={inputCls}
            />
            <Button type="submit" size="sm" disabled={saving || !newName.trim()}>
              {saving ? <Spinner className="h-4 w-4" /> : null}
              {t("levelsConfig.add")}
            </Button>
          </form>
          {/* Zona destructiva al pie (patrón de consolas): volver a la
              línea global borra todos los niveles propios de una vez. */}
          <div className="flex justify-center border-t border-line/50 pt-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirmReset(true)}
              className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-red-400/80 transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon disabled:opacity-50"
            >
              {t("levelsConfig.backToGlobal")}
            </button>
          </div>
        </Card>
      )}

      <ConfirmSheet
        open={confirmReset}
        title={t("levelsConfig.backToGlobal")}
        description={t("levelsConfig.backToGlobalBody", {
          count: levels.length,
        })}
        confirmLabel={t("levelsConfig.backToGlobal")}
        busy={saving}
        onConfirm={() => void resetToGlobal()}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}

function LevelRow({
  level,
  index,
  disabled,
  onRename,
  onDelete,
}: {
  level: Level;
  index: number;
  disabled: boolean;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const t = useTranslations("academy");
  const [name, setName] = useState(level.name);

  return (
    <li className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-center text-xs font-bold text-ink/40">
        {index + 1}
      </span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const v = name.trim();
          if (v && v !== level.name) void onRename(v);
        }}
        className={`${inputCls} flex-1`}
        aria-label={t("levelsConfig.nameLabel", { index: index + 1 })}
      />
      <button
        type="button"
        onClick={() => void onDelete()}
        disabled={disabled}
        aria-label={t("levelsConfig.delete")}
        className="shrink-0 rounded-full border border-line px-2.5 py-1.5 text-xs text-ink/50 transition-colors hover:border-error/60 hover:text-error"
      >
        ×
      </button>
    </li>
  );
}

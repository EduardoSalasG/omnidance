"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, ChevronRightIcon, ConfirmSheet, RefreshIcon, SkeletonList, Spinner } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { ActionNotice, type ActionNoticeData } from "@/components/ui/action-notice";
import { readError } from "@/components/academy/shared";
import { Link } from "@/i18n/navigation";
import { loadLevels, type LevelsResp } from "./levels";

/**
 * /academia/configuracion/niveles - mantenedor de la línea de niveles
 * de la academia. La academia decide cuántos niveles tiene y cómo se
 * llaman; sin niveles propios hereda la línea global que el negocio
 * edita en /admin/catalogos (y que usan los sociales de la app). El
 * insight de cupos numera los chips 1..N en este orden.
 * Listado solo navegable: la fila abre /niveles/[id] (editar +
 * eliminar); el alta vive en /niveles/nuevo (console-patterns §1-2).
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

type Phase = "loading" | "forbidden" | "error" | "ready";

function LevelsModule({ academyId }: { academyId: string }) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<LevelsResp | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

  const load = useCallback(async () => {
    const res = await loadLevels(academyId);
    if (res.kind === "ok") {
      setData(res.data);
      setPhase("ready");
      return;
    }
    setPhase(res.kind === "forbidden" ? "forbidden" : "error");
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Adopta la línea global como propia: copia cada nivel global con su
  // orden y la academia pasa a modo custom (editable nivel a nivel).
  const personalize = async () => {
    setSaving(true);
    setNotice(null);
    try {
      for (const l of data?.global ?? []) {
        const res = await apiFetch(`/academies/${academyId}/class-levels`, {
          method: "POST",
          body: JSON.stringify({ name: l.name, order: l.order }),
        });
        if (!res.ok) {
          throw new Error((await readError(res)) ?? t("levelsConfig.error"));
        }
      }
      setNotice({ text: t("levelsConfig.personalized") });
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

  // Reset a la línea global (spec academies/class-levels): un solo
  // DELETE bulk. Si algún nivel está en uso el server responde 409 con
  // los nombres - el mensaje viaja tal cual al ActionNotice.
  const resetToGlobal = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/class-levels`, {
        method: "DELETE",
      });
      setConfirmReset(false);
      if (!res.ok) {
        setNotice({
          text: (await readError(res)) ?? t("levelsConfig.error"),
          error: true,
        });
        return;
      }
      setNotice({ text: t("levelsConfig.backToGlobalDone") });
      await load();
    } catch {
      setConfirmReset(false);
      setNotice({ text: t("levelsConfig.error"), error: true });
    } finally {
      setSaving(false);
    }
  };

  if (phase === "loading") return <SkeletonList />;

  if (phase === "error") {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  if (phase === "forbidden") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-ink/70">{t("settings.forbidden")}</p>
        <Button variant="secondary" href="/academia">
          {tc("back")}
        </Button>
      </div>
    );
  }

  const levels = data?.usingGlobal ? [] : (data?.custom ?? []);

  return (
    <div className="flex flex-col gap-6">
      {data?.usingGlobal ? (
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
            <Button size="sm" onClick={() => void personalize()} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : null}
              {t("levelsConfig.personalize")}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {/* CTA de alta a la derecha (convención planes/promos) - el
              listado solo navega; crear vive en /niveles/nuevo. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink/50">{t("levelsConfig.customHint")}</p>
            <Button
              size="sm"
              className="shrink-0 whitespace-nowrap"
              href="/academia/configuracion/niveles/nuevo"
            >
              + {t("levelsConfig.addLevel")}
            </Button>
          </div>
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {levels.map((l, i) => (
                <li key={l.id}>
                  <Link
                    href={`/academia/configuracion/niveles/${l.id}`}
                    className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neon"
                  >
                    {/* El índice numera los chips de filtros y agenda
                        (1..N en este orden). */}
                    <span className="w-6 shrink-0 text-center text-xs font-bold tabular-nums text-ink/40">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {l.name}
                    </span>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* Zona destructiva a nivel colección (console-patterns §4):
          volver a la línea global borra todos los niveles propios de
          una vez - div centrado, border-t, ghost rojo + ConfirmSheet. */}
      {!data?.usingGlobal && (
        <div className="flex justify-center border-t border-line pt-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300"
            disabled={saving}
            onClick={() => setConfirmReset(true)}
          >
            {t("levelsConfig.backToGlobal")}
          </Button>
        </div>
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

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}

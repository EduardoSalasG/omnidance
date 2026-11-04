"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, ConfirmSheet, RefreshIcon, SkeletonList, Spinner } from "@/components/ui";
import {
  ActionNotice,
  showActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls, readError } from "@/components/academy/shared";
import { useRouter } from "@/i18n/navigation";
import { loadLevels, type Level } from "../levels";

/**
 * /academia/configuracion/niveles/[id] - edición de un nivel propio:
 * nombre + zona roja "Eliminar nivel" (console-patterns §4). PATCH /
 * DELETE /academies/:id/class-levels/:levelId - el 409 "en uso" (series
 * o alumnos) del delete llega al ActionNotice con el texto del server.
 */
export default function LevelDetailPage() {
  const t = useTranslations("academy");
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/academia/configuracion/niveles"
        backLabel={t("configPages.levels")}
      />
      <AcademyGate>
        {({ academy }) => (
          <LevelDetail
            key={`${academy.id}:${params.id}`}
            academyId={academy.id}
            levelId={params.id}
          />
        )}
      </AcademyGate>
    </main>
  );
}

type Phase = "loading" | "forbidden" | "error" | "notFound" | "ready";

function LevelDetail({
  academyId,
  levelId,
}: {
  academyId: string;
  levelId: string;
}) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  // Posición 1..N en la línea (la numeración que ven los chips).
  const [index, setIndex] = useState(0);
  const [level, setLevel] = useState<Level | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const res = await loadLevels(academyId);
    if (res.kind !== "ok") {
      setPhase(res.kind === "forbidden" ? "forbidden" : "error");
      return;
    }
    const idx = res.data.custom.findIndex((l) => l.id === levelId);
    if (idx < 0) {
      setPhase("notFound");
      return;
    }
    setIndex(idx);
    setLevel(res.data.custom[idx]);
    setName(res.data.custom[idx].name);
    setNotice(null);
    setPhase("ready");
  }, [academyId, levelId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!level || busy || !name.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/class-levels/${level.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        },
      );
      if (!res.ok) {
        setNotice({
          text: (await readError(res)) ?? t("levelsConfig.error"),
          error: true,
        });
        return;
      }
      showActionNotice({ text: t("levelsConfig.saved") });
      router.push("/academia/configuracion/niveles");
    } catch {
      setNotice({ text: t("levelsConfig.error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!level) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/class-levels/${level.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        // 409 = nivel en uso (series/alumnos): el owner lo lee y lo
        // libera antes de reintentar - la ficha se queda abierta.
        setConfirmDelete(false);
        setNotice({
          text: (await readError(res)) ?? t("levelsConfig.error"),
          error: true,
        });
        return;
      }
      // Aviso global: la navegación desmonta esta página.
      showActionNotice({ text: t("levelsConfig.deleted") });
      router.push("/academia/configuracion/niveles");
    } catch {
      setConfirmDelete(false);
      setNotice({ text: t("levelsConfig.error"), error: true });
    } finally {
      setBusy(false);
    }
  }

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
        <Button
          variant="secondary"
          href="/academia/configuracion/niveles"
        >
          {tc("back")}
        </Button>
      </div>
    );
  }

  if (phase === "notFound") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-ink/60">{t("levelsConfig.notFound")}</p>
        <Button
          variant="secondary"
          size="sm"
          href="/academia/configuracion/niveles"
        >
          {tc("back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-lg font-semibold">
            {t("levelsConfig.editTitle")}
          </h2>
          <Badge variant="muted" className="tabular-nums">
            {index + 1}
          </Badge>
        </div>
        <Card className="p-4">
          <form onSubmit={save} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink/60">
                {t("levelsConfig.fieldName")}
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("levelsConfig.newPlaceholder")}
                maxLength={60}
                required
                className={inputCls}
              />
            </label>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button type="submit" size="sm" disabled={!name.trim() || busy}>
                {busy ? <Spinner size="sm" /> : null}
                {tc("save")}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {/* Zona destructiva al pie (console-patterns §4): div centrado
          separado por border-t, ghost rojo + ConfirmSheet. El 409 "en
          uso" del server se muestra en el ActionNotice. */}
      <div className="flex justify-center border-t border-line pt-6">
        <Button
          variant="ghost"
          size="sm"
          className="text-red-400 hover:text-red-300"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
        >
          {t("levelsConfig.delete")}
        </Button>
      </div>

      <ConfirmSheet
        open={confirmDelete}
        title={t("levelsConfig.deleteConfirm")}
        description={level?.name}
        confirmLabel={t("levelsConfig.delete")}
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDelete(false)}
      />

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}

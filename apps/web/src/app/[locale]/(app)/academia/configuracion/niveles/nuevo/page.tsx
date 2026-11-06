"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon, SkeletonList, Spinner } from "@/components/ui";
import {
  ActionNotice,
  showActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyTierGate } from "@/components/academy/academy-tier-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls, readError } from "@/components/academy/shared";
import { useRouter } from "@/i18n/navigation";
import { loadLevels, type LevelsResp } from "../levels";

/**
 * /academia/configuracion/niveles/nuevo - alta de un nivel propio de la
 * academia. POST /academies/:id/class-levels (el server lo agrega al
 * final de la línea: order = último + 1). La edición y el delete viven
 * en /configuracion/niveles/[id].
 * Si la academia aún usa la línea global no se puede "agregar" suelto:
 * primero personaliza la línea (copia los globales como propios) y
 * recién ahí el form tiene sentido.
 */
export default function LevelNewPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/academia/configuracion/niveles"
        backLabel={t("configPages.levels")}
      />
      <AcademyGate>
        {({ academy }) => (
          <AcademyTierGate academy={academy} feature="classes">
            <LevelCreate key={academy.id} academyId={academy.id} />
          </AcademyTierGate>
        )}
      </AcademyGate>
    </main>
  );
}

type Phase = "loading" | "forbidden" | "error" | "global" | "ready";

function LevelCreate({ academyId }: { academyId: string }) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<LevelsResp | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

  const load = useCallback(async () => {
    const res = await loadLevels(academyId);
    if (res.kind !== "ok") {
      setPhase(res.kind === "forbidden" ? "forbidden" : "error");
      return;
    }
    setData(res.data);
    setPhase(res.data.usingGlobal ? "global" : "ready");
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Adopta la línea global como propia (misma operación del listado):
  // copia cada nivel global con su orden; después el form queda activo.
  async function personalize() {
    if (!data || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      for (const l of data.global) {
        const res = await apiFetch(`/academies/${academyId}/class-levels`, {
          method: "POST",
          // Mismo fix que el listado: sin JSON header el body no se
          // parsea y el server valida name vacío.
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: l.name, order: l.order }),
        });
        if (!res.ok) {
          throw new Error((await readError(res)) ?? t("levelsConfig.error"));
        }
      }
      showActionNotice({ text: t("levelsConfig.personalized") });
      await load();
    } catch (e) {
      setNotice({
        text: e instanceof Error ? e.message : t("levelsConfig.error"),
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/class-levels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        // 409 = nombre duplicado: el mensaje del server viaja tal cual.
        setNotice({
          text: (await readError(res)) ?? t("levelsConfig.error"),
          error: true,
        });
        return;
      }
      showActionNotice({ text: t("levelsConfig.created") });
      router.push("/academia/configuracion/niveles");
    } catch {
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

  if (phase === "global") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1 text-sm text-ink/70">
          <p>{t("levelsConfig.globalHint")}</p>
          <p>{t("levelsConfig.globalHintCustom")}</p>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {data?.global.map((l, i) => (
            <li
              key={l.id}
              className="rounded-full border border-line px-3 py-1 text-xs text-ink/70"
            >
              {i + 1} · {l.name}
            </li>
          ))}
        </ul>
        <div>
          <Button size="sm" onClick={() => void personalize()} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {t("levelsConfig.personalize")}
          </Button>
        </div>
        <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("levelsConfig.addLevel")}
      </h2>
      <form onSubmit={create} className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink/60">{t("levelsConfig.fieldName")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("levelsConfig.newPlaceholder")}
            maxLength={60}
            required
            className={inputCls}
          />
        </label>
        <p className="text-xs text-ink/50">{t("levelsConfig.customHint")}</p>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!name.trim() || busy}>
            {busy ? <Spinner size="sm" /> : null}
            {t("levelsConfig.add")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            href="/academia/configuracion/niveles"
          >
            {tc("cancel")}
          </Button>
        </div>
      </form>
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </Card>
  );
}

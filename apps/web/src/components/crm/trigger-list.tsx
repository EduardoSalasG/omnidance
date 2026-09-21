"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import type {
  CrmActor,
  CrmTrigger,
  TriggerEvalResult,
} from "./types";
import { actorBody, actorQuery } from "./types";

/**
 * Cards de triggers del actor (GET /crm/triggers?actor). El cron diario
 * evalúa los activos; aquí se puede forzar con POST /triggers/evaluate y
 * pausar/activar con PATCH {active}. No hay DELETE en el controller.
 */
export function TriggerList({
  actor,
  reloadSignal,
  onEdit,
  onLoaded,
}: {
  actor: CrmActor;
  /** Incrementar para forzar refetch (tras crear/editar). */
  reloadSignal: number;
  onEdit: (trigger: CrmTrigger) => void;
  /** Reporta las keys ya creadas tras cada fetch (para el form de creación). */
  onLoaded?: (keys: string[]) => void;
}) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");

  const [items, setItems] = useState<CrmTrigger[] | null>(null);
  const [error, setError] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<Record<
    string,
    TriggerEvalResult
  > | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/crm/triggers?${actorQuery(actor)}`);
      if (!res.ok) {
        setError(true);
        setItems([]);
        return;
      }
      const data = (await res.json()) as CrmTrigger[];
      setItems(data);
      onLoaded?.(data.map((tr) => tr.key));
    } catch {
      setError(true);
      setItems([]);
    }
  }, [actor, onLoaded]);

  useEffect(() => {
    setItems(null);
    setEvalResult(null);
    void load();
  }, [load, reloadSignal]);

  async function toggle(tr: CrmTrigger) {
    if (toggling) return;
    setToggling(tr.id);
    try {
      const res = await apiFetch(`/crm/triggers/${tr.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !tr.active }),
      });
      if (!res.ok) return setError(true);
      setItems((xs) =>
        (xs ?? []).map((x) =>
          x.id === tr.id ? { ...x, active: !tr.active } : x,
        ),
      );
    } catch {
      setError(true);
    } finally {
      setToggling(null);
    }
  }

  async function evaluate() {
    if (evaluating) return;
    setEvaluating(true);
    setEvalResult(null);
    try {
      const res = await apiFetch("/crm/triggers/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actorBody(actor)),
      });
      if (!res.ok) return setError(true);
      setEvalResult(
        (await res.json()) as Record<string, TriggerEvalResult>,
      );
    } catch {
      setError(true);
    } finally {
      setEvaluating(false);
    }
  }

  if (items === null && !error) {
    return <PageLoading />;
  }

  return (
    <section className="flex flex-col gap-4" aria-label={t("triggers.title")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("triggers.title")}
        </h2>
        <Button
          size="sm"
          variant="secondary"
          disabled={evaluating}
          onClick={() => void evaluate()}
        >
          {evaluating ? t("triggers.evaluating") : `▶ ${t("triggers.evaluate")}`}
        </Button>
      </div>

      <div aria-live="polite">
        {evalResult !== null && (
          <ul className="flex flex-col gap-1 text-sm text-neon">
            {Object.entries(evalResult).map(([k, r]) => (
              <li key={k}>
                {t("triggers.evalResult", {
                  key: t.has(`triggers.keys.${k}`)
                    ? t(`triggers.keys.${k}`)
                    : k,
                  evaluated: r.evaluated,
                  notified: r.notified,
                })}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {items !== null && items.length === 0 && !error && (
        <p className="text-white/60">{t("triggers.empty")}</p>
      )}

      {items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((tr) => {
            const cfg = (tr.config ?? {}) as Record<string, unknown>;
            return (
              <li key={tr.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {t.has(`triggers.keys.${tr.key}`)
                        ? t(`triggers.keys.${tr.key}`)
                        : tr.key}
                    </span>
                    <Badge variant={tr.active ? "neon" : "muted"}>
                      {tr.active
                        ? t("triggers.active")
                        : t("triggers.inactive")}
                    </Badge>
                    {cfg.days != null && (
                      <Badge variant="outline">
                        {t("triggers.days")}: {String(cfg.days)}
                      </Badge>
                    )}
                    {cfg.cooldownDays != null && (
                      <Badge variant="outline">
                        {t("triggers.cooldownShort", {
                          days: String(cfg.cooldownDays),
                        })}
                      </Badge>
                    )}
                  </div>
                  {t.has(`triggers.desc.${tr.key}`) && (
                    <p className="text-xs text-white/50">
                      {t(`triggers.desc.${tr.key}`)}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={tr.active}
                      disabled={toggling !== null}
                      onClick={() => void toggle(tr)}
                      className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border text-sm font-semibold transition ${
                        tr.active
                          ? "border-neon/60 bg-neon/10 text-neon"
                          : "border-night-700 bg-night-900 text-white/60"
                      }`}
                    >
                      {tr.active
                        ? t("triggers.active")
                        : t("triggers.inactive")}
                    </button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => onEdit(tr)}
                    >
                      {t("triggers.edit")}
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

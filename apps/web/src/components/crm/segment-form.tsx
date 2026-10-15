"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, Spinner, XIcon } from "@/components/ui";
import type {
  CrmActor,
  CrmRuleCondition,
  CrmSegment,
  CrmSegmentRules,
  RuleField,
} from "./types";
import { RULE_FIELDS, RULE_OPS, SEGMENTS, actorBody } from "./types";

const inputCls =
  "min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-sm " +
  "text-ink focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50";

const NUMERIC_FIELDS = new Set<string>([
  "score",
  "attendanceRecent",
  "weeklyStreak",
  "monthsContinuous",
  "purchases",
  "earlyPurchases",
  "tenure",
  "referrals",
  "spend",
]);

function emptyCondition(): CrmRuleCondition {
  return { field: "score", op: "gte", value: "" };
}

/**
 * Builder de reglas de ActorSegment → POST /crm/segments o PATCH /:id.
 * Fila de condición = campo + operador + valor (numérico, select de
 * segmento computado o texto de tag según el campo). Preview en vivo
 * vía POST /crm/segments/preview (debounce 400ms).
 */
export function SegmentForm({
  actor,
  editing,
  onSaved,
  onCancel,
}: {
  actor: CrmActor;
  /** Segmento en edición (PATCH); null = creación. */
  editing: CrmSegment | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");

  const [name, setName] = useState(editing?.name ?? "");
  const [match, setMatch] = useState<"all" | "any">(
    editing?.rules?.match ?? "all",
  );
  const [conditions, setConditions] = useState<CrmRuleCondition[]>(
    editing?.rules?.conditions?.length
      ? editing.rules.conditions.map((c) => ({ ...c }))
      : [emptyCondition()],
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const rules: CrmSegmentRules = { match, conditions };
  const conditionsValid = conditions.every(
    (c) => String(c.value).trim() !== "",
  );
  const valid = name.trim() !== "" && conditions.length > 0 && conditionsValid;

  const runPreview = useCallback(
    async (r: CrmSegmentRules) => {
      setPreviewing(true);
      try {
        const res = await apiFetch("/crm/segments/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...actorBody(actor), rules: r }),
        });
        if (!res.ok) {
          setPreview(null);
          return;
        }
        const data = (await res.json()) as { count: number };
        setPreview(data.count);
      } catch {
        setPreview(null);
      } finally {
        setPreviewing(false);
      }
    },
    [actor],
  );

  useEffect(() => {
    if (!conditionsValid) {
      setPreview(null);
      return;
    }
    const id = setTimeout(() => void runPreview(rules), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, JSON.stringify(conditions), conditionsValid, runPreview]);

  function patchCondition(i: number, patch: Partial<CrmRuleCondition>) {
    setConditions((prev) =>
      prev.map((c, j) => {
        if (j !== i) return c;
        const next = { ...c, ...patch };
        // Al cambiar de campo el op/value anteriores pueden no valer.
        if (patch.field && patch.field !== c.field) {
          next.op = RULE_OPS[patch.field as RuleField][0];
          next.value = "";
        }
        return next;
      }),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFormError(null);
    const payload = {
      name: name.trim(),
      rules: {
        match,
        conditions: conditions.map((c) => ({
          field: c.field,
          op: c.op,
          value: NUMERIC_FIELDS.has(c.field) ? Number(c.value) : c.value,
        })),
      },
    };
    try {
      const res = editing
        ? await apiFetch(`/crm/segments/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch("/crm/segments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...actorBody(actor), ...payload }),
          });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        setFormError(body?.message ?? tc("error"));
        return;
      }
      onSaved();
    } catch {
      setFormError(tc("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-ink/70">
            {t("actorSegments.name")}
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("actorSegments.namePlaceholder")}
            className={inputCls}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm text-ink/70">
            {t("actorSegments.match")}
          </span>
          <select
            value={match}
            onChange={(e) => setMatch(e.target.value as "all" | "any")}
            className={inputCls}
          >
            <option value="all">{t("actorSegments.matchAll")}</option>
            <option value="any">{t("actorSegments.matchAny")}</option>
          </select>
        </label>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm text-ink/70">
            {t("actorSegments.conditions")}
          </legend>
          {conditions.map((c, i) => {
            const ops = RULE_OPS[c.field as RuleField] ?? RULE_OPS.score;
            return (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-xl border border-line p-3 sm:flex-row sm:items-end"
              >
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs text-ink/50">
                    {t("actorSegments.field")}
                  </span>
                  <select
                    value={c.field}
                    onChange={(e) =>
                      patchCondition(i, {
                        field: e.target.value as RuleField,
                      })
                    }
                    className={inputCls}
                  >
                    {RULE_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {t(`actorSegments.fields.${f}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs text-ink/50">
                    {t("actorSegments.op")}
                  </span>
                  <select
                    value={c.op}
                    onChange={(e) => patchCondition(i, { op: e.target.value })}
                    className={inputCls}
                  >
                    {ops.map((o) => (
                      <option key={o} value={o}>
                        {t(`actorSegments.ops.${o}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs text-ink/50">
                    {t("actorSegments.value")}
                  </span>
                  {c.field === "segment" ? (
                    <select
                      value={String(c.value)}
                      onChange={(e) =>
                        patchCondition(i, { value: e.target.value })
                      }
                      className={inputCls}
                    >
                      <option value="">{t("actorSegments.pickValue")}</option>
                      {SEGMENTS.map((s) => (
                        <option key={s} value={s}>
                          {t(`segments.${s}`)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={
                        NUMERIC_FIELDS.has(c.field) ? "number" : "text"
                      }
                      inputMode={
                        NUMERIC_FIELDS.has(c.field) ? "numeric" : undefined
                      }
                      value={c.value}
                      onChange={(e) =>
                        patchCondition(i, { value: e.target.value })
                      }
                      placeholder={
                        c.field === "tag"
                          ? t("actorSegments.tagPlaceholder")
                          : undefined
                      }
                      className={inputCls}
                    />
                  )}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("actorSegments.removeCondition")}
                  disabled={conditions.length <= 1}
                  onClick={() =>
                    setConditions((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="text-red-400 hover:text-red-300"
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setConditions((prev) => [...prev, emptyCondition()])
              }
            >
              {t("actorSegments.addCondition")}
            </Button>
          </div>
        </fieldset>

        <p className="text-sm text-ink/60" aria-live="polite">
          {previewing
            ? t("actorSegments.previewing")
            : preview !== null
              ? t("actorSegments.previewCount", { count: preview })
              : conditionsValid
                ? ""
                : t("actorSegments.previewHint")}
        </p>

        {formError && (
          <p role="alert" className="text-sm text-red-400">
            {formError}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" className="flex-1" disabled={!valid || saving}>
            {saving ? <Spinner className="h-4 w-4" /> : tc("save")}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

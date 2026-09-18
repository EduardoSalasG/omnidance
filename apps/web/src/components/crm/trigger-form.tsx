"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import type { CrmActor, CrmTrigger, CrmTriggerKey } from "./types";
import {
  CRM_TRIGGER_KEYS,
  TRIGGER_KEYS_WITH_DAYS,
  actorBody,
} from "./types";

const inputCls =
  "min-h-11 w-full rounded-lg border border-night-700 bg-night-950 px-3 text-sm " +
  "text-white focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50";

function numOrUndef(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Form de trigger → POST /crm/triggers {key, config} o PATCH /:id {config}.
 * El service solo interpreta config.days (umbral de WINBACK/TRIAL_EXPIRING/
 * ATTENDANCE_DROP) y config.cooldownDays (anti-spam de todos).
 */
export function TriggerForm({
  actor,
  existingKeys,
  editing,
  onSaved,
  onCancel,
}: {
  actor: CrmActor;
  /** Keys ya creadas — el select solo ofrece las que faltan. */
  existingKeys: string[];
  /** Trigger en edición (PATCH config); null = creación. */
  editing: CrmTrigger | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");

  const availableKeys = CRM_TRIGGER_KEYS.filter(
    (k) => !existingKeys.includes(k),
  );
  const [key, setKey] = useState<CrmTriggerKey>(
    (editing?.key as CrmTriggerKey | undefined) ??
      availableKeys[0] ??
      "WINBACK",
  );
  const cfg = (editing?.config ?? {}) as Record<string, unknown>;
  const [days, setDays] = useState(
    cfg.days != null ? String(cfg.days) : "",
  );
  const [cooldownDays, setCooldownDays] = useState(
    cfg.cooldownDays != null ? String(cfg.cooldownDays) : "",
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(false);

  const showDays = TRIGGER_KEYS_WITH_DAYS.has(key);
  const valid = editing !== null || availableKeys.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFormError(false);

    const config: Record<string, number> = {};
    const d = numOrUndef(days);
    const cd = numOrUndef(cooldownDays);
    if (d !== undefined) config.days = d;
    if (cd !== undefined) config.cooldownDays = cd;

    try {
      const res = editing
        ? await apiFetch(`/crm/triggers/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ config }),
          })
        : await apiFetch("/crm/triggers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...actorBody(actor), key, config }),
          });
      if (!res.ok) return setFormError(true);
      onSaved();
    } catch {
      setFormError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {editing === null ? (
          <label className="flex flex-col gap-2">
            <span className="text-sm text-white/70">{t("triggers.key")}</span>
            <select
              value={key}
              onChange={(e) => setKey(e.target.value as CrmTriggerKey)}
              className={inputCls}
            >
              {availableKeys.map((k) => (
                <option key={k} value={k}>
                  {t(`triggers.keys.${k}`)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="font-semibold">
            {t.has(`triggers.keys.${editing.key}`)
              ? t(`triggers.keys.${editing.key}`)
              : editing.key}
          </p>
        )}

        {t.has(`triggers.desc.${key}`) && (
          <p className="text-xs text-white/50">{t(`triggers.desc.${key}`)}</p>
        )}

        {showDays && (
          <label className="flex flex-col gap-2">
            <span className="text-sm text-white/70">{t("triggers.days")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className={inputCls}
            />
            <span className="text-xs text-white/50">
              {t("triggers.daysHint")}
            </span>
          </label>
        )}

        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">
            {t("triggers.cooldownDays")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={cooldownDays}
            onChange={(e) => setCooldownDays(e.target.value)}
            className={inputCls}
          />
        </label>

        {formError && (
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" className="flex-1" disabled={!valid || saving}>
            {saving ? tc("loading") : tc("save")}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import type {
  CrmActor,
  CrmSegment,
  CrmTrigger,
  CrmTriggerKey,
  SegmentTriggerAction,
} from "./types";
import {
  CRM_TRIGGER_KEYS,
  EVENT_TRIGGER_KEYS,
  SEGMENT_TRIGGER_ACTIONS,
  TRIGGER_ACTOR_TYPES,
  TRIGGER_KEYS_WITH_DAYS,
  actorBody,
  actorQuery,
} from "./types";

const inputCls =
  "min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-sm " +
  "text-ink focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50";

function numOrUndef(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Form de trigger → POST /crm/triggers {key, config} o PATCH /:id {config}.
 * - Keys por fecha (WINBACK/TRIAL_EXPIRING/REGULAR_NO_PRESALE/
 *   ATTENDANCE_DROP): config {days?, cooldownDays?}.
 * - Keys por evento (SEGMENT_ENTER/EXIT, spec crm-dynamic-segments):
 *   config {segmentId, action:{type,title?,body?,tag?}} — corren en el
 *   recompute de scores cuando alguien entra/sale del segmento.
 */
export function TriggerForm({
  actor,
  existingKeys,
  editing,
  onSaved,
  onCancel,
}: {
  actor: CrmActor;
  /** Keys ya creadas - el select solo ofrece las que faltan. */
  existingKeys: string[];
  /** Trigger en edición (PATCH config); null = creación. */
  editing: CrmTrigger | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");

  // Keys aplicables al actor: las restringidas por alcance
  // (TRIGGER_ACTOR_TYPES, spec crm-trigger-actor-scope) no se ofrecen.
  const availableKeys = CRM_TRIGGER_KEYS.filter(
    (k) =>
      !existingKeys.includes(k) &&
      (TRIGGER_ACTOR_TYPES[k]?.includes(actor.actorType) ?? true),
  );
  const [key, setKey] = useState<CrmTriggerKey>(
    (editing?.key as CrmTriggerKey | undefined) ??
      availableKeys[0] ??
      "WINBACK",
  );
  const cfg = (editing?.config ?? {}) as Record<string, unknown>;
  const editAction = (cfg.action ?? {}) as Record<string, unknown>;
  const [days, setDays] = useState(
    cfg.days != null ? String(cfg.days) : "",
  );
  const [cooldownDays, setCooldownDays] = useState(
    cfg.cooldownDays != null ? String(cfg.cooldownDays) : "",
  );
  // Config de keys por evento.
  const [segmentId, setSegmentId] = useState(
    typeof cfg.segmentId === "string" ? cfg.segmentId : "",
  );
  const [actionType, setActionType] = useState<SegmentTriggerAction>(
    (typeof editAction.type === "string"
      ? editAction.type
      : "NOTIFY") as SegmentTriggerAction,
  );
  const [actTitle, setActTitle] = useState(
    typeof editAction.title === "string" ? editAction.title : "",
  );
  const [actBody, setActBody] = useState(
    typeof editAction.body === "string" ? editAction.body : "",
  );
  const [actTag, setActTag] = useState(
    typeof editAction.tag === "string" ? editAction.tag : "",
  );
  const [segments, setSegments] = useState<CrmSegment[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(false);

  const isEventKey = EVENT_TRIGGER_KEYS.has(key);
  const showDays = TRIGGER_KEYS_WITH_DAYS.has(key);

  // El picker de segmento solo se carga cuando la key lo pide.
  useEffect(() => {
    if (!isEventKey || segments !== null) return;
    let cancelled = false;
    apiFetch(`/crm/segments?${actorQuery(actor)}`)
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        setSegments((await res.json()) as CrmSegment[]);
      })
      .catch(() => {
        if (!cancelled) setSegments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isEventKey, segments, actor]);

  const needsTitle = actionType === "NOTIFY";
  const needsTag = actionType === "TAG_ADD" || actionType === "TAG_REMOVE";
  const eventValid = segmentId !== "" && (!needsTitle || actTitle.trim() !== "") &&
    (!needsTag || actTag.trim() !== "");
  const valid =
    (editing !== null || availableKeys.length > 0) &&
    (!isEventKey || eventValid);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFormError(false);

    let config: Record<string, unknown>;
    if (isEventKey) {
      const action: Record<string, unknown> = { type: actionType };
      if (needsTitle) {
        action.title = actTitle.trim();
        if (actBody.trim()) action.body = actBody.trim();
      }
      if (actionType === "NOTIFY_OWNER") {
        if (actTitle.trim()) action.title = actTitle.trim();
        if (actBody.trim()) action.body = actBody.trim();
      }
      if (needsTag) action.tag = actTag.trim();
      config = { segmentId, action };
    } else {
      config = {};
      const d = numOrUndef(days);
      const cd = numOrUndef(cooldownDays);
      if (d !== undefined) config.days = d;
      if (cd !== undefined) config.cooldownDays = cd;
    }

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
            <span className="text-sm text-ink/70">{t("triggers.key")}</span>
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
          <p className="text-xs text-ink/50">{t(`triggers.desc.${key}`)}</p>
        )}

        {showDays && (
          <label className="flex flex-col gap-2">
            <span className="text-sm text-ink/70">{t("triggers.days")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className={inputCls}
            />
            <span className="text-xs text-ink/50">
              {t("triggers.daysHint")}
            </span>
          </label>
        )}

        {isEventKey && (
          <>
            <label className="flex flex-col gap-2">
              <span className="text-sm text-ink/70">
                {t("triggers.segment")}
              </span>
              <select
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                className={inputCls}
              >
                <option value="">
                  {t("triggers.pickSegment")}
                </option>
                {(segments ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {segments !== null && segments.length === 0 && (
                <span className="text-xs text-ink/50">
                  {t("triggers.noSegments")}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-ink/70">
                {t("triggers.action")}
              </span>
              <select
                value={actionType}
                onChange={(e) =>
                  setActionType(e.target.value as SegmentTriggerAction)
                }
                className={inputCls}
              >
                {SEGMENT_TRIGGER_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {t(`triggers.actions.${a}`)}
                  </option>
                ))}
              </select>
            </label>

            {(needsTitle || actionType === "NOTIFY_OWNER") && (
              <>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-ink/70">
                    {t("triggers.notifyTitle")}
                  </span>
                  <input
                    type="text"
                    value={actTitle}
                    onChange={(e) => setActTitle(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-ink/70">
                    {t("triggers.notifyBody")}
                  </span>
                  <input
                    type="text"
                    value={actBody}
                    onChange={(e) => setActBody(e.target.value)}
                    className={inputCls}
                  />
                </label>
              </>
            )}

            {needsTag && (
              <label className="flex flex-col gap-2">
                <span className="text-sm text-ink/70">
                  {t("triggers.tag")}
                </span>
                <input
                  type="text"
                  value={actTag}
                  onChange={(e) => setActTag(e.target.value)}
                  className={inputCls}
                />
              </label>
            )}
          </>
        )}

        {!isEventKey && (
          <label className="flex flex-col gap-2">
            <span className="text-sm text-ink/70">
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
        )}

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

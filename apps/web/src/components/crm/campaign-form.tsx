"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ENROLLMENT_STATUSES } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { Button, Card, CheckIcon } from "@/components/ui";
import type { CampaignSegment, CrmActor, CrmPersonRow } from "./types";
import { SEGMENTS, actorBody, actorQuery } from "./types";

const inputCls =
  "min-h-11 w-full rounded-lg border border-night-700 bg-night-950 px-3 text-sm " +
  "text-white focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50";

/**
 * Form de campaña → POST /crm/campaigns (queda DRAFT; el envío es acción
 * aparte). Body real: {actorType, actorId, name, segment, action} - segment
 * une {segment?, tags?, personIds?} (OR); action es NOTIFY{title,body?} o
 * DISCOUNT_CODE{percentOff|amountOff, maxUses?, expiresAt?}.
 */
export function CampaignForm({
  actor,
  onCreated,
  onCancel,
}: {
  actor: CrmActor;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");

  const [name, setName] = useState("");
  const [actionType, setActionType] = useState<"NOTIFY" | "DISCOUNT_CODE">(
    "NOTIFY",
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [percentOff, setPercentOff] = useState("");
  const [amountOff, setAmountOff] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [segment, setSegment] = useState("");
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [pickedPeople, setPickedPeople] = useState<string[]>([]);
  const [people, setPeople] = useState<CrmPersonRow[]>([]);
  const [allStudents, setAllStudents] = useState(false);
  const [pickedStatuses, setPickedStatuses] = useState<string[]>([]);
  const [planId, setPlanId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);
  const [seriesList, setSeriesList] = useState<
    { id: string; name: string; month: string }[]
  >([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(false);

  const isAcademy = actor.actorType === "ACADEMY";

  // Tags existentes del actor para sugerir audiencia (vienen en las rows);
  // las mismas rows alimentan el picker de personas específicas.
  useEffect(() => {
    let cancelled = false;
    void apiFetch(`/crm/people?${actorQuery(actor)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (cancelled) return;
        const typed = rows as CrmPersonRow[];
        setPeople(typed);
        const set = new Set<string>();
        for (const row of typed) {
          for (const tg of row.tags) set.add(tg.tag);
        }
        setAvailableTags([...set].sort((a, b) => a.localeCompare(b, "es")));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [actor]);

  // Planes y series de la academia para los selects de audiencia.
  useEffect(() => {
    if (!isAcademy) return;
    let cancelled = false;
    void apiFetch(`/academies/${actor.actorId}/plans`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!cancelled) setPlans(rows as { id: string; name: string }[]);
      })
      .catch(() => {});
    void apiFetch(`/academies/${actor.actorId}/series`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!cancelled) {
          setSeriesList(
            rows as { id: string; name: string; month: string }[],
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [actor, isAcademy]);

  // percentOff XOR amountOff - misma regla que parseAction del service.
  const percent = percentOff === "" ? null : Number(percentOff);
  const amount = amountOff === "" ? null : Number(amountOff);
  const discountValid =
    actionType !== "DISCOUNT_CODE" ||
    ((percent !== null && percent >= 1 && percent <= 100) !==
      (amount !== null && amount >= 1));
  const notifyValid = actionType !== "NOTIFY" || title.trim() !== "";
  const valid = name.trim() !== "" && notifyValid && discountValid;

  // Audiencia = unión (OR) de todos los criterios marcados - mismo shape
  // que parseSegment del service.
  const audience: CampaignSegment = {
    ...(segment ? { segment } : {}),
    ...(pickedTags.length ? { tags: pickedTags } : {}),
    ...(pickedPeople.length ? { personIds: pickedPeople } : {}),
    ...(allStudents ? { allStudents: true } : {}),
    ...(pickedStatuses.length ? { enrollmentStatus: pickedStatuses } : {}),
    ...(planId ? { planId } : {}),
    ...(seriesId ? { seriesId } : {}),
  };
  const noAudience = Object.keys(audience).length === 0;
  const audienceJson = JSON.stringify(audience);

  // Conteo de audiencia en vivo (debounced) - sin criterios no se llama.
  useEffect(() => {
    const seg = JSON.parse(audienceJson) as CampaignSegment;
    setPreviewCount(null); // no mostrar conteo de criterios anteriores
    if (Object.keys(seg).length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void apiFetch("/crm/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...actorBody(actor), segment: seg }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { count: number } | null) => {
          if (!cancelled) setPreviewCount(d?.count ?? null);
        })
        .catch(() => {
          if (!cancelled) setPreviewCount(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [audienceJson, actor]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFormError(false);
    try {
      const res = await apiFetch("/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...actorBody(actor),
          name: name.trim(),
          segment: audience,
          action:
            actionType === "NOTIFY"
              ? {
                  type: "NOTIFY",
                  title: title.trim(),
                  ...(body.trim() ? { body: body.trim() } : {}),
                }
              : {
                  type: "DISCOUNT_CODE",
                  ...(percent !== null ? { percentOff: percent } : {}),
                  ...(amount !== null ? { amountOff: amount } : {}),
                  ...(maxUses !== "" ? { maxUses: Number(maxUses) } : {}),
                  ...(expiresAt !== ""
                    ? { expiresAt: new Date(expiresAt).toISOString() }
                    : {}),
                },
        }),
      });
      if (!res.ok) return setFormError(true);
      onCreated();
    } catch {
      setFormError(true);
    } finally {
      setSaving(false);
    }
  }

  const tagToggle = (tag: string) =>
    setPickedTags((p) =>
      p.includes(tag) ? p.filter((x) => x !== tag) : [...p, tag],
    );

  const statusToggle = (st: string) =>
    setPickedStatuses((p) =>
      p.includes(st) ? p.filter((x) => x !== st) : [...p, st],
    );

  const personToggle = (id: string) =>
    setPickedPeople((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );

  const chipCls = (on: boolean) =>
    `inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-xs transition ${
      on ? "border-neon bg-neon/15 text-neon" : "border-white/15 text-white/60"
    }`;

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">
            {t("campaigns.name")}
            <span aria-hidden="true" className="text-neon"> *</span>
          </span>
          <input
            type="text"
            required
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("campaigns.namePlaceholder")}
            className={inputCls}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">
            {t("campaigns.actionType")}
          </span>
          <select
            value={actionType}
            onChange={(e) =>
              setActionType(e.target.value as "NOTIFY" | "DISCOUNT_CODE")
            }
            className={inputCls}
          >
            <option value="NOTIFY">{t("campaigns.types.NOTIFY")}</option>
            <option value="DISCOUNT_CODE">
              {t("campaigns.types.DISCOUNT_CODE")}
            </option>
          </select>
        </label>

        {actionType === "NOTIFY" && (
          <>
            <label className="flex flex-col gap-2">
              <span className="text-sm text-white/70">
                {t("campaigns.notifyTitle")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                type="text"
                required
                autoComplete="off"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm text-white/70">
                {t("campaigns.notifyBody")}
              </span>
              <textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className={`${inputCls} min-h-[80px] py-3`}
              />
            </label>
          </>
        )}

        {actionType === "DISCOUNT_CODE" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-white/70">
                  {t("campaigns.percentOff")}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  disabled={amountOff !== ""}
                  value={percentOff}
                  onChange={(e) => setPercentOff(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm text-white/70">
                  {t("campaigns.amountOff")}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  disabled={percentOff !== ""}
                  value={amountOff}
                  onChange={(e) => setAmountOff(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-white/70">
                  {t("campaigns.maxUses")}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm text-white/70">
                  {t("campaigns.expiresAt")}
                </span>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
          </>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm text-white/70">
            {t("campaigns.audience")}
          </legend>
          <label className="flex flex-col gap-2">
            <span className="text-xs text-white/50">
              {t("campaigns.audienceSegment")}
            </span>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className={inputCls}
            >
              <option value="">-</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {t(`segments.${s}`)}
                </option>
              ))}
            </select>
          </label>
          {availableTags.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-white/50">
                {t("campaigns.audienceTags")}
              </span>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const on = pickedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={on}
                      onClick={() => tagToggle(tag)}
                      className={chipCls(on)}
                    >
                      {on && <CheckIcon className="h-3.5 w-3.5" />}
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-white/50">{t("campaigns.noTags")}</p>
          )}

          {isAcademy && (
            <div className="flex flex-col gap-3">
              <span className="text-xs text-white/50">
                {t("campaigns.audienceStudents")}
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={allStudents}
                  onClick={() => setAllStudents((v) => !v)}
                  className={chipCls(allStudents)}
                >
                  {allStudents && <CheckIcon className="h-3.5 w-3.5" />}
                  {t("campaigns.allStudents")}
                </button>
                {ENROLLMENT_STATUSES.map((st) => {
                  const on = pickedStatuses.includes(st);
                  return (
                    <button
                      key={st}
                      type="button"
                      aria-pressed={on}
                      onClick={() => statusToggle(st)}
                      className={chipCls(on)}
                    >
                      {on && <CheckIcon className="h-3.5 w-3.5" />}
                      {t(`campaigns.enrollmentStatus.${st}`)}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-xs text-white/50">
                    {t("campaigns.byPlan")}
                  </span>
                  <select
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{t("campaigns.anyPlan")}</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs text-white/50">
                    {t("campaigns.bySeries")}
                  </span>
                  <select
                    value={seriesId}
                    onChange={(e) => setSeriesId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{t("campaigns.anySeries")}</option>
                    {seriesList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.month}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {people.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-white/50">
                    {t("campaigns.pickPeople")}
                  </span>
                  <ul className="max-h-44 overflow-y-auto rounded-lg border border-night-700 bg-night-950">
                    {people.map((row) => (
                      <li key={row.personId}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm text-white/80 transition hover:bg-white/5">
                          <input
                            type="checkbox"
                            checked={pickedPeople.includes(row.personId)}
                            onChange={() => personToggle(row.personId)}
                            className="size-4 accent-neon"
                          />
                          {row.person?.name ?? row.personId}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {noAudience ? (
            <p className="text-xs text-amber-400">
              {t("campaigns.noCriterion")}
            </p>
          ) : previewCount !== null ? (
            <p
              className={`text-xs ${
                previewCount > 0 ? "text-neon" : "text-amber-400"
              }`}
              aria-live="polite"
            >
              {previewCount > 0
                ? t("campaigns.reachCount", { count: previewCount })
                : t("campaigns.reachEmpty")}
            </p>
          ) : null}
        </fieldset>

        {formError && (
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" className="flex-1" disabled={!valid || saving}>
            {saving ? tc("loading") : tc("create")}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

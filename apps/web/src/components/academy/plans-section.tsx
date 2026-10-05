"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag, Spinner } from "@/components/ui";
import {
  PLAN_TYPES,
  inputCls,
  readError,
  type MembershipPlan,
  type PlanType,
} from "./shared";

type Props = {
  academyId: string;
  plans: MembershipPlan[];
  onChanged: () => Promise<void>;
};

/**
 * Planes de membresía. POST crea; PATCH /academies/:id/plans/:planId
 * edita (nombre, tipo, precio, classCount, periodDays, description,
 * active). Si el plan ya tiene espejo en Flow (flowPlanId) el backend
 * empuja plans/edit antes de guardar y bloquea el cambio de `type`
 * (Flow no admite cambiar el intervalo de un plan existente).
 */
export function PlansSection({ academyId, plans, onChanged }: Props) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const tp = useTranslations("producer");

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingPlan = plans.find((p) => p.id === editingId) ?? null;
  const [name, setName] = useState("");
  const [type, setType] = useState<PlanType>("MONTHLY");
  const [price, setPrice] = useState("");
  const [classCount, setClassCount] = useState("");
  const [weeklyClasses, setWeeklyClasses] = useState("");
  const [periodDays, setPeriodDays] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(p: MembershipPlan) {
    setEditingId(p.id);
    setName(p.name);
    setType(p.type);
    setPrice(String(p.price));
    setClassCount(p.classCount != null ? String(p.classCount) : "");
    setWeeklyClasses(p.weeklyClasses != null ? String(p.weeklyClasses) : "");
    setPeriodDays(p.periodDays != null ? String(p.periodDays) : "");
    setDescription(p.description.join("\n"));
    setActive(p.active);
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setType("MONTHLY");
    setPrice("");
    setClassCount("");
    setWeeklyClasses("");
    setPeriodDays("");
    setDescription("");
    setActive(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(
        editingPlan
          ? `/academies/${academyId}/plans/${editingPlan.id}`
          : `/academies/${academyId}/plans`,
        {
          method: editingPlan ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            type,
            price: Number.parseInt(price, 10) || 0,
            // En edición, vacío = limpiar (null); en creación se omite.
            ...(classCount.trim()
              ? { classCount: Number.parseInt(classCount, 10) }
              : editingPlan
                ? { classCount: null }
                : {}),
            ...(weeklyClasses.trim()
              ? { weeklyClasses: Number.parseInt(weeklyClasses, 10) }
              : editingPlan
                ? { weeklyClasses: null }
                : {}),
            ...(periodDays.trim()
              ? { periodDays: Number.parseInt(periodDays, 10) }
              : editingPlan
                ? { periodDays: null }
                : {}),
            // Una línea del textarea = un bullet del <ul> público
            description: description
              .split("\n")
              .map((d) => d.trim())
              .filter(Boolean),
            ...(editingPlan ? { active } : {}),
          }),
        },
      );
      if (!res.ok) {
        setError((await readError(res)) ?? tc("error"));
        return;
      }
      resetForm();
      await onChanged();
    } catch {
      setError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {plans.length === 0 ? (
        <p className="text-sm text-white/50">·</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {plans.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  {p.classCount != null && (
                    <p className="text-xs text-white/50">
                      {t("planClasses")}: {p.classCount}
                    </p>
                  )}
                  {p.weeklyClasses != null && (
                    <p className="text-xs text-white/50">
                      {t("planWeeklyCount", { count: p.weeklyClasses })}
                    </p>
                  )}
                  {p.description.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-white/60">
                      {p.description.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {t.has(`planTypes.${p.type}`)
                      ? t(`planTypes.${p.type}`)
                      : p.type}
                  </Badge>
                  {p.active ? (
                    <Badge variant="neon">{t("status.ACTIVE")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("planInactive")}</Badge>
                  )}
                  <PriceTag amount={p.price} />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => startEdit(p)}
                  >
                    {t("editPlan")}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {editingPlan ? t("editPlan") : t("newPlan")}
        </h3>
        <form
          onSubmit={submit}
          className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">
              {t("planName")}
              <span aria-hidden="true" className="text-neon"> *</span>
            </span>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">{tp("type")}</span>
            <select
              className={inputCls}
              value={type}
              onChange={(e) => setType(e.target.value as PlanType)}
              disabled={!!editingPlan?.flowPlanId}
            >
              {PLAN_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {t.has(`planTypes.${pt}`) ? t(`planTypes.${pt}`) : pt}
                </option>
              ))}
            </select>
            {editingPlan?.flowPlanId && (
              <span className="text-xs text-white/40">
                {t("planTypeLocked")}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">
              {t("planPrice")}
              <span aria-hidden="true" className="text-neon"> *</span>
            </span>
            <input
              className={inputCls}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">{t("planClasses")}</span>
            <input
              className={inputCls}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={classCount}
              onChange={(e) => setClassCount(e.target.value)}
            />
          </label>
          {/* Cuota semanal: solo la usan los planes por tiempo
              (mensual/trimestral/semestral); packs llevan classCount. */}
          {(type === "MONTHLY" ||
            type === "QUARTERLY" ||
            type === "SEMIANNUAL") && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">
                {t("planWeeklyClasses")}
              </span>
              <input
                className={inputCls}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={weeklyClasses}
                onChange={(e) => setWeeklyClasses(e.target.value)}
              />
            </label>
          )}
          {/* Vigencia custom: solo el tipo PERIOD la usa (los calendario
              se derivan del tipo al pagar). */}
          {type === "PERIOD" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">
                {t("planPeriodDays")}
              </span>
              <input
                className={inputCls}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={periodDays}
                onChange={(e) => setPeriodDays(e.target.value)}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-white/50">{t("planDesc")}</span>
            <textarea
              className={inputCls}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("planDescPlaceholder")}
            />
          </label>
          {editingPlan && (
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 accent-neon"
              />
              <span className="text-sm text-white/70">
                {t("planActive")}
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-400 sm:col-span-2">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? (
                <Spinner size="sm" label={tc("loading")} />
              ) : editingPlan ? (
                tc("save")
              ) : (
                tc("create")
              )}
            </Button>
            {editingPlan && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={resetForm}
              >
                {tc("cancel")}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

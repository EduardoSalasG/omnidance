"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, Spinner } from "@/components/ui";
import {
  PLAN_TYPES,
  inputCls,
  readError,
  type MembershipPlan,
  type PlanType,
} from "./shared";

/**
 * Formulario de plan de membresía - vive en la página dedicada
 * /academia/planes/nueva (crear) y ?edit=<planId> (editar). POST crea;
 * PATCH /academies/:id/plans/:planId edita. Si el plan ya tiene espejo
 * en Flow (flowPlanId) el backend bloquea el cambio de `type` (Flow no
 * admite cambiar el intervalo de un plan existente) y el select queda
 * disabled con el hint correspondiente.
 */
export function PlanForm({
  academyId,
  plan,
}: {
  academyId: string;
  /** null = crear; plan precargado = editar. */
  plan: MembershipPlan | null;
}) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const tp = useTranslations("producer");
  const router = useRouter();

  const [name, setName] = useState(plan?.name ?? "");
  const [type, setType] = useState<PlanType>(plan?.type ?? "MONTHLY");
  const [price, setPrice] = useState(plan ? String(plan.price) : "");
  const [classCount, setClassCount] = useState(
    plan?.classCount != null ? String(plan.classCount) : "",
  );
  const [weeklyClasses, setWeeklyClasses] = useState(
    plan?.weeklyClasses != null ? String(plan.weeklyClasses) : "",
  );
  const [periodDays, setPeriodDays] = useState(
    plan?.periodDays != null ? String(plan.periodDays) : "",
  );
  const [description, setDescription] = useState(
    plan ? plan.description.join("\n") : "",
  );
  const [active, setActive] = useState(plan?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Éxito breve antes de volver al listado (que refetchea al montar).
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(
        plan
          ? `/academies/${academyId}/plans/${plan.id}`
          : `/academies/${academyId}/plans`,
        {
          method: plan ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            type,
            price: Number.parseInt(price, 10) || 0,
            // En edición, vacío = limpiar (null); en creación se omite.
            ...(classCount.trim()
              ? { classCount: Number.parseInt(classCount, 10) }
              : plan
                ? { classCount: null }
                : {}),
            ...(weeklyClasses.trim()
              ? { weeklyClasses: Number.parseInt(weeklyClasses, 10) }
              : plan
                ? { weeklyClasses: null }
                : {}),
            ...(periodDays.trim()
              ? { periodDays: Number.parseInt(periodDays, 10) }
              : plan
                ? { periodDays: null }
                : {}),
            // Una línea del textarea = un bullet del <ul> público
            description: description
              .split("\n")
              .map((d) => d.trim())
              .filter(Boolean),
            ...(plan ? { active } : {}),
          }),
        },
      );
      if (!res.ok) {
        setError((await readError(res)) ?? tc("error"));
        return;
      }
      setSaved(true);
      setTimeout(() => router.push("/academia/planes"), 1200);
    } catch {
      setError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      {saved ? (
        <p role="status" className="text-sm text-neon">
          {t("planSaved")}
        </p>
      ) : (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {plan ? t("editPlan") : t("newPlan")}
          </h2>
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
                disabled={!!plan?.flowPlanId}
              >
                {PLAN_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {t.has(`planTypes.${pt}`) ? t(`planTypes.${pt}`) : pt}
                  </option>
                ))}
              </select>
              {plan?.flowPlanId && (
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
            {plan && (
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
                ) : plan ? (
                  tc("save")
                ) : (
                  tc("create")
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => router.push("/academia/planes")}
              >
                {tc("cancel")}
              </Button>
            </div>
          </form>
        </>
      )}
    </Card>
  );
}

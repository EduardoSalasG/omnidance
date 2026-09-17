"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag } from "@/components/ui";
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
 * Planes de membresía. POST /academies/:id/plans exige `type` (PlanType);
 * el DTO no acepta `active` (default true en schema) ni edición — v1 solo crea.
 */
export function PlansSection({ academyId, plans, onChanged }: Props) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const tp = useTranslations("producer");

  const [name, setName] = useState("");
  const [type, setType] = useState<PlanType>("MONTHLY");
  const [price, setPrice] = useState("");
  const [classCount, setClassCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          price: Number.parseInt(price, 10) || 0,
          ...(classCount.trim()
            ? { classCount: Number.parseInt(classCount, 10) }
            : {}),
        }),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? tc("error"));
        return;
      }
      setName("");
      setPrice("");
      setClassCount("");
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
        <p className="text-sm text-white/40">—</p>
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
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{p.type}</Badge>
                  {p.active && (
                    <Badge variant="neon">{t("status.ACTIVE")}</Badge>
                  )}
                  <PriceTag amount={p.price} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("newPlan")}
        </h3>
        <form
          onSubmit={submit}
          className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">{t("planName")}</span>
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
            >
              {PLAN_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {pt}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">{t("planPrice")}</span>
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
          {error && (
            <p role="alert" className="text-sm text-red-400 sm:col-span-2">
              {error}
            </p>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? tc("loading") : tc("create")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

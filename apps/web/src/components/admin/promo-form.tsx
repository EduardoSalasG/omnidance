"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, Spinner } from "@/components/ui";
import { inputCls, readError } from "@/components/academy/shared";
import {
  PromoActorPicker,
  type PickedActor,
} from "@/components/admin/promo-actor-picker";

export type PromoPayload = {
  name: string;
  kind: "ACADEMY" | "PRODUCER" | null;
  discountType: "PERCENT" | "FIXED_CLP";
  percentOff: number | null;
  amountOffClp: number | null;
  validFrom: string;
  validUntil: string;
  maxCycles: number | null;
  enabled: boolean;
  academies: PickedActor[];
  producers: PickedActor[];
};

/** datetime-local ↔ ISO (el input trabaja en hora local). */
const toInput = (iso: string) => iso.slice(0, 16);
const toIso = (v: string) => (v ? new Date(v).toISOString() : "");

/**
 * Formulario crear/editar de PlatformPromo (spec platform-promos) -
 * compartido por /admin/facturacion/promos/nueva y la ficha [id].
 */
export function PromoForm({
  initial,
  submitLabel,
  onSubmit,
  busy,
}: {
  initial: PromoPayload;
  submitLabel: string;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const t = useTranslations("admin.promos");
  const [form, setForm] = useState<PromoPayload>(initial);
  const set = <K extends keyof PromoPayload>(k: K, v: PromoPayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      kind: form.kind ?? undefined,
      discountType: form.discountType,
      percentOff:
        form.discountType === "PERCENT" ? (form.percentOff ?? undefined) : null,
      amountOffClp:
        form.discountType === "FIXED_CLP"
          ? (form.amountOffClp ?? undefined)
          : null,
      validFrom: toIso(form.validFrom),
      validUntil: toIso(form.validUntil),
      maxCycles: form.maxCycles ?? undefined,
      enabled: form.enabled,
      academyIds: form.academies.map((a) => a.id),
      producerIds: form.producers.map((p) => p.id),
    };
    await onSubmit(body);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink/50">
          {t("name")}
          <span aria-hidden="true" className="text-neon"> *</span>
        </span>
        <input
          className={inputCls}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          required
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">{t("kind")}</span>
          <select
            className={inputCls}
            value={form.kind ?? ""}
            onChange={(e) =>
              set("kind", (e.target.value || null) as PromoPayload["kind"])
            }
          >
            <option value="">{t("kindAll")}</option>
            <option value="ACADEMY">{t("kindAcademy")}</option>
            <option value="PRODUCER">{t("kindProducer")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">{t("discountType")}</span>
          <select
            className={inputCls}
            value={form.discountType}
            onChange={(e) =>
              set("discountType", e.target.value as PromoPayload["discountType"])
            }
          >
            <option value="PERCENT">{t("discountPercent")}</option>
            <option value="FIXED_CLP">{t("discountFixed")}</option>
          </select>
        </label>
      </div>

      {form.discountType === "PERCENT" ? (
        <label className="flex w-32 flex-col gap-1">
          <span className="text-xs text-ink/50">{t("percentOff")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            className={inputCls}
            value={form.percentOff ?? ""}
            onChange={(e) =>
              set("percentOff", Number.parseInt(e.target.value, 10) || null)
            }
            required
          />
        </label>
      ) : (
        <label className="flex w-40 flex-col gap-1">
          <span className="text-xs text-ink/50">{t("amountOffClp")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className={inputCls}
            value={form.amountOffClp ?? ""}
            onChange={(e) =>
              set("amountOffClp", Number.parseInt(e.target.value, 10) || null)
            }
            required
          />
        </label>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">{t("validFrom")}</span>
          <input
            type="datetime-local"
            className={inputCls}
            value={toInput(form.validFrom)}
            onChange={(e) => set("validFrom", e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">{t("validUntil")}</span>
          <input
            type="datetime-local"
            className={inputCls}
            value={toInput(form.validUntil)}
            onChange={(e) => set("validUntil", e.target.value)}
            required
          />
        </label>
      </div>

      <label className="flex w-40 flex-col gap-1">
        <span className="text-xs text-ink/50">{t("maxCycles")}</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          className={inputCls}
          value={form.maxCycles ?? ""}
          onChange={(e) =>
            set("maxCycles", Number.parseInt(e.target.value, 10) || null)
          }
        />
        <span className="text-xs text-ink/40">{t("maxCyclesHint")}</span>
      </label>

      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink/80">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
          className="h-4 w-4 shrink-0 accent-neon"
        />
        {t("enabled")}
      </label>

      <PromoActorPicker
        entity="academies"
        label={t("academies")}
        placeholder={t("searchAcademy")}
        selected={form.academies}
        onChange={(academies) => set("academies", academies)}
      />
      <PromoActorPicker
        entity="people"
        label={t("producers")}
        placeholder={t("searchProducer")}
        selected={form.producers}
        onChange={(producers) => set("producers", producers)}
      />
      <p className="text-xs text-ink/40">{t("whitelistHint")}</p>

      <div>
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Spinner size="sm" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export const EMPTY_PROMO: PromoPayload = {
  name: "",
  kind: null,
  discountType: "PERCENT",
  percentOff: 20,
  amountOffClp: null,
  validFrom: new Date().toISOString(),
  validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  maxCycles: null,
  enabled: true,
  academies: [],
  producers: [],
};

"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Spinner } from "@/components/ui";
import { inputCls } from "@/components/academy/shared";

export type PromoPerson = { id: string; name: string };
export type PromoPlan = { id: string; name: string };

export type AcademyPromoPayload = {
  name: string;
  discountType: "PERCENT" | "FIXED_CLP";
  percentOff: number | null;
  amountOffClp: number | null;
  validFrom: string;
  validUntil: string;
  maxCycles: number | null;
  enabled: boolean;
  planIds: string[];
  persons: PromoPerson[];
};

/** datetime-local ↔ ISO (el input trabaja en hora local). */
const toInput = (iso: string) => iso.slice(0, 16);
const toIso = (v: string) => (v ? new Date(v).toISOString() : "");

/**
 * Formulario crear/editar de AcademyPromo (spec member-promos) -
 * compartido por /academia/promos/nueva y la ficha [id]. Scope a planes
 * (chips, vacío = todos) + whitelist de personas (buscador global -
 * admite no inscritas = preventa).
 */
export function AcademyPromoForm({
  academyId,
  initial,
  submitLabel,
  onSubmit,
  busy,
}: {
  academyId: string;
  initial: AcademyPromoPayload;
  submitLabel: string;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const t = useTranslations("academyPromos");
  const [form, setForm] = useState<AcademyPromoPayload>(initial);
  const [plans, setPlans] = useState<PromoPlan[]>([]);
  const set = <K extends keyof AcademyPromoPayload>(
    k: K,
    v: AcademyPromoPayload[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  // Planes de la academia para el scope (chips toggle).
  useEffect(() => {
    void apiFetch(`/academies/${academyId}/plans?pageSize=100`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: { id: string; name: string }[];
        };
        setPlans(data.items.map((p) => ({ id: p.id, name: p.name })));
      })
      .catch(() => undefined);
  }, [academyId]);

  function togglePlan(id: string) {
    set(
      "planIds",
      form.planIds.includes(id)
        ? form.planIds.filter((p) => p !== id)
        : [...form.planIds, id],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit({
      name: form.name.trim(),
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
      planIds: form.planIds,
      personIds: form.persons.map((p) => p.id),
    });
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
          <span className="text-xs text-ink/50">{t("discountType")}</span>
          <select
            className={inputCls}
            value={form.discountType}
            onChange={(e) =>
              set(
                "discountType",
                e.target.value as AcademyPromoPayload["discountType"],
              )
            }
          >
            <option value="PERCENT">{t("discountPercent")}</option>
            <option value="FIXED_CLP">{t("discountFixed")}</option>
          </select>
        </label>
        {form.discountType === "PERCENT" ? (
          <label className="flex flex-col gap-1">
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
          <label className="flex flex-col gap-1">
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
      </div>

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

      {/* Scope a planes: chips toggle; vacío = todos. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs text-ink/50">{t("plans")}</legend>
        {plans.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {plans.map((p) => {
              const on = form.planIds.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePlan(p.id)}
                    className={`min-h-8 rounded-full border px-3 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
                      on
                        ? "border-neon/60 bg-neon/10 text-neon"
                        : "border-line bg-raised text-ink/70 hover:border-neon/40"
                    }`}
                  >
                    {p.name}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <p className="text-xs text-ink/40">{t("plansHint")}</p>
      </fieldset>

      <PersonPicker academyId={academyId} selected={form.persons} onChange={(persons) => set("persons", persons)} />
      <p className="text-xs text-ink/40">{t("personsHint")}</p>

      <div>
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Spinner size="sm" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Buscador de personas para la whitelist (admite no inscritas). */
function PersonPicker({
  academyId,
  selected,
  onChange,
}: {
  academyId: string;
  selected: PromoPerson[];
  onChange: (next: PromoPerson[]) => void;
}) {
  const t = useTranslations("academyPromos");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PromoPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const res = await apiFetch(
        `/academies/${academyId}/promos/people-search?q=${encodeURIComponent(term)}`,
      ).catch(() => null);
      setSearching(false);
      if (!res?.ok) return;
      const rows = (await res.json()) as { id: string; name: string | null }[];
      setResults(
        rows
          .filter((r) => !selected.some((s) => s.id === r.id))
          .map((r) => ({ id: r.id, name: r.name ?? r.id }))
          .slice(0, 8),
      );
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, academyId, selected]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs text-ink/50">{t("persons")}</legend>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {selected.map((a) => (
            <li
              key={a.id}
              className="flex min-h-8 items-center gap-2 rounded-full border border-line bg-raised px-3 text-xs"
            >
              <span className="truncate">{a.name}</span>
              <button
                type="button"
                aria-label={t("removeActor", { name: a.name })}
                onClick={() => onChange(selected.filter((s) => s.id !== a.id))}
                className="text-ink/50 transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        className={inputCls}
        value={q}
        placeholder={t("searchPerson")}
        onChange={(e) => setQ(e.target.value)}
        aria-label={t("persons")}
      />
      {searching && (
        <p role="status" className="text-xs text-ink/50">
          {t("searching")}
        </p>
      )}
      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([...selected, r]);
                  setQ("");
                  setResults([]);
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-sm transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 text-xs text-neon">{t("add")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

export const EMPTY_ACADEMY_PROMO: AcademyPromoPayload = {
  name: "",
  discountType: "PERCENT",
  percentOff: 20,
  amountOffClp: null,
  validFrom: new Date().toISOString(),
  validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  maxCycles: null,
  enabled: true,
  planIds: [],
  persons: [],
};

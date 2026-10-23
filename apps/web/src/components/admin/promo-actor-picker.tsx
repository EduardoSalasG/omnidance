"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { inputCls } from "@/components/academy/shared";

export type PickedActor = { id: string; name: string };

/**
 * Picker de actores para la whitelist de una promo (spec platform-promos):
 * busca en /admin/browse/{entity}?q= y agrega chips. Vacío = promo global.
 */
export function PromoActorPicker({
  entity,
  label,
  placeholder,
  selected,
  onChange,
}: {
  entity: "academies" | "people";
  label: string;
  placeholder: string;
  selected: PickedActor[];
  onChange: (next: PickedActor[]) => void;
}) {
  const t = useTranslations("admin.promos");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedActor[]>([]);
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
      const extra = entity === "people" ? "&role=PRODUCER" : "";
      const res = await apiFetch(
        `/admin/browse/${entity}?q=${encodeURIComponent(term)}${extra}`,
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
  }, [q, entity, selected]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs text-ink/50">{label}</legend>
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
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        aria-label={label}
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

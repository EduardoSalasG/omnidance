"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  EntityDef,
  FilterDef,
  FkSource,
  QueryFilters,
} from "@omnidance/shared";
import { inputCls } from "@/components/academy/shared";

// Barra de filtros data-driven del query engine (spec analytics/query-console):
// la UI no hardcodea entidades ni filtros - renderiza el EntityDef del
// catálogo shared (`/query/catalog`). Texto con debounce 300ms, enums como
// selects con "Todos" primero, FKs resueltas por la API (eager vía prop
// `options`, scope-dependientes lazy via `loadScopeOptions` cuando cambia
// el filtro de scope) y `from`/`to` como par con presets Hoy/7d/30d/Todo.
// Controlled: emite `onChange` con el mapa plano string→string; el padre
// resetea pasando `filters={}`.

export type QueryOption = { value: string; label: string };

export type FilterBarProps = {
  /** Entidad activa del catálogo (filtros en orden de render). */
  entity: EntityDef;
  /** Valores actuales (controlled). Keys = FilterDef.key. */
  filters: QueryFilters;
  onChange: (filters: QueryFilters) => void;
  /** Opciones FK ya resueltas por /query/catalog, indexadas por source. */
  options: Record<string, QueryOption[]>;
  /** Loader de fuentes scope-dependientes (academyPlans, eventGuestLists…):
      se llama con el valor actual del filtro de scope. */
  loadScopeOptions?: (
    source: FkSource,
    scopeId: string,
  ) => Promise<QueryOption[]>;
  className?: string;
};

const DEBOUNCE_MS = 300;

const toInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function FilterBar({
  entity,
  filters,
  onChange,
  options,
  loadScopeOptions,
  className = "",
}: FilterBarProps) {
  const t = useTranslations("query");
  const ta = useTranslations("analytics");

  // Filtro de scope (scope: true en el catálogo) - su valor alimenta las
  // fuentes lazy (planId/seriesId/instructorId/listId dependen de él).
  const scopeFilter = entity.filters.find((f) => f.scope);
  const scopeKey = scopeFilter?.key ?? null;
  const scopeValue = scopeKey ? (filters[scopeKey] ?? "") : "";
  // Fuentes FK no resueltas en `options` → lazy (dependen del scope).
  const lazySources = entity.filters.filter(
    (f): f is FilterDef & { source: FkSource } =>
      f.type === "fk" && !!f.source && !f.scope && options[f.source] === undefined,
  );

  const [lazyOptions, setLazyOptions] = useState<
    Record<string, QueryOption[]>
  >({});
  const lazyReq = useRef(0);

  // Recarga de opciones lazy al cambiar el scope (o la entidad). Las keys
  // dependientes se limpian desde el handler de scope (ver setFilter).
  useEffect(() => {
    if (!loadScopeOptions || lazySources.length === 0) return;
    const req = ++lazyReq.current;
    if (!scopeValue) {
      setLazyOptions({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      lazySources.map(async (f) => {
        try {
          const items = await loadScopeOptions(f.source, scopeValue);
          return [f.source, items] as const;
        } catch {
          return [f.source, []] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled || req !== lazyReq.current) return;
      setLazyOptions(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.entity, scopeValue, loadScopeOptions]);

  function setFilter(key: string, value: string) {
    const next = { ...filters };
    if (value) next[key] = value;
    else delete next[key];
    // Cambio de scope → las FKs dependientes quedan inválidas: limpiarlas.
    if (key === scopeKey) {
      for (const f of lazySources) delete next[f.key];
      setLazyOptions({});
    }
    onChange(next);
  }

  function applyPreset(days: number | null) {
    const next = { ...filters };
    if (days === null) {
      delete next.from;
      delete next.to;
    } else {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - (days - 1));
      next.from = toInput(from);
      next.to = toInput(to);
    }
    onChange(next);
  }

  const labelFor = (key: string) =>
    t.has(`filters.${key}`) ? t(`filters.${key}`) : key;

  // Label de una opción enum: vocabulario propio de consultas
  // (voided/direction/methods…), luego los catálogos compartidos
  // statusLabels/orderTypes de analytics, y último recurso el valor crudo.
  const enumLabel = (v: string) =>
    t.has(`optionLabels.${v}`)
      ? t(`optionLabels.${v}`)
      : ta.has(`statusLabels.${v}`)
        ? ta(`statusLabels.${v}`)
        : ta.has(`orderTypes.${v}`)
          ? ta(`orderTypes.${v}`)
          : v;

  const hasFrom = entity.filters.some((f) => f.key === "from");
  const hasTo = entity.filters.some((f) => f.key === "to");
  // q se renderiza arriba como search input; el resto de text van al grid.
  const qFilter = entity.filters.find((f) => f.key === "q");
  const gridFilters = entity.filters.filter(
    (f) => f.key !== "q" && f.key !== "from" && f.key !== "to",
  );

  const optionsFor = (f: FilterDef): QueryOption[] => {
    if (f.type === "enum") {
      return (f.options ?? []).map((v) => ({ value: v, label: enumLabel(v) }));
    }
    if (f.type === "fk" && f.source) {
      return options[f.source] ?? lazyOptions[f.source] ?? [];
    }
    return [];
  };

  const preset = (() => {
    const { from, to } = filters;
    if (!from || !to) return null;
    const today = toInput(new Date());
    if (to !== today) return null;
    const diff =
      Math.round(
        (new Date(`${to}T12:00:00`).getTime() -
          new Date(`${from}T12:00:00`).getTime()) /
          86400000,
      ) + 1;
    if (diff === 1) return "today";
    if (diff === 7) return "7d";
    if (diff === 30) return "30d";
    return null;
  })();

  return (
    <section
      aria-label={t("filtersLabel")}
      className={`flex flex-col gap-3 ${className}`}
    >
      {qFilter && (
        <DebouncedText
          value={filters.q ?? ""}
          placeholder={t("filters.q")}
          onEmit={(v) => setFilter("q", v)}
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {gridFilters.map((f) =>
          f.multi ? (
            /* Selección múltiple: chips toggle (aria-pressed) en vez de
               select; el valor emite CSV en el mismo query param. */
            <fieldset
              key={f.key}
              className="flex flex-col gap-1 col-span-2 sm:col-span-3"
            >
              <legend className="text-xs text-ink/50">
                {labelFor(f.key)}
                {f.scope ? " *" : ""}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {optionsFor(f).map((o) => {
                  const selected = (filters[f.key] ?? "")
                    .split(",")
                    .filter(Boolean);
                  const active = selected.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setFilter(
                          f.key,
                          active
                            ? selected
                                .filter((v) => v !== o.value)
                                .join(",")
                            : [...selected, o.value].join(","),
                        )
                      }
                      className={`min-h-11 rounded-xl border px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
                        active
                          ? "border-neon bg-neon/10 font-medium text-neon"
                          : "border-line bg-elevated text-ink/70 hover:border-ink/30 hover:text-ink"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : (
          <label key={f.key} className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-ink/50">
              {labelFor(f.key)}
              {f.scope ? " *" : ""}
            </span>
            {f.type === "enum" || f.type === "fk" ? (
              <select
                value={filters[f.key] ?? ""}
                onChange={(e) => setFilter(f.key, e.target.value)}
                className={`${inputCls} min-w-0`}
              >
                <option value="">{t("filtersAll")}</option>
                {optionsFor(f).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "date" ? (
              <input
                type="date"
                value={filters[f.key] ?? ""}
                onChange={(e) => setFilter(f.key, e.target.value)}
                className={`${inputCls} min-w-0`}
              />
            ) : (
              <DebouncedText
                value={filters[f.key] ?? ""}
                placeholder={labelFor(f.key)}
                onEmit={(v) => setFilter(f.key, v)}
              />
            )}
          </label>
          ),
        )}
      </div>

      {hasFrom && hasTo && (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t("range")}</legend>
          <div
            role="group"
            aria-label={t("range")}
            className="flex flex-wrap gap-2"
          >
            {(
              [
                ["today", 1],
                ["7d", 7],
                ["30d", 30],
                ["all", null],
              ] as const
            ).map(([key, days]) => {
              const active =
                days === null
                  ? !filters.from && !filters.to
                  : preset === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applyPreset(days)}
                  className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
                    active
                      ? "bg-neon text-on-accent"
                      : "bg-ink/10 text-ink/70 hover:text-ink"
                  }`}
                >
                  {t(`presets.${key}`)}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            {/* min-w-0 en label e input: el min-content de
                input[type=date] (~160px) reventaba la celda del grid y
                el campo desbordaba sobre su vecino en móvil. */}
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-ink/50">
                {labelFor("from")}
              </span>
              <input
                type="date"
                value={filters.from ?? ""}
                onChange={(e) => setFilter("from", e.target.value)}
                className={`${inputCls} min-w-0`}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-ink/50">{labelFor("to")}</span>
              <input
                type="date"
                value={filters.to ?? ""}
                onChange={(e) => setFilter("to", e.target.value)}
                className={`${inputCls} min-w-0`}
              />
            </label>
          </div>
        </fieldset>
      )}
    </section>
  );
}

/** Input de texto con debounce 300ms - el valor local es inmediato y el
    onChange del padre llega tras la pausa (estándar de la app). Sync
    externa (reset/selección de guardada) reemplaza el draft. */
function DebouncedText({
  value,
  placeholder,
  onEmit,
}: {
  value: string;
  placeholder: string;
  onEmit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const lastEmitted = useRef(value);

  // Sync cuando el padre cambia el valor por fuera del debounce (reset,
  // consulta guardada). Si coincide con lo último emitido es eco propio.
  useEffect(() => {
    if (value !== lastEmitted.current) setDraft(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft !== lastEmitted.current) {
        lastEmitted.current = draft;
        onEmit(draft);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, onEmit]);

  return (
    <input
      type="search"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={inputCls}
    />
  );
}

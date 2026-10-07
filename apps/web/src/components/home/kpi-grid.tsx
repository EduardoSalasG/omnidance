"use client";

import { useTranslations } from "next-intl";

// KPI agregado de /home/stats - "Tu actividad" del bailarín y el
// "Resumen" de los roles de gestión. Home muestra un subset; /perfil
// muestra la grilla completa de la lente activa.
export type Kpi = { key: string; value: number; format?: "clp" };

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

// KPIs que representan trabajo pendiente - se destacan con borde de
// acento para que el dashboard "grite" lo accionable.
const ATTENTION_KEYS = new Set(["pendingRoles", "pendingPayouts"]);

export function KpiGrid({ kpis, label }: { kpis: Kpi[]; label: string }) {
  const t = useTranslations("home");
  if (kpis.length === 0) return null;
  return (
    <section aria-label={label} data-tour="home-stats">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
        {label}
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((k) => {
          // KPI nuevo del API sin key en el catálogo → fallback al
          // key crudo en vez de error de next-intl.
          const key = `kpi.${k.key}`;
          return (
            <li
              key={k.key}
              className={`rounded-xl border bg-night-800/60 px-4 py-3 ${
                ATTENTION_KEYS.has(k.key) && k.value > 0
                  ? "border-neon/60"
                  : "border-night-700"
              }`}
            >
              <span className="block text-2xl font-bold tabular-nums">
                {k.format === "clp" ? clp.format(k.value) : k.value}
              </span>
              <span className="text-xs text-white/50">
                {t.has(key) ? t(key) : k.key}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

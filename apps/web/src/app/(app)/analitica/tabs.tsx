"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Sub-nav interna del módulo /analitica (spec analytics/query-console):
 * Dashboard (KPIs por lente) | Consultas (query engine). Son links de
 * navegación entre rutas - no PillTabs (que es tablist para vistas en la
 * misma página). Mismo look de pills que el selector de lente: activa en
 * neon, inactiva en ink/10; ≥44px de touch target.
 */
export function AnaliticaTabs() {
  const t = useTranslations("query");
  const pathname = usePathname();

  const items = [
    { href: "/analitica", label: t("tabs.dashboard") },
    { href: "/analitica/consultas", label: t("tabs.queries") },
  ];

  return (
    <nav aria-label={t("tabs.label")} className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active =
          it.href === "/analitica"
            ? pathname === "/analitica"
            : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.98] motion-reduce:active:scale-100 ${
              active
                ? "bg-neon text-on-accent"
                : "bg-ink/10 text-ink/70 hover:text-ink"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

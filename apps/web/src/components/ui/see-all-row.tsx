"use client";

import { useTranslations } from "next-intl";

// Filas visibles por defecto en listas dentro de fichas; "Ver todo"
// expande al listado completo dentro de la misma ficha (patrón
// canónico nacido en academia/series/[id]).
export const LIST_PREVIEW = 5;

export function SeeAllRow({
  total,
  expanded,
  onToggle,
  preview = LIST_PREVIEW,
}: {
  total: number;
  expanded: boolean;
  onToggle: () => void;
  preview?: number;
}) {
  const tc = useTranslations("common");
  if (total <= preview) return null;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-11 w-full items-center justify-center gap-1 px-4 py-2 text-sm font-medium text-neon transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neon"
      >
        {expanded ? tc("showLess") : `${tc("seeAll")} (${total})`}
      </button>
    </li>
  );
}

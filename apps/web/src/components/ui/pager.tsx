"use client";

import { useTranslations } from "next-intl";
import { Button } from "./Button";

/**
 * Paginador de listados de consola (spec academy-console-v3): prev/next
 * + "Página X de Y" + total de resultados. Se oculta cuando hay una
 * sola página (el total se ve igual en el label). Touch targets ≥44px
 * por el size md del Button.
 */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  const t = useTranslations("common.pager");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div
      className={`flex items-center justify-between gap-3 ${className ?? ""}`}
    >
      <span className="text-xs tabular-nums text-ink/50">
        {t("results", { count: total })}
      </span>
      {pages > 1 && (
        <span className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            aria-label={t("prev")}
          >
            ‹ {t("prev")}
          </Button>
          <span className="text-xs tabular-nums text-ink/50">
            {t("pageOf", { page, pages })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPage(page + 1)}
            disabled={page >= pages}
            aria-label={t("next")}
          >
            {t("next")} ›
          </Button>
        </span>
      )}
    </div>
  );
}

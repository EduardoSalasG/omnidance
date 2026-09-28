"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui";

const DATASETS = ["sales", "checkins", "guestlist"] as const;

/**
 * Exporte CSV del evento (spec §11 "Exportes — CSV por evento").
 * Links de descarga directa vía proxy /api (preserva la cookie de
 * sesión); `download` evita el NavPendingOverlay y no navega.
 * Solo se monta cuando el viewer es owner/admin (gate de la página).
 */
export function ExportSection({ eventId }: { eventId: string }) {
  const t = useTranslations("producer");
  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("export.title")}
      </h2>
      <p className="mb-4 text-xs text-white/40">{t("export.hint")}</p>
      <div className="flex flex-wrap gap-2">
        {DATASETS.map((d) => (
          <a
            key={d}
            href={`/api/events/${eventId}/export.csv?dataset=${d}`}
            download
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-night-700 bg-night-900 px-4 text-sm font-semibold text-white transition-colors hover:border-neon/60"
          >
            {t(`export.${d}`)}
          </a>
        ))}
      </div>
    </Card>
  );
}

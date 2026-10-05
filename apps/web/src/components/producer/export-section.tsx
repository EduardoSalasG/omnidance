"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui";
import { ProPaywall } from "./pro-paywall";

const DATASETS = ["sales", "checkins", "guestlist"] as const;
const FORMATS = ["csv", "pdf"] as const;

const BTN =
  "inline-flex min-h-11 min-w-16 items-center justify-center rounded-xl border px-4 text-xs font-bold uppercase tracking-wide transition-colors";

/**
 * Exporte CSV/PDF del evento (spec §11 "Exportes — CSV/PDF por evento y
 * por serie"). CSV = planilla para cuadrar; PDF = reporte imprimible
 * con resumen. Links de descarga directa vía proxy /api (preserva la
 * cookie de sesión); `download` evita el NavPendingOverlay y no navega.
 * Solo se monta cuando el viewer es owner/admin (gate de la página).
 * Feature Producer Pro (S5): `proLocked` (effectivePro de /me, calculado
 * una vez por la página) reemplaza los links por el paywall.
 */
export function ExportSection({
  eventId,
  seriesId,
  seriesName,
  proLocked = false,
}: {
  eventId: string;
  /** Presente → ofrece el export agregado de la serie (columna `evento`). */
  seriesId?: string | null;
  seriesName?: string | null;
  /** Owner sin Pro efectivo — los exports responden 403 pro.required. */
  proLocked?: boolean;
}) {
  const t = useTranslations("producer");

  if (proLocked) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("export.title")}
        </h2>
        <ProPaywall />
      </section>
    );
  }

  const rows = (base: string, keyPrefix: string) =>
    DATASETS.map((d) => (
      <div
        key={d}
        className="flex items-center justify-between gap-3 border-t border-night-700 py-2 first:border-t-0"
      >
        <span className="text-sm text-white/80">{t(`${keyPrefix}.${d}`)}</span>
        <span className="flex gap-2">
          {FORMATS.map((f) => (
            <a
              key={f}
              href={`${base}/export.${f}?dataset=${d}`}
              download
              className={
                f === "csv"
                  ? `${BTN} border-night-700 bg-night-900 text-white hover:border-neon/60`
                  : `${BTN} border-neon/40 bg-neon/10 text-neon hover:border-neon/70`
              }
            >
              {f}
            </a>
          ))}
        </span>
      </div>
    ));

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("export.title")}
      </h2>
      <p className="mb-4 text-xs text-white/40">{t("export.hint")}</p>
      <div>{rows(`/api/events/${eventId}`, "export")}</div>
      {seriesId && (
        <>
          <p className="mb-2 mt-5 text-xs text-white/40">
            {t("export.seriesHint", { name: seriesName ?? "" })}
          </p>
          <div>{rows(`/api/events/series/${seriesId}`, "export.series")}</div>
        </>
      )}
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui";

type ReviewRow = {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
};

/**
 * Comentarios de la serie - solo productor/admin (spec
 * series-engagement): llegan anónimos del API, nunca muestran al
 * autor. Los comentarios sin texto solo aportan su score agregado.
 */
export function SeriesCommentsCard({ seriesId }: { seriesId: string }) {
  const t = useTranslations("seriesEngagement");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);

  const load = useCallback(async () => {
    // Sección auxiliar: si falla la carga la card simplemente no se
    // monta (rows queda en null) - sin unhandled rejection.
    const res = await apiFetch(
      `/events/series/${seriesId}/reviews`,
    ).catch(() => null);
    if (res?.ok) setRows((await res.json()) as ReviewRow[]);
  }, [seriesId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!rows) return null;
  const withComment = rows.filter((r) => r.comment);

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/60">
        {t("commentsTitle")}
      </h2>
      {withComment.length === 0 ? (
        <p className="text-sm text-ink/50">{t("noComments")}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {withComment.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-0.5 rounded-xl bg-elevated/60 px-3 py-2.5"
            >
              <span className="text-xs text-neon">{"★".repeat(r.score)}</span>
              <p className="text-sm text-ink/80">{r.comment}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-ink/40">{t("anonymousNote")}</p>
    </Card>
  );
}

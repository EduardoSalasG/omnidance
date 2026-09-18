"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import type { RatingAgg, RatingsSummary } from "./shared";

type Props = { eventId: string };

type ActorGroup = {
  actor: "dj" | "producer" | "venue";
  dims: { dim: string; agg: RatingAgg }[];
};

/**
 * Resumen agregado de evaluaciones (GET /events/:id/ratings/summary).
 * k-anonymity: la API solo expone promedios con ≥3 evaluaciones — nunca
 * hay evaluaciones individuales que mostrar. 403/404 → la sección no se
 * renderiza (el usuario no es owner/admin del evento).
 */
export function RatingsSection({ eventId }: Props) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const [summary, setSummary] = useState<RatingsSummary | null>(null);
  const [state, setState] = useState<"loading" | "error" | "hidden" | "ready">(
    "loading",
  );

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/events/${eventId}/ratings/summary`);
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        setState("hidden");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setSummary((await res.json()) as RatingsSummary);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "hidden") return null;

  const groups: ActorGroup[] =
    summary?.exposed && summary.byActor
      ? [
          {
            actor: "dj",
            dims: [{ dim: "music", agg: summary.byActor.dj.music }],
          },
          {
            actor: "producer",
            dims: [
              { dim: "occupation", agg: summary.byActor.producer.occupation },
              {
                dim: "organization",
                agg: summary.byActor.producer.organization,
              },
            ],
          },
          {
            actor: "venue",
            dims: [
              {
                dim: "floorComfort",
                agg: summary.byActor.venue.floorComfort,
              },
              { dim: "temperature", agg: summary.byActor.venue.temperature },
              {
                dim: "lightingSound",
                agg: summary.byActor.venue.lightingSound,
              },
            ],
          },
        ]
      : [];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("sections.ratings")}
      </h2>

      {state === "loading" && (
        <p role="status" className="text-sm text-white/60">
          {tc("loading")}
        </p>
      )}
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {state === "ready" && summary && !summary.exposed && (
        <p role="status" className="text-sm text-white/50">
          {t("ratings.notEnough", { count: summary.count })}
        </p>
      )}

      {state === "ready" && summary?.exposed && (
        <>
          <p className="text-xs text-white/50">
            {t("ratings.ratingsCount", { count: summary.count })}
          </p>
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <Card key={g.actor} className="flex flex-col gap-2 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  {t(`ratings.actors.${g.actor}`)}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {g.dims.map(({ dim, agg }) => (
                    <li
                      key={dim}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-white/70">
                        {t.has(`ratings.dims.${dim}`)
                          ? t(`ratings.dims.${dim}`)
                          : dim}
                      </span>
                      {agg.avg !== null ? (
                        <span className="font-semibold text-neon">
                          {agg.avg.toFixed(1)}{" "}
                          <span className="font-normal text-white/50">
                            / 5 · n={agg.count}
                          </span>
                        </span>
                      ) : (
                        <span className="text-white/50">—</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

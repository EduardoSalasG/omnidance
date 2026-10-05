"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, isProRequired } from "@/lib/api";
import { Button, Card, RefreshIcon, StarIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { ProPaywall } from "./pro-paywall";

type Props = {
  eventId: string;
  /** effectivePro de /me dice que el owner no tiene Pro — no se pide
      analytics: el endpoint responde 403 pro.required y el paywall se
      muestra directo (la página lo calcula una sola vez). */
  proLocked?: boolean;
};

type Analytics = {
  attendees: number;
  genderSplit: { M: number; F: number; OTHER: number; unknown: number } | null;
  roleSplit: { leader: number; follower: number; both: number } | null;
  ratings: {
    count: number;
    byDim: Partial<Record<string, number | null>>;
  } | null;
};

const DIM_ORDER = [
  "overall",
  "music",
  "occupation",
  "organization",
  "floorComfort",
  "temperature",
  "lightingSound",
] as const;

/** Estrellas compactas de display (no interactivas): valor redondeado
    como pictograma + promedio numérico al lado. */
function AvgStars({ avg }: { avg: number }) {
  const lit = Math.round(avg);
  return (
    <span className="inline-flex items-baseline gap-2">
      <span aria-hidden="true" className="inline-flex items-center gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <StarIcon
            key={i}
            filled={i < lit}
            className={`h-3.5 w-3.5 ${i < lit ? "text-neon" : "text-white/30"}`}
          />
        ))}
      </span>
      <span className="sr-only">{avg.toFixed(1)} / 5</span>
      <span className="font-semibold tabular-nums text-neon">
        {avg.toFixed(1)}
      </span>
    </span>
  );
}

/** Fila label → barra proporcional + conteo (splits de composición). */
function SplitRow({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-white/70">{label}</span>
      <span
        role="img"
        aria-label={`${label} ${pct}%`}
        className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-neon/70"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-10 shrink-0 text-right font-semibold tabular-nums">
        {count}
      </span>
    </li>
  );
}

/**
 * Analítica del evento (GET /events/:id/analytics) para owner/admin:
 * asistencia por check-in, composición género/rol y promedios de la
 * encuesta. 403/404 → la sección se oculta (no-owner); 403
 * `pro.required` (S5: feature Producer Pro) → paywall con CTA a la
 * sección Pro. La API devuelve splits/ratings null bajo 3 asistentes
 * (k-anonymity) → mensaje discreto de datos insuficientes; nunca hay
 * filas individuales que exponer.
 */
export function AnalyticsSection({ eventId, proLocked = false }: Props) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const [data, setData] = useState<Analytics | null>(null);
  const [state, setState] = useState<
    "loading" | "error" | "hidden" | "pro" | "ready"
  >("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/events/${eventId}/analytics`);
      if (res.status === 403 && (await isProRequired(res))) {
        setState("pro");
        return;
      }
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        setState("hidden");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setData((await res.json()) as Analytics);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [eventId]);

  useEffect(() => {
    if (proLocked) {
      setState("pro");
      return;
    }
    void load();
  }, [load, proLocked]);

  if (state === "hidden") return null;
  if (state === "pro") {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("sections.analytics")}
        </h2>
        <ProPaywall />
      </section>
    );
  }

  const genderEntries: [keyof NonNullable<Analytics["genderSplit"]>, number][] =
    data?.genderSplit
      ? [
          ["M", data.genderSplit.M],
          ["F", data.genderSplit.F],
          ["OTHER", data.genderSplit.OTHER],
          ["unknown", data.genderSplit.unknown],
        ]
      : [];
  const roleEntries: [keyof NonNullable<Analytics["roleSplit"]>, number][] =
    data?.roleSplit
      ? [
          ["leader", data.roleSplit.leader],
          ["follower", data.roleSplit.follower],
          ["both", data.roleSplit.both],
        ]
      : [];
  const ratedDims = DIM_ORDER.filter(
    (d) => data?.ratings?.byDim[d] != null,
  ) as string[];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("sections.analytics")}
      </h2>

      {state === "loading" && <SkeletonList items={2} lines={1} />}
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {state === "ready" && data && (
        <>
          {/* Asistencia real — siempre visible (un conteo no expone a
              nadie); la composición sí exige el umbral. */}
          <Card className="flex items-baseline justify-between gap-3 p-4">
            <span className="text-2xl font-bold tabular-nums text-neon">
              {data.attendees}
            </span>
            <span className="text-sm text-white/60">
              {t("eventAnalytics.attendees", { count: data.attendees })}
            </span>
          </Card>

          {!data.genderSplit && !data.roleSplit && !data.ratings ? (
            <p role="status" className="text-sm text-white/50">
              {t("eventAnalytics.insufficient")}
            </p>
          ) : (
            <>
              {(data.genderSplit || data.roleSplit) && (
                <Card className="flex flex-col gap-4 p-4">
                  {data.genderSplit && (
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                        {t("eventAnalytics.genderSplit")}
                      </h3>
                      <ul className="flex flex-col gap-2">
                        {genderEntries.map(([key, count]) => (
                          <SplitRow
                            key={key}
                            label={t(`eventAnalytics.gender.${key}`)}
                            count={count}
                            total={data.attendees}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                  {data.roleSplit && (
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                        {t("eventAnalytics.roleSplit")}
                      </h3>
                      <ul className="flex flex-col gap-2">
                        {roleEntries.map(([key, count]) => (
                          <SplitRow
                            key={key}
                            label={t(`eventAnalytics.roles.${key}`)}
                            count={count}
                            total={data.attendees}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              )}

              {data.ratings && (
                <Card className="flex flex-col gap-2 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                      {t("eventAnalytics.ratingsTitle")}
                    </h3>
                    <span className="text-xs text-white/50">
                      {t("eventAnalytics.ratingsCount", {
                        count: data.ratings.count,
                      })}
                    </span>
                  </div>
                  {ratedDims.length > 0 && (
                    <ul className="flex flex-col gap-1.5">
                      {ratedDims.map((dim) => (
                        <li
                          key={dim}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="text-white/70">
                            {t.has(`ratings.dims.${dim}`)
                              ? t(`ratings.dims.${dim}`)
                              : dim}
                          </span>
                          <AvgStars avg={data.ratings!.byDim[dim]!} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

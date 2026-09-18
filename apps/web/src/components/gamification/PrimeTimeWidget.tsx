"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card } from "@/components/ui";

type PrimeTime = {
  threshold: number;
  current: number;
  unlocked: boolean;
};

const POLL_MS = 30_000;

export function PrimeTimeWidget({ eventId }: { eventId: string }) {
  const t = useTranslations("gamification");
  const [data, setData] = useState<PrimeTime | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await apiFetch(`/events/${eventId}/prime-time`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as PrimeTime;
        if (!cancelled) setData(json);
      } catch {
        // Backend de gamificación aún no disponible — el widget queda oculto
      }
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [eventId]);

  // Sin datos todavía (o endpoint caído): no renderizar nada — no rompe la página del evento
  if (!data) return null;

  const pct =
    data.threshold > 0
      ? Math.min(100, Math.round((data.current / data.threshold) * 100))
      : 0;

  return (
    <Card className={data.unlocked ? "border-neon/60" : undefined}>
      <div className="flex items-center justify-between gap-3">
        <h2
          id="prime-time-heading"
          className="text-sm font-semibold uppercase tracking-wide text-white/50"
        >
          {t("primeTime")}
        </h2>
        {data.unlocked && <Badge variant="neon">{t("primeUnlocked")}</Badge>}
      </div>
      <div
        role="progressbar"
        aria-labelledby="prime-time-heading"
        aria-valuenow={data.current}
        aria-valuemin={0}
        aria-valuemax={data.threshold}
        className="mt-4 h-3 w-full overflow-hidden rounded-full bg-night-800"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            data.unlocked ? "bg-neon" : "bg-neon/60"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p
        className={`mt-2 text-sm ${
          data.unlocked ? "font-semibold text-neon" : "text-white/70"
        }`}
      >
        {t("primeProgress", {
          current: data.current,
          threshold: data.threshold,
        })}{" "}
        · {pct}%
      </p>
    </Card>
  );
}

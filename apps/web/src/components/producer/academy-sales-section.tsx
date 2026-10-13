"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  PriceTag,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";

// GET /events/:id/academy-deals (spec academy-presale-commission):
// vista del acuerdo con stats computadas por el API.
export type AcademyDealView = {
  id: string;
  eventId: string | null;
  seriesId: string | null;
  academyId: string;
  academyName: string;
  commissionPct: number;
  maxTickets: number | null;
  status: "INVITED" | "ACTIVE" | "DECLINED" | "DISABLED";
  stats: {
    soldTickets: number;
    commissionAccruedClp: number;
    settledClp: number;
    pendingClp: number;
  };
};

const STATUS_VARIANT = {
  INVITED: "outline",
  ACTIVE: "neon",
  DECLINED: "muted",
  DISABLED: "muted",
} as const;

/**
 * Preventa por academias dentro de la ficha del evento: lista los
 * acuerdos del evento (incluye los de la serie padre - el API los
 * devuelve juntos porque también atribuyen aquí). Crear va a la página
 * dedicada; las acciones de cada acuerdo viven en su ficha.
 * 403/404 (no-owner/admin) → la sección se oculta sola.
 */
export function AcademySalesSection({ eventId }: { eventId: string }) {
  const t = useTranslations("academySales");
  const tc = useTranslations("common");

  const [deals, setDeals] = useState<AcademyDealView[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/events/${eventId}/academy-deals`);
      if (res.status === 403 || res.status === 404) {
        setHidden(true);
        return;
      }
      if (!res.ok) {
        setError(true);
        return;
      }
      setDeals((await res.json()) as AcademyDealView[]);
    } catch {
      setError(true);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (hidden) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("sectionTitle")}
        </h2>
        <Button
          size="sm"
          variant="secondary"
          href={`/productor/eventos/${eventId}/academias/nueva`}
        >
          {`＋ ${t("invite")}`}
        </Button>
      </div>

      {deals === null && !error && <SkeletonList items={2} lines={1} />}
      {error && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {deals !== null && deals.length === 0 && !error && (
        <p role="status" className="text-sm text-ink/50">
          {t("empty")}
        </p>
      )}

      {deals !== null && deals.length > 0 && (
        <ul className="flex flex-col gap-2">
          {deals.map((d) => (
            <li key={d.id}>
              <Link
                href={`/productor/eventos/${eventId}/academias/${d.id}`}
                className="block"
              >
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:border-neon/60">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.academyName}</p>
                    <p className="text-xs text-ink/50">
                      {t("commissionPctLabel", { pct: d.commissionPct })}
                      {d.seriesId ? ` · ${t("seriesScope")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {d.stats.pendingClp > 0 && (
                      <span className="text-sm">
                        <span className="text-xs text-ink/50">
                          {t("pending")}{" "}
                        </span>
                        <PriceTag
                          amount={d.stats.pendingClp}
                          className="text-sm font-semibold"
                        />
                      </span>
                    )}
                    <Badge variant={STATUS_VARIANT[d.status] ?? "muted"}>
                      {t.has(`status.${d.status}`)
                        ? t(`status.${d.status}`)
                        : d.status}
                    </Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

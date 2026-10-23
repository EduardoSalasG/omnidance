"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyTierGate } from "@/components/academy/academy-tier-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  Badge,
  Button,
  Card,
  PriceTag,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import type { AcademyDealView } from "@/components/producer/academy-sales-section";
import { Link } from "@/i18n/navigation";

// Vista academia (GET /academies/:id/sale-deals): el AgreementView más
// el nombre del evento/serie que el API resuelve en la misma llamada.
type AcademyDealRow = AcademyDealView & {
  eventName: string | null;
  seriesName: string | null;
  eventStartsAt: string | null;
};

const STATUS_VARIANT = {
  INVITED: "outline",
  ACTIVE: "neon",
  DECLINED: "muted",
  DISABLED: "muted",
} as const;

/**
 * /academia/preventas - acuerdos de preventa en los que la academia
 * vende por comisión (spec academy-presale-commission). La fila navega
 * a la ficha; ahí viven aceptar/rechazar (INVITED) y el link copiable.
 */
function PresaleDeals({ academyId }: { academyId: string }) {
  const t = useTranslations("academySales");
  const tc = useTranslations("common");

  const [deals, setDeals] = useState<AcademyDealRow[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/academies/${academyId}/sale-deals`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setDeals((await res.json()) as AcademyDealRow[]);
    } catch {
      setError(true);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-3">
      {deals === null && !error && <SkeletonList items={3} lines={2} />}
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
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p role="status" className="text-ink/70">
            {t("academyEmpty")}
          </p>
          <p className="max-w-sm text-xs text-ink/50">{t("academyEmptyHint")}</p>
        </Card>
      )}

      {deals !== null && deals.length > 0 && (
        <ul className="flex flex-col gap-2">
          {deals.map((d) => (
            <li key={d.id}>
              <Link href={`/academia/preventas/${d.id}`} className="block">
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:border-neon/60">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {d.eventName ?? d.seriesName ?? d.id}
                    </p>
                    <p className="text-xs text-ink/50">
                      {t("commissionPctLabel", { pct: d.commissionPct })}
                      {d.seriesId ? ` · ${t("seriesScope")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {d.stats.pendingClp > 0 && (
                      <span className="text-sm">
                        <span className="text-xs text-ink/50">
                          {t("paymentPending")}{" "}
                        </span>
                        <PriceTag
                          amount={d.stats.pendingClp}
                          className="text-sm font-semibold"
                        />
                      </span>
                    )}
                    {d.stats.pendingClp < 0 && (
                      <span className="text-sm">
                        <span className="text-xs text-ink/50">
                          {t("paymentOwed")}{" "}
                        </span>
                        <PriceTag
                          amount={Math.abs(d.stats.pendingClp)}
                          className="text-sm font-semibold"
                        />
                      </span>
                    )}
                    {d.stats.pendingClp === 0 &&
                      d.stats.commissionAccruedClp > 0 && (
                        <span className="text-sm">
                          <span className="text-xs text-ink/50">
                            {t("accrued")}{" "}
                          </span>
                          <PriceTag
                            amount={d.stats.commissionAccruedClp}
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

export default function AcademyPresalesPage() {
  const t = useTranslations("academySales");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/academia" backLabel={t("backToHub")} />
      <p className="text-sm text-ink/50">{t("academyPageDesc")}</p>
      <AcademyGate>
        {({ academy }) => (
          <AcademyTierGate academy={academy} feature="presales"><PresaleDeals key={academy.id} academyId={academy.id} /></AcademyTierGate>
        )}
      </AcademyGate>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, Pager, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { actionLabel, audienceLabel } from "./campaign-labels";
import type { CrmActor, CrmCampaign } from "./types";
import { actorQuery } from "./types";

const fmtDay = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
});

const PAGE_SIZE = 20;

const STATUS_VARIANT: Record<string, "neon" | "muted" | "outline"> = {
  DRAFT: "outline",
  SENT: "neon",
  DONE: "muted",
  CANCELLED: "muted",
};

/**
 * Cards de campañas del actor (GET /crm/campaigns?actor) - clickeables
 * hacia la ficha /crm/campanas/[id], donde vive el envío del borrador
 * (el listado no muta - patrón de consola).
 */
export function CampaignList({
  actor,
  reloadSignal,
}: {
  actor: CrmActor;
  /** Incrementar para forzar refetch (tras crear una campaña). */
  reloadSignal: number;
}) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");

  const [items, setItems] = useState<CrmCampaign[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(
        `/crm/campaigns?${actorQuery(actor)}&page=${page}&pageSize=${PAGE_SIZE}`,
      );
      if (!res.ok) {
        setError(true);
        setItems([]);
        return;
      }
      const data = (await res.json()) as {
        items: CrmCampaign[];
        total: number;
      };
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setError(true);
      setItems([]);
    }
  }, [actor, page]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load, reloadSignal]);

  if (items === null && !error) {
    return <SkeletonList />;
  }

  return (
    <section className="flex flex-col gap-4" aria-label={t("campaigns.title")}>
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

      {items !== null && items.length === 0 && !error && (
        <p className="text-ink/60">{t("campaigns.empty")}</p>
      )}

      {items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/crm/campanas/${c.id}`}
                className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                <Card className="flex flex-col gap-3 transition-colors hover:border-neon/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.name}</span>
                    <Badge variant={STATUS_VARIANT[c.status] ?? "muted"}>
                      {t.has(`campaigns.status.${c.status}`)
                        ? t(`campaigns.status.${c.status}`)
                        : c.status}
                    </Badge>
                    <Badge variant="outline">{actionLabel(t, c)}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/60">
                    <span>
                      {t("campaigns.audience")}: {audienceLabel(t, c)}
                    </span>
                    <span className="text-ink/50">
                      {fmtDay.format(new Date(c.createdAt))}
                    </span>
                  </div>
                  {c.status === "SENT" && c.result && (
                    <p className="text-sm text-neon">
                      {t("campaigns.sentResult", {
                        count: c.result.sent ?? 0,
                      })}
                      {c.result.code
                        ? ` · ${t("campaigns.withCode", { code: c.result.code })}`
                        : ""}
                    </p>
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items !== null && total > 0 && (
        <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
      )}
    </section>
  );
}

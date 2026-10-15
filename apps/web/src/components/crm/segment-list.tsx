"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { rulesLabel } from "./segment-labels";
import type { CrmActor, CrmSegment } from "./types";
import { actorQuery } from "./types";
import { Link } from "@/i18n/navigation";

/**
 * Segmentos guardados del actor (GET /crm/segments) - cards clickeables
 * hacia la ficha /crm/segmentos/[id] (patrón de consola).
 */
export function SegmentList({
  actor,
  reloadSignal,
}: {
  actor: CrmActor;
  /** Incrementar para forzar refetch (tras crear un segmento). */
  reloadSignal: number;
}) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");

  const [items, setItems] = useState<CrmSegment[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/crm/segments?${actorQuery(actor)}`);
      if (!res.ok) {
        setError(true);
        setItems([]);
        return;
      }
      setItems((await res.json()) as CrmSegment[]);
    } catch {
      setError(true);
      setItems([]);
    }
  }, [actor]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load, reloadSignal]);

  if (items === null && !error) {
    return <SkeletonList />;
  }

  return (
    <section
      className="flex flex-col gap-4"
      aria-label={t("actorSegments.title")}
    >
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
        <p className="text-ink/60">{t("actorSegments.empty")}</p>
      )}

      {items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
          {items.map((s) => (
            <li key={s.id}>
              <Link
                href={`/crm/segmentos/${s.id}`}
                className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                <Card className="flex flex-col gap-3 transition-colors hover:border-neon/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <Badge variant="neon">
                      {t("actorSegments.memberCount", { count: s.members })}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink/60">{rulesLabel(t, s)}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

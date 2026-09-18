"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate, PriceTag } from "@/components/ui";
import { PASS_STATUS_VARIANT, type EntryPass } from "./shared";

type Props = { eventId: string };

/**
 * EntryPass del evento (GET /events/:id/passes — productor/staff/admin).
 * Tabla real con scroll horizontal en pantallas estrechas.
 */
export function PassesSection({ eventId }: Props) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const [passes, setPasses] = useState<EntryPass[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/events/${eventId}/passes`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setPasses((await res.json()) as EntryPass[]);
    } catch {
      setError(true);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("sections.passes")}
      </h2>

      {passes === null && !error && (
        <p role="status" className="text-sm text-white/60">
          {tc("loading")}
        </p>
      )}
      {error && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}
      {passes !== null && passes.length === 0 && (
        <p role="status" className="text-sm text-white/50">
          {t("passes.empty")}
        </p>
      )}
      {passes !== null && passes.length > 0 && (
        <Card
          padded
          className="overflow-x-auto p-0"
          role="region"
          tabIndex={0}
          aria-label={t("sections.passes")}
        >
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-night-700 text-xs uppercase tracking-wide text-white/50">
                <th scope="col" className="px-4 py-3 font-medium">
                  {t("passes.person")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t("passes.type")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t("passes.price")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t("passes.validUntil")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t("passes.status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {passes.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-night-700 last:border-0"
                >
                  <td className="px-4 py-3">
                    <span className="block truncate">
                      {p.person?.name ?? p.person?.id ?? "—"}
                    </span>
                    {p.person?.phone && (
                      <span className="block text-xs text-white/50">
                        {p.person.phone}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">
                      {t.has(`passes.types.${p.type}`)
                        ? t(`passes.types.${p.type}`)
                        : p.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <PriceTag amount={p.price} />
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {p.validUntil ? (
                      <EventDate start={p.validUntil} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={PASS_STATUS_VARIANT[p.status] ?? "muted"}>
                      {t.has(`passes.statuses.${p.status}`)
                        ? t(`passes.statuses.${p.status}`)
                        : p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

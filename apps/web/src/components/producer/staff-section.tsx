"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { ProPaywall } from "./pro-paywall";
import { type StaffEntry } from "./shared";

type Props = {
  eventId: string;
  /** Owner sin Pro efectivo - el alta de staff responde 403 pro.required
      (la lista sigue siendo legible: el gateo es de la mutación). */
  proLocked?: boolean;
};

/**
 * Staff del evento (GET /events/:id/staff). El alta vive en
 * /productor/eventos/[id]/staff/nuevo (POST upsert por personId) - aquí
 * quedan la lista y las acciones por fila. Sin Pro el CTA se reemplaza
 * por el paywall (la lista de staff ya asignado sigue visible).
 */
export function StaffSection({ eventId, proLocked = false }: Props) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const [staff, setStaff] = useState<StaffEntry[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/events/${eventId}/staff`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setStaff((await res.json()) as StaffEntry[]);
    } catch {
      setError(true);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("sections.staff")}
        </h2>
        {!proLocked && (
          <Button
            size="sm"
            variant="secondary"
            href={`/productor/eventos/${eventId}/staff/nuevo`}
          >
            {`＋ ${t("staffSection.add")}`}
          </Button>
        )}
      </div>

      {staff === null && !error && <SkeletonList items={2} lines={1} />}
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
      {staff !== null && staff.length === 0 && (
        <p role="status" className="text-sm text-ink/50">
          {t("staffSection.empty")}
        </p>
      )}
      {staff !== null && staff.length > 0 && (
        <ul className="flex flex-col gap-2">
          {staff.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {s.person.name ?? s.person.email ?? s.person.id}
                  </p>
                  {s.person.email && s.person.name && (
                    <p className="truncate text-xs text-ink/50">
                      {s.person.email}
                    </p>
                  )}
                </div>
                <Badge variant="outline">
                  {t.has(`staffSection.roles.${s.role}`)
                    ? t(`staffSection.roles.${s.role}`)
                    : s.role}
                </Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {proLocked && <ProPaywall />}
    </section>
  );
}

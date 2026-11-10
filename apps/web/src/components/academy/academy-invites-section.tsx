"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon, SkeletonList } from "@/components/ui";
import { planDateFmt } from "./shared";

interface AcademyInvite {
  id: string;
  email: string;
  name: string;
  consumedAt: string | null;
  createdAt: string;
}

/**
 * Listado de invitaciones de registro (spec academies/student-invites):
 * pendientes primero (orden del API), filas de lectura con estado
 * Pendiente/Registrado. Solo se monta para quien tiene cap `students`.
 */
export function AcademyInvitesSection({ academyId }: { academyId: string }) {
  const t = useTranslations("academy.invites");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [items, setItems] = useState<AcademyInvite[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/academies/${academyId}/invites`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setItems(((await res.json()) as { items: AcademyInvite[] }).items);
    } catch {
      setError(true);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-label={t("listTitle")} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("listTitle")}
      </h3>
      {items === null && !error ? (
        <SkeletonList items={2} lines={1} />
      ) : error ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      ) : !items || items.length === 0 ? (
        <p role="status" className="text-sm text-ink/50">
          {t("empty")}
        </p>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {(items ?? []).map((inv) => (
              <li
                key={inv.id}
                className="flex min-h-11 items-center gap-3 px-4 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {inv.name || inv.email}
                  </p>
                  <p className="truncate text-xs text-ink/50">
                    {inv.name ? `${inv.email} · ` : ""}
                    {t("sentAt", {
                      date: planDateFmt(locale).format(
                        new Date(inv.createdAt),
                      ),
                    })}
                  </p>
                </div>
                <Badge variant={inv.consumedAt ? "neon" : "outline"}>
                  {inv.consumedAt ? t("status.registered") : t("status.pending")}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

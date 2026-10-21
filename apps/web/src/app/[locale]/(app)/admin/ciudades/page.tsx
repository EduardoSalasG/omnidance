"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  RefreshIcon,
  SkeletonList,
  type BadgeVariant,
} from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { useFeatures } from "@/lib/features-context";
import { useDateFmt } from "@/lib/intl";
import { Link } from "@/i18n/navigation";
import type {
  CityGuideListItem,
  CityGuideStatus,
} from "@/components/admin/types";

// Consola /admin/ciudades (spec city-guides): estado editorial de cada
// ciudad (vacía/borrador/completa) → card clickeable a la ficha editor.
// Detrás del flag city_guides - OFF la entrada de nav se oculta y un
// deep link muestra el estado "módulo desactivado" (el API 404ea igual).

const STATUS_VARIANT: Record<CityGuideStatus, BadgeVariant> = {
  complete: "neon",
  draft: "outline",
  empty: "muted",
};

export default function AdminCiudadesPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/inicio" backLabel={t("modules.backHome")} />
      <AdminGate>
        <CityGuidesPanel />
      </AdminGate>
    </main>
  );
}

function CityGuidesPanel() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const dt = useDateFmt({ dateStyle: "medium", timeStyle: "short" });
  const { flags, loading: flagsLoading } = useFeatures();
  const enabled = flags.city_guides === true;

  // null = GET /admin/city-guides en vuelo → skeleton.
  const [items, setItems] = useState<CityGuideListItem[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch("/admin/city-guides");
      if (!res.ok) {
        setError(true);
        return;
      }
      setItems((await res.json()) as CityGuideListItem[]);
    } catch {
      setError(true);
    }
  }, []);

  // El fetch espera a que el flag resuelva ON - con el flag apagado el
  // API responde 404, así que ni siquiera se intenta.
  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  if (flagsLoading) return <SkeletonList items={4} lines={1} />;

  if (!enabled) {
    return (
      <p className="text-sm text-ink/60">{t("cities.disabled")}</p>
    );
  }

  return (
    <>
      <p className="text-sm text-ink/60">{t("cities.desc")}</p>

      {error ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t("cities.error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      ) : items === null ? (
        <SkeletonList items={4} lines={1} />
      ) : items.length === 0 ? (
        <p role="status" className="text-sm text-ink/50">
          {t("cities.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/ciudades/${c.id}`} className="block">
                <Card className="flex flex-col gap-1 transition-colors hover:border-neon/60">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold">
                      {c.name}
                    </span>
                    <Badge variant={STATUS_VARIANT[c.status]}>
                      {t(`cities.status.${c.status}`)}
                    </Badge>
                  </div>
                  <span className="text-xs text-ink/50">
                    {c.country.name}
                    {" · "}
                    {c.updatedAt
                      ? t("cities.updatedAt", {
                          date: dt.format(new Date(c.updatedAt)),
                        })
                      : t("cities.neverEdited")}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

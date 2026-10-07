"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, Card, PriceTag } from "@/components/ui";
import type { MembershipPlan } from "./shared";

type Props = {
  plans: MembershipPlan[];
};

/**
 * Planes de membresía - solo listado. Crear/editar vive en la página
 * dedicada /academia/planes/nueva (?edit=<planId>), detrás del CTA del
 * header del listado y del "Editar" por fila.
 */
export function PlansSection({ plans }: Props) {
  const t = useTranslations("academy");

  if (plans.length === 0) {
    // Empty state con el CTA de crear como acción principal.
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-white/50">{t("plansEmpty")}</p>
        <Button href="/academia/planes/nueva" size="sm">
          + {t("newPlan")}
        </Button>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {plans.map((p) => (
        <li key={p.id}>
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.name}</p>
              {p.classCount != null && (
                <p className="text-xs text-white/50">
                  {t("planClasses")}: {p.classCount}
                </p>
              )}
              {p.weeklyClasses != null && (
                <p className="text-xs text-white/50">
                  {t("planWeeklyCount", { count: p.weeklyClasses })}
                </p>
              )}
              {p.description.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-white/60">
                  {p.description.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {t.has(`planTypes.${p.type}`)
                  ? t(`planTypes.${p.type}`)
                  : p.type}
              </Badge>
              {p.active ? (
                <Badge variant="neon">{t("status.ACTIVE")}</Badge>
              ) : (
                <Badge variant="outline">{t("planInactive")}</Badge>
              )}
              <PriceTag amount={p.price} />
              <Button
                href={`/academia/planes/nueva?edit=${p.id}`}
                size="sm"
                variant="secondary"
              >
                {t("editPlan")}
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

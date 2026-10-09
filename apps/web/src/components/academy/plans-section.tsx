"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge, Button, Card, PriceTag } from "@/components/ui";
import type { MembershipPlan } from "./shared";

type Props = {
  plans: MembershipPlan[];
};

/**
 * Planes de membresía - listado navegable: el card abre el detalle
 * /academia/planes/[id] (datos + alumnos vigentes + editar). Crear
 * vive en /academia/planes/nueva detrás del CTA del header.
 */
export function PlansSection({ plans }: Props) {
  const t = useTranslations("academy");

  if (plans.length === 0) {
    // Empty state con el CTA de crear como acción principal.
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink/50">{t("plansEmpty")}</p>
        <Button href="/academia/planes/nueva" size="sm">
          + {t("newPlan")}
        </Button>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((p) => (
        <li key={p.id}>
          <Link
            href={`/academia/planes/${p.id}`}
            className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
          >
            <Card className="flex h-full flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors hover:border-neon/40">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                {p.classCount != null && (
                  <p className="text-xs text-ink/50">
                    {t("planClasses")}: {p.classCount}
                  </p>
                )}
                {p.weeklyClasses != null && (
                  <p className="text-xs text-ink/50">
                    {t("planWeeklyCount", { count: p.weeklyClasses })}
                  </p>
                )}
                {p.activeStudents != null && (
                  <p className="text-xs tabular-nums text-ink/50">
                    {t("planStudents", { count: p.activeStudents })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {t.has(`planTypes.${p.type}`)
                    ? t(`planTypes.${p.type}`)
                    : p.type}
                </Badge>
                {!p.active && (
                  <Badge variant="outline">{t("planInactive")}</Badge>
                )}
                <PriceTag amount={p.price} />
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

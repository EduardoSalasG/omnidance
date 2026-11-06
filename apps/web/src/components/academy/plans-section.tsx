"use client";

import { useTranslations } from "next-intl";

import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  PriceTag,
} from "@/components/ui";
import type { MembershipPlan } from "./shared";
import { Link } from "@/i18n/navigation";

type Props = {
  plans: MembershipPlan[];
};

// Planes por tiempo (renovables) vs de una sola vez - spec PlanType:
// MONTHLY/QUARTERLY/SEMIANNUAL/PERIOD otorgan acceso por ventana;
// SINGLE/CLASS_PACK/TRIAL se consumen una vez.
const RECURRING_TYPES = new Set([
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "PERIOD",
]);

/**
 * Planes de membresía - listado navegable en dos secciones (recurrentes
 * / pago único): el card abre el detalle /academia/planes/[id] (datos +
 * alumnos vigentes + editar). Crear vive en /academia/planes/nueva
 * detrás del CTA del header.
 */
export function PlansSection({ plans }: Props) {
  const t = useTranslations("academy");

  if (plans.length === 0) {
    // Vacío real (sin filtros): copy + CTA de crear, mismo destino que
    // el botón de la página.
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-ink/50">{t("plansEmpty")}</p>
        <Button href="/academia/planes/nueva" size="sm" variant="secondary">
          + {t("newPlan")}
        </Button>
      </div>
    );
  }

  const recurring = plans.filter((p) => RECURRING_TYPES.has(p.type));
  const oneTime = plans.filter((p) => !RECURRING_TYPES.has(p.type));

  const section = (title: string, items: MembershipPlan[]) =>
    items.length === 0 ? null : (
      <section aria-label={title} className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {title}
        </h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/academia/planes/${p.id}`}
                className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                {/* Layout vertical: en 3 columnas de desktop el card queda
                    angosto y el row horizontal colapsaba el nombre a un
                    par de letras. Nombre+precio arriba, meta debajo y
                    badges al pie - legible a cualquier ancho. */}
                <Card className="flex h-full flex-col gap-2 p-4 transition-colors hover:border-neon/60">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 font-medium leading-snug">
                      {p.name}
                    </p>
                    {/* Chevron al filo derecho del headline: affordance
                        permanente de "se toca" (mobile no tiene hover). */}
                    <span className="flex shrink-0 items-center gap-2">
                      <PriceTag amount={p.price} currency={p.currency} />
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                    </span>
                  </div>
                  <div className="flex flex-col">
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
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {t.has(`planTypes.${p.type}`)
                        ? t(`planTypes.${p.type}`)
                        : p.type}
                    </Badge>
                    <Badge variant={p.active ? "neon" : "outline"}>
                      {p.active ? t("planStateActive") : t("planInactive")}
                    </Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="flex flex-col gap-6">
      {section(t("planSectionRecurring"), recurring)}
      {section(t("planSectionOneTime"), oneTime)}
    </div>
  );
}

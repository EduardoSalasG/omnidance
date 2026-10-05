"use client";

import { useState } from "react";
import { Badge, Button, Card, PriceTag } from "@/components/ui";
import { BuyPrivateClass } from "./buy-private-class";

type Plan = {
  id: string;
  name: string;
  type: string;
  price: number;
  classCount: number | null;
  weeklyClasses: number | null;
  periodDays: number | null;
  description: string[];
};

const VISIBLE_PLANS = 2;

// Resuelve el plural ICU simple de parts ("{count, plural, one {# X}
// other {# X}}") sin librería — los labels llegan como props
// serializables desde la página server.
function countLabel(tpl: string, count: number): string {
  const m = /\bone\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}/.exec(tpl);
  if (!m) return tpl.replace("{count}", String(count));
  return (count === 1 ? m[1] : m[2]).replaceAll("#", String(count));
}

/** Sección "Planes" de la ficha pública /academias/:id — 2 visibles; el
    resto tras "ver más" (misma progressive disclosure que Profesores).
    El card de clase particular queda siempre visible: es otro producto,
    no un plan. OJO: `plans-section.tsx` es la consola de gestión
    (/academia/planes) — este es solo la vista pública.
    Todos los labels llegan como strings (props server→client
    serializables); `planTypeLabels` es el catálogo academy.planTypes. */
export function ProfilePlansSection({
  academyId,
  plans,
  privateLessonPrice,
  activePlanId,
  subscribedPlanId,
  blocked = false,
  labels,
}: {
  academyId: string;
  plans: Plan[];
  /** Precio de la clase particular; null/0 = la academia no la vende. */
  privateLessonPrice: number | null;
  /** Plan vigente del viewer (enrollment ACTIVE/ONLINE). */
  activePlanId: string | null;
  /** Plan con suscripción Flow viva — su CTA se oculta (la gestión vive
      en SubscriptionManage; un segundo "Comprar" cobraría dos veces). */
  subscribedPlanId: string | null;
  /** Academia bloqueada por mora SaaS (S3): los CTAs de compra quedan
      deshabilitados con el hint `unavailable` — no se inicia el flujo. */
  blocked?: boolean;
  labels: {
    title: string;
    planActive: string;
    buyPlan: string;
    extendPlan: string;
    privateLesson: string;
    privateLessonDesc: string;
    /** Academia bloqueada — hint honesto junto a los CTA deshabilitados. */
    unavailable: string;
    /** Plan TRIAL sin precio: no se compra — texto informativo. */
    trialAssigned: string;
    /** Plural ICU "{count} clase(s)". */
    planClassCount: string;
    /** Plural ICU "{count} clase(s)/semana". */
    planWeeklyCount: string;
    /** "Ver {count} más". */
    more: string;
    fewer: string;
    planTypeLabels: Record<string, string>;
  };
}) {
  const [all, setAll] = useState(false);
  const more = Math.max(0, plans.length - VISIBLE_PLANS);
  const visible = all ? plans : plans.slice(0, VISIBLE_PLANS);

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
        {labels.title}
      </h2>
      {blocked && (
        <p role="status" className="mb-3 text-sm text-white/60">
          {labels.unavailable}
        </p>
      )}
      {/* Ítems planos con dividers — son filas de la Card padre, no
          cards anidadas (borde+dentro-de-borde ensuciaba la jerarquía). */}
      <ul className="flex flex-col divide-y divide-night-700">
        {visible.map((p) => {
          const isActivePlan = p.id === activePlanId;
          const subscribedToPlan = p.id === subscribedPlanId;
          // TRIAL sin precio no se compra (el backend rechaza el
          // checkout) — la academia lo asigna desde su consola.
          const freeTrial = p.type === "TRIAL" && p.price <= 0;
          return (
            <li key={p.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {p.name}
                    {isActivePlan && (
                      <Badge variant="neon">{labels.planActive}</Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-white/50">
                    {labels.planTypeLabels[p.type] ?? p.type}
                    {p.classCount
                      ? ` · ${countLabel(labels.planClassCount, p.classCount)}`
                      : ""}
                    {p.weeklyClasses
                      ? ` · ${countLabel(labels.planWeeklyCount, p.weeklyClasses)}`
                      : ""}
                  </p>
                </div>
                {/* Precio real cobrado — sin cargo de servicio (modelo
                    SaaS: la academia vende sin comisión), mismo total
                    que el breakdown del checkout. */}
                <div className="shrink-0 text-right">
                  <PriceTag amount={p.price} />
                </div>
              </div>
              {p.description.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm text-white/70">
                  {p.description.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
              {freeTrial ? (
                <p className="text-sm text-white/50">{labels.trialAssigned}</p>
              ) : (
                !subscribedToPlan &&
                (blocked ? (
                  <Button className="w-full" disabled>
                    {isActivePlan ? labels.extendPlan : labels.buyPlan}
                  </Button>
                ) : (
                  <Button
                    href={`/academias/${academyId}/checkout?plan=${p.id}`}
                    className="w-full"
                  >
                    {isActivePlan ? labels.extendPlan : labels.buyPlan}
                  </Button>
                ))
              )}
            </li>
          );
        })}
        {/* Clase particular — producto comprable (private-lesson-
            product): paga por adelantado, la academia asigna
            instructor y fecha. Misma grilla que los planes. */}
        {(privateLessonPrice ?? 0) > 0 && (
          <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{labels.privateLesson}</p>
                <p className="mt-0.5 text-xs text-white/50">
                  {labels.privateLessonDesc}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <PriceTag amount={privateLessonPrice!} />
              </div>
            </div>
            <BuyPrivateClass academyId={academyId} disabled={blocked} />
          </li>
        )}
      </ul>
      {more > 0 && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={all}
            onClick={() => setAll((v) => !v)}
          >
            {all ? labels.fewer : labels.more.replace("{count}", String(more))}
          </Button>
        </div>
      )}
    </Card>
  );
}

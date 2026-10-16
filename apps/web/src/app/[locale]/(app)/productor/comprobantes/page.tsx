"use client";

import { useTranslations } from "next-intl";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { ProducerClaimsQueue } from "@/components/producer/claims-queue-section";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";

/**
 * /productor/comprobantes - cola de comprobantes de los métodos
 * propios (spec producer-own-methods): el comprador paga por
 * transferencia/link/efectivo y sube la evidencia; al aprobar, la
 * orden se liquida y la entrada queda emitida.
 */
export default function ProducerClaimsPage() {
  const t = useTranslations("producer");
  const tn = useTranslations("nav");
  const tt = useTranslations("tours.productorCobros");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <ProducerGate>
        <ProducerClaimsQueue />
        {/* Tour de la cola (primera visita): los anchors de cola e
            historial se omiten solos cuando están vacíos - con cola en
            cero el tour se reduce a los filtros. */}
        <OnboardingRunner
          tour="productor-cobros"
          steps={[
            {
              element: "[data-tour='claims-pending']",
              title: tt("s1.title"),
              description: tt("s1.desc"),
              side: "top",
            },
            {
              element: "[data-tour='claims-history']",
              title: tt("s2.title"),
              description: tt("s2.desc"),
              side: "top",
            },
            {
              element: "[data-tour='claims-filters']",
              title: tt("s3.title"),
              description: tt("s3.desc"),
              side: "top",
            },
          ] satisfies TourStep[]}
        />
      </ProducerGate>
    </main>
  );
}

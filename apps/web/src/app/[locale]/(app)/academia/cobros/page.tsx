"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ClaimsQueue } from "@/components/academy/claims-queue";
import { OrderClaimsQueue } from "@/components/academy/order-claims-queue";
import { CobrosExpiring } from "@/components/academy/cobros-expiring";
import { CobrosKpiStrip } from "@/components/academy/cobros-kpis";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";

/**
 * /academia/cobros - cobros de la academia: KPIs del mes (facturado,
 * ticket, top métodos), planes por vencer y las colas operativas
 * (pagos por validar + inscripciones por transferencia). El historial
 * y la búsqueda viven en /academia/cobros/reporte (ítem propio del
 * drawer); los métodos de pago viven en configuración.
 */
export default function AcademiaCobrosPage() {
  const t = useTranslations("academyPay");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/academia"
        backLabel={t("detailBack")}
      />
      <AcademyGate>
        {({ academy }) => (
          <>
            <CobrosKpiStrip academyId={academy.id} />
            <CobrosExpiring
              key={`e-${academy.id}`}
              academyId={academy.id}
            />
            <ClaimsQueue key={`q-${academy.id}`} academyId={academy.id} />
            {/* Comprobantes de inscripciones por transferencia (spec
                subscription-manual-transfer) - cola aparte de los
                claims de pago único. */}
            <OrderClaimsQueue key={`o-${academy.id}`} academyId={academy.id} />
            {/* Tour de primera visita del módulo - las colas vacías se
                omiten solas (sus anchors no existen en el DOM). */}
            <CobrosTour />
          </>
        )}
      </AcademyGate>
    </main>
  );
}

function CobrosTour() {
  const tt = useTranslations("tours.academia-cobros");
  return (
    <OnboardingRunner
      tour="academia-cobros"
      steps={
        [
          {
            element: "[data-tour='academy-cobros-kpis']",
            title: tt("s1.title"),
            description: tt("s1.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-cobros-expiring']",
            title: tt("s2.title"),
            description: tt("s2.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-cobros-queue']",
            title: tt("s3.title"),
            description: tt("s3.desc"),
            side: "top",
          },
          {
            element: "[data-tour='academy-order-claims']",
            title: tt("s4.title"),
            description: tt("s4.desc"),
            side: "top",
          },
        ] satisfies TourStep[]
      }
    />
  );
}
